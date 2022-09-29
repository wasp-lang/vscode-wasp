# VS Code Wasp language extension

This is a Visual Studio Code language extension for [wasp](https://wasp-lang.dev) language!

## Features

Features:
- Syntax highlighting for `.wasp` files
- Snippets for `.wasp` files
- Wasp language server
  - live reporting of compilation errors
  - autocompletion

## Requirements

Wasp language extension requires you only to have `wasp` installed on your machine and available in PATH,
which you almost certainly already have if you are developing in wasp.
If not, [check installation instruction here](https://wasp-lang.dev/docs).

## Development (for contributors)
### Resources
- Official vscode doc: https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide .
- Great tutorial with practical examples: https://gist.github.com/Aerijo/b8c82d647db783187804e86fa0a604a1 .
- Somewhat more theoretical guide of TextMate grammar: https://www.apeth.com/nonblog/stories/textmatebundle.html .

### Setup
Run `npm install`.

### Workflow

Main extension logic is implemented in `src/extension.ts`.
NOTE: VSCode needs .js, not .ts, so make sure to run `npm run build` when you do changes.

Grammar (used for syntax highlighting) is defined in `syntaxes/wasp.tmLanguage.yaml`.
NOTE: VSCode needs .json, not .yaml, so make sure to run `npm run build` when you do changes.

`package.json` is also important -> besides general settings, we also define embedded languages and extension dependencies there.

0. Build your latest code with `npm run build`. This will compile Typescript to Javascript, compile `syntaxes/*.yaml` to .json, and package it all.
1. Open root dir of this project with VSCode.
2. Run F5 -> this will start another, "testing" window with extension loaded and working.
3. In "testing" window: open some .wasp file to see how extension works.
4. Modify extension source with new changes (most likely `syntaxes/wasp.tmLanguage.yaml` or `src/extension.ts`)
   and run `npm run build` to regenerate files.
5. In "testing" window: run "Reload Window" command to load updated version of extension.
6. In "testing" window: while inspecting .wasp file to see how extension works, you can
   run "Developer: Inspect Editor Tokens and Scopes" command to get a popup for each token showing
   how it got clasified/scoped by extension -> this is great for figuring out if extension does what it should do,
   which is at the end, applying correct scopes.
7. To see the output produced by `outputChannel.appendLine(...)`, open the `Output` tab in VS Code
   and select _Wasp Language Server_ from the dropdown menu in the upper-right corner. This is useful for debugging.
8. Repeat step 4.

You can also use `npm run watch` to automatically recompile on changes - but keep in mind, this doesn't automatically recompile `syntaxes/*.yaml` to .json, for that you will have to re-run `npm run watch` or run `npm run build`.

NOTE: Internally, in package.json, we use `es-build` to compile Typescript to Javascript and to then package it all into one .js file (which means it takes our source .js files, the ones we generated from .ts, and combines them together with deps from node_modules into a single .js file). We could have just used `tsc` (Typescript compiler) to compile TS to JS, but it doesn't do the bundling part, which is recommended by VSCode.

### Publish
Make sure you have `vsce` installed: `npm -g install vsce`.

Next, make sure you are logged in with the publisher.
If you are not logged in yet, you can log in with `vsce login wasp-lang`.

To package the extension into a .vsix file, run `vsce package`.

NOTE: .vscodeignore file determines which files are ommited/ignored when constructing a package, so make sure to update it if there are some new build artefacts or some other files that we don't want included in the final package.

To package and then publish the extension, run `vsce publish`.
