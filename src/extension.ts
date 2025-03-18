import * as vscode from 'vscode';
import * as fs from 'fs';

// Regex for unmatched single or double quotes. This matchds
// - Everything up to an unmatched quote
// - OR the entire string if all quotes are matched
const UP_TO_UNMATCHED_QUOTE_REGEX = /^(?:[^'"]*(?:"[^"]*"|'[^']*'))*[^'"]*(?=['"']|$)/;

// Regex to see if string ends with attribute
const ENDS_WITH_ATTR_REGEX = /([\w:-]+)=$/;

// Regex to get all parens (plus associated function call)
const PARENS_REGEX = /([\w$]*\(|\))/g;

// Default number of lines to look back for matching JSX attributes or function calls
const MAX_LOOKBACK_LINES = 10;

// Regex for CSS classnames
const CLASS_REGEX = /\.([a-zA-Z][a-zA-Z0-9_-]*)/g;

export interface FileSystem {
	readFile(
		...args: Parameters<typeof fs.promises.readFile>
	): ReturnType<typeof fs.promises.readFile>;
}

export class DefaultFileSystem implements FileSystem {
	readFile(
		...args: Parameters<typeof fs.promises.readFile>
	): ReturnType<typeof fs.promises.readFile> {
		return fs.promises.readFile(...args);
	}
}

export class CssClassExtractor {
	// Classes by filename
	private cssClassesByFile = new Map<string, Set<string>>();

	constructor(private fileSystem: FileSystem = new DefaultFileSystem()) {}

	extractClassNames(content: string): string[] {
		const matches = content.match(CLASS_REGEX) || [];
		return matches.map((match) => match.substring(1));
	}

	async updateCssClassesForFile(filePath: string): Promise<void> {
		try {
			const content = await this.fileSystem.readFile(filePath, 'utf-8');
			const classNames = this.extractClassNames(String(content));
			const classSet = new Set(classNames);
			// Delete first to update ordering in map
			this.cssClassesByFile.delete(filePath);
			this.cssClassesByFile.set(filePath, classSet);
		} catch (error) {
			console.error(`Error reading file ${filePath}:`, error);
		}
	}

	async removeCssClassesForFile(filePath: string): Promise<void> {
		this.cssClassesByFile.delete(filePath);
	}

	items() {
		// Reverse keys in class list so most recently edited CSS results get priority
		const files = Array.from(this.cssClassesByFile.keys()).reverse();

		// Populate result list
		const cssClasses = new Set<string>();
		for (const file of files) {
			const classes = this.cssClassesByFile.get(file);
			if (!classes) continue;
			for (const className of classes) {
				cssClasses.add(className);
			}
		}

		return Array.from(cssClasses);
	}

	reset() {
		this.cssClassesByFile.clear();
	}
}

export function activate(context: vscode.ExtensionContext) {
	// Map of CSS classes by file
	const cssClassExtractor = new CssClassExtractor();

	// Track current providers for disposal
	let currentProviders: vscode.Disposable[] = [];

	/**
	 * Setup completion providers with current configuration
	 */
	function setupProviders(context: vscode.ExtensionContext, triggerChars: string[]) {
		// Dispose of existing providers
		currentProviders.forEach((provider) => provider.dispose());
		currentProviders = [];

		// Get configuration
		const config = vscode.workspace.getConfiguration('cssClassAutocomplete');
		const attributes = config.get<string[]>('attributes') ?? [];
		const functionNames = config.get<string[]>('functionNames') ?? [];

		// Register JSX/TSX provider
		const jsxProvider = vscode.languages.registerCompletionItemProvider(
			['javascriptreact', 'typescriptreact'],
			new CssClassCompletionProvider(cssClassExtractor, {
				attrs: attributes,
				fns: functionNames,
				quote: true,
			}),
			...triggerChars,
		);
		currentProviders.push(jsxProvider);
		context.subscriptions.push(jsxProvider);

		// Register HTML provider
		const htmlProvider = vscode.languages.registerCompletionItemProvider(
			['html'],
			new CssClassCompletionProvider(cssClassExtractor, { attrs: attributes }),
			...triggerChars,
			// HTML can be triggered by `=` (no quotes required)
			'=',
		);
		currentProviders.push(htmlProvider);
		context.subscriptions.push(htmlProvider);
	}

	/**
	 * Set up file watchers for CSS files
	 */
	// Track current watchers for disposal
	let currentWatchers: vscode.FileSystemWatcher[] = [];

	async function setupCssFileWatchers(context: vscode.ExtensionContext) {
		// Dispose of existing watchers
		currentWatchers.forEach((watcher) => watcher.dispose());
		currentWatchers = [];

		const config = vscode.workspace.getConfiguration('cssClassAutocomplete');
		const patterns = config.get<string[]>('styleFilePatterns') ?? [];

		// Create a watcher for each pattern
		patterns.forEach((pattern) => {
			const watcher = vscode.workspace.createFileSystemWatcher(pattern);
			watcher.onDidChange((uri) => cssClassExtractor.updateCssClassesForFile(uri.fsPath));
			watcher.onDidCreate((uri) => cssClassExtractor.updateCssClassesForFile(uri.fsPath));
			watcher.onDidDelete((uri) => cssClassExtractor.removeCssClassesForFile(uri.fsPath));
			currentWatchers.push(watcher);
			context.subscriptions.push(watcher);
		});

		// Do initial scan
		cssClassExtractor.reset();

		// Find all matching style files
		const styleFiles = await Promise.all(
			patterns.map((pattern) => vscode.workspace.findFiles(pattern)),
		);

		// Flatten array of arrays and process each file
		for (const file of styleFiles.flat()) {
			await cssClassExtractor.updateCssClassesForFile(file.fsPath);
		}
	}

	const triggerChars = ['"', "'", ' ', '-', '_'];

	// Setup initial providers
	setupProviders(context, triggerChars);
	setupCssFileWatchers(context);

	// Watch for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('cssClassAutocomplete')) {
				setupProviders(context, triggerChars);
				if (e.affectsConfiguration('cssClassAutocomplete.styleFilePatterns')) {
					setupCssFileWatchers(context);
				}
			}
		}),
	);
}

