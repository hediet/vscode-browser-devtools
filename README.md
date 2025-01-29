# Browser Dev Tools

[Based on the Edge DevTools VS Code extension](https://github.com/microsoft/vscode-edge-devtools), but
* with minimalistic UI
* needs an edge/chrome/electron debug session that it connects to
    * (no headless edge process)
* auto-discovery of supported debug sessions
* auto-reveal of source code css selectors in Dev Tools

## Features

* Open Edge DevTools for any webpage/electron window that is currently debugged
    * To open, go to the "Browser Debug Tools" view in the "Run And Debug" sidebar
* Reveal element in DevTools when cursor is at a CSS selector (configurable)

![demo](docs/demo-codeoss.gif)
