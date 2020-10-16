# wasp README

This is the README for your extension "wasp". After writing up a brief description, we recommend including the following sections.

## Developing (by Martin)
- Main guide: https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide
- This is a great guide with an example we go through: https://gist.github.com/Aerijo/b8c82d647db783187804e86fa0a604a1 .
- This is also a good list of tricks and traps: https://www.apeth.com/nonblog/stories/textmatebundle.html .
- We write grammar in syntaxes/wasp.tmLanguage.yaml and then use `npm run build` to generate .json from it.
  .json is for now still in git, figure out if that makes sense or not.
- To debug / try out:
  - Open this project as directory via vscode and press "F5".
    This will open new vscode window which has the extension loaded and we can try it out there.
    Open some .wasp file in that window to test how extension works.
  - In this secondary window, we can run 'Developer: Inspect Editor Tokens and Scopes' from Command Palette and it will show us how is file tokenized!

## Features

Describe specific features of your extension including screenshots of your extension in action. Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: enable/disable this extension
* `myExtension.thing`: set to `blah` to do something

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

-----------------------------------------------------------------------------------------------------------

## Working with Markdown

**Note:** You can author your README using Visual Studio Code.  Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux)
* Toggle preview (`Shift+CMD+V` on macOS or `Shift+Ctrl+V` on Windows and Linux)
* Press `Ctrl+Space` (Windows, Linux) or `Cmd+Space` (macOS) to see a list of Markdown snippets

### For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