export class CssClassCompletionProvider implements vscode.CompletionItemProvider {
	constructor(
		protected cssClassExtractor: CssClassExtractor,
		protected opts: {
			/** Require we're in an unquoted string */
			quote?: boolean;
			/** Attribute names that trigger completion */
			attrs?: string[];
			/** Function names that trigger completion */
			fns?: string[];
		} = {},
	) {}

	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): Promise<vscode.CompletionItem[] | undefined> {
		if (!this.isInContext(document, position)) {
			return;
		}

		// Get all class names
		const allClasses = this.cssClassExtractor.items();

		// Convert extractor classes to completion item form
		return allClasses.map((className) => {
			const item = new vscode.CompletionItem(className, vscode.CompletionItemKind.Value);
			item.detail = 'CSS class';

			// Set filter text to enable VSCode's native filtering
			item.filterText = className;

			// For word replacement - this will be used when triggered with - or _
			const wordRange = document.getWordRangeAtPosition(position, /[\w_-]+/);
			if (wordRange) {
				item.range = wordRange;
			}

			return item;
		});
	}

	/**
	 * Check if the current position is inside a JSX attribute or matching function call
	 */
	private isInContext(document: vscode.TextDocument, position: vscode.Position): boolean {
		let lineContent = document.lineAt(position).text.substring(0, position.character);

		// We assume class name is in a single or double quote. We don't autocomplete
		// in backtick quotes because interpolation + autocomplete is weird.
		const beforeOpenQuote = UP_TO_UNMATCHED_QUOTE_REGEX.exec(lineContent);
		if (
			!beforeOpenQuote ||
			(this.opts.quote && beforeOpenQuote[0]?.length === lineContent.length)
		) {
			return false;
		} else {
			lineContent = beforeOpenQuote[0];
		}

		// Check if this of the form `class="`
		const attrs = this.opts.attrs;
		if (attrs?.length) {
			const attrMatch = ENDS_WITH_ATTR_REGEX.exec(lineContent);
			if (attrMatch) {
				return attrs.includes(attrMatch[1]);
			}
		}

		// Only check fn parens if needed (JSX/TSX)
		const fns = this.opts.fns;
		if (!fns?.length) {
			return false;
		}

		// Loop and do this for the preceding lines up to MAX_LOOKBACK_LINES
		let i = 0;
		// See negativeStack below
		let priorStack: string[] = [];
		do {
			// Two stacks - Left parens add to the stack, right parens pop from the stack
			// If we find a right parens and there's nothing in the stack, we add it to
			// the negative stack (which becomes the prior stack on the next run)
			const parensStack: string[] = [];
			const negativeParensStack: string[] = [];
			let match: RegExpExecArray | null;
			while ((match = PARENS_REGEX.exec(lineContent))) {
				const parens = match[0];
				if (parens.endsWith('(')) {
					parensStack.push(parens);
				} else if (parens === ')') {
					if (parensStack.length) {
						parensStack.pop();
					} else {
						negativeParensStack.push(parens);
					}
				}
			}

			// These should all be closing parens
			for (const parens of priorStack) {
				if (parensStack.length) {
					parensStack.pop();
				} else {
					negativeParensStack.push(parens);
				}
			}

			if (parensStack.length) {
				return fns.includes(parensStack[parensStack.length - 1].slice(0, -1));
			}

			priorStack = negativeParensStack;
		} while (
			(() => {
				i++;
				if (i >= MAX_LOOKBACK_LINES) return false;
				const lineNum = position.line - i;
				if (lineNum < 0) return false;
				lineContent = document.lineAt(lineNum).text;
				return true;
			})()
		);
		return false;
	}
}

export function deactivate() {
	// Nothing to do
}
