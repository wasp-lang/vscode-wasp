# VS Code Wasp language extension

This is a Visual Studio Code language extension for [wasp](https://wasp-lang.dev) language!

## Features

For now, only feature is syntax highlighting of .wasp files.

## Development (for contributors)
### Resources
- Official vscode doc: https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide .
- Great tutorial with practical examples: https://gist.github.com/Aerijo/b8c82d647db783187804e86fa0a604a1 .
- Somewhat more theoretical guide of TextMate grammar: https://www.apeth.com/nonblog/stories/textmatebundle.html .

### Workflow
Grammar is defined in `syntaxes/wasp.tmLanguage.yaml`, and you do most of the changes there.

VSCode needs .json, not .yaml -> use `npm run build` to generate .json from .yaml.

`package.json` is also important -> besides general settings, we also define embedded languages and extension dependencies there.

1. Open root dir of this project with VSCode.
2. Run F5 -> this will start another, "testing" window with extension loaded and working.
3. In "testing" window: open some .wasp file to see how extension works.
4. Modify extension source with new changes (most likely `syntaxes/wasp.tmLanguage.yaml`)
   and run `npm run build` to regenerate .json.
5. In "testing" window: run "Reload Window" command to load updated version of extension.
6. In "testing" window: while inspecting .wasp file to see how extension works, you can
   run "Developer: Inspect Editor Tokens and Scopes" command to get a popup for each token showing
   how it got clasified/scoped by extension -> this is great for figuring out if extension does what it should do,
   which is at the end, applying correct scopes.
7. Repeat step 4.

### Publish
Make sure you have `vsce` installed: `npm -g install vsce`.

Next, make sure you are logged in with the publisher.
If you are not logged in yet, you can log in with `vsce login wasp-lang`.

To package the extension into a .vsix file, run `vsce package`.

To package and then publish the extension, run `vsce publish`.
