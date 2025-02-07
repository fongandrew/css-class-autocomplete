const esbuild = require('esbuild');
const glob = require('glob');
const fs = require('fs');
const path = require('path');
const plugin = require('eslint-plugin-mocha');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

const OUT_DIR = 'out';

const baseConfig = {
	bundle: true,
	external: ['vscode'],
	format: 'cjs',
	platform: 'node',
	sourcemap: true,
	plugins: [esbuildProblemMatcherPlugin],
};

const mainConfig = {
	...baseConfig,
	entryPoints: ['./src/extension.ts'],
	outfile: path.join(OUT_DIR, 'extension.js'),
	minify: process.env.NODE_ENV === 'production',
};

const testConfig = {
	...baseConfig,
	entryPoints: glob.sync('./src/**/*.test.ts'),
	outdir: OUT_DIR,
	minify: false,
};

// Delete the out directory before build
fs.rmSync(OUT_DIR, { recursive: true, force: true });

async function main() {
	let config = mainConfig;

	// Build for production
	if (process.argv.includes('--production')) {
		config ={
			...mainConfig,
			minify: true,
			sourcemap: false,
		};
	}

	// Build for test
	else if (process.argv.includes('--test')) {
		config = testConfig
	}

	const ctx = await esbuild.context(config);
	if (process.argv.includes('--watch')) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
