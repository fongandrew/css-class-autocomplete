# CSS Class Autocomplete for HTML/JSX/TSX

This is a Visual Studio Code extension that provides autocompletion for CSS class names in HTML, JSX, and TSX files. It automatically scans your project's CSS files and suggests class names as you type.

## Installation

Install from https://marketplace.visualstudio.com/items?itemName=fongandrew.css-class-autocomplete

Or install manually:

- Download VSIX file from https://github.com/fongandrew/css-class-autocomplete/releases
- Select `Install from VSIX` from the VS Code command palette.

## How It Works

It's pretty basic:

- CSS files in your project are scanned for classes via regex (basically anything starting with `.`). Although this extension can look into SCSS
files, it isn't capable of handling things like interpolated class names.
- Autocomplete works in HTML, JSX, and TSX files. It doesn't rely on an
AST or language server or anything fancy, just a bunch of regexes that
look to see if you're in an open quote (`'` or `"` only, interpolated
backtick quotes don't work) and if you're either assinging to an
element attribute like `class="` or a specified function like `clsx('`.

## Extension Settings

This extension can br configured via the following settings:

* `cssClassAutocomplete.attributes`: Array of HTML/JSX attributes that trigger CSS class name autocomplete
  - Default: `["className", "class", "class:list", "classList", "ngClass"]`
* `cssClassAutocomplete.functionNames`: Array of function names that trigger CSS class name autocomplete
  - Default: `["cn", "cx", "clsx", "classNames"]`
* `cssClassAutocomplete.styleFilePatterns`: Array of file patterns to watch for CSS class names
  - Default: `["**/*.{css,less,scss}"]`
  - This extension doesn't directly support exclusion lists at this time. If
  you need this, consider adding to your `files.watcherExclude` or
  `files.exclude` settings in VSCode itself.

## Usage

It's a pretty basic extension.

1. The extension will automatically scan your style files for class names via regex (basically anything starting with `.`). Although this extension can look into SCSS files, it isn't capable of handling things like interpolated class names.
2. In HTML files, type a class attribute: `class="`. In JSX/TSX files, use className or other configured attributes: `className="`. Inside the quotes (`'` or `"` only -- backtick interpolation isn't supported), the extension will suggest available class names from your style files.
3. You can also use it with utility functions like `clsx` or `classNames`.

It doesn't rely on an AST or language server or anything fancy, just a bunch of regexes. It's likely there are a bunch of edge cases from this, but it mostly works.

## Known Issues

This extension does not place nicely with `html.autoCreateQuotes`. If it's an issue, you can just set this to false or retype the quotation marks to trigger the extension.
