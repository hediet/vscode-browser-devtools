import { join } from "path";
import { ExtensionContext, window, ViewColumn, Uri, ColorThemeKind } from "vscode";
import { Disposable } from "../utils/disposables";
import { IMessageStream, SimpleTypedMessageConnection } from "../utils/rpc/IMessageStream";
import { DevToolsPaneApi } from "../common/api";
import { createMessageStreamFromWebview } from "./vscode-utils/createMessageStreamFromWebview";
import { autorun, derived, IObservable, observableFromEvent } from "../utils/observables/observableInternal";
import { observableFromConfig } from "./vscode-utils/observableFromSetting";

export abstract class DevToolsPanel extends Disposable {
}

export class EdgeDevToolsPanel extends DevToolsPanel {
    private readonly _panel = window.createWebviewPanel('jsdebug-tools', 'Dev Tools', { viewColumn: ViewColumn.Beside }, {
        enableScripts: true,
        retainContextWhenHidden: true,
    });

    constructor(
        private readonly _context: ExtensionContext,
        private readonly _cdpConnection: IMessageStream,
        public readonly id: string,
        public readonly _onDispose: () => void,
        private readonly _selectedNodeId: IObservable<number | undefined>,
    ) {
        super();

        this._register(_cdpConnection);

        const webViewMessageStream = createMessageStreamFromWebview(this._panel.webview);
        const webViewConn = SimpleTypedMessageConnection.createHost<DevToolsPaneApi>(webViewMessageStream, {
            initialized: () => {
                this._cdpConnection.setListener(message => {
                    webViewConn.api.handleCdpMessage(message);
                });
            },
            handleCdpMessage: message => {
                this._cdpConnection.sendMessage(JSON.parse(message));
            },
        });

        this._selectedNodeId.recomputeInitiallyAndOnChange(this._store, nodeId => {
            if (nodeId === undefined) {
                return;
            }
            webViewConn.api.handleCdpMessage({
                "method": "Overlay.nodeHighlightRequested",
                "params": { "nodeId": nodeId },
            });
        });

        this._register(autorun(reader => {
            this._panel.webview.html = this.htmlForWebview.read(reader);
        }));

        this._panel.onDidDispose(() => {
            if (!this._store.isDisposed) {
                this.dispose();
            }
        });

        this._register({
            dispose: () => {
                this._panel.dispose();
                this._onDispose();
            }
        });
    }

    private readonly _colorTheme = observableFromConfig<string>('workbench.colorTheme');
    private readonly _activeColorTheme = observableFromEvent(window.onDidChangeActiveColorTheme, () => window.activeColorTheme);

    private readonly _edgeTheme = derived(this, reader => {
        const themeSetting = this._colorTheme.read(reader)!;
        const theme = edgeDevToolsThemeByVsCodeTheme.get(themeSetting);
        if (theme) {
            return theme;
        }

        switch (this._activeColorTheme.read(reader).kind) {
            case ColorThemeKind.Light:
            case ColorThemeKind.HighContrastLight:
                return 'default';
            case ColorThemeKind.Dark:
            case ColorThemeKind.HighContrast:
                return 'dark';
            default:
                return 'systemPreferred';
        }
    });


    private readonly htmlForWebview = derived(reader => {
        /*
        const cdnBaseUri = this.config.devtoolsBaseUri || this.devtoolsBaseUri;
        const cssMirrorContent = getCSSMirrorContentEnabled(this.context);
        */

        const hostPath = Uri.file(join(this._context.extensionPath, 'build', 'js', 'host', 'host.bundle.js'));
        const hostUri = this._panel.webview.asWebviewUri(hostPath);

        const cssMirrorContent = false;
        const theme = this._edgeTheme.read(reader);

        const cdnBaseUri = 'https://devtools.azureedge.net/serve_file/@f163ae219c3b08cda5aafa6b262442715a8a9893/vscode_app.html';

        // the added fields for "Content-Security-Policy" allow resource loading for other file types
        return `
            <!doctype html>
            <html>
            <head>
                <meta http-equiv="content-type" content="text/html; charset=utf-8">
                <meta name="referrer" content="no-referrer">
                <style>
html, body, iframe {
    height: 100%;
    width: 100%;
    position: absolute;
    padding: 0;
    margin: 0;
    overflow: hidden;
}

#error-message {
    height: 100%;
    width: 100%;
    position: absolute;
    margin: 10px;
    z-index: 2;
}

#error-message.hidden {
    display: none;
}

                </style>
                <script src="${hostUri}"></script>
                <meta http-equiv="Content-Security-Policy"
                    content="default-src;
                    img-src 'self' data: ${this._panel.webview.cspSource};
                    style-src 'self' 'unsafe-inline' ${this._panel.webview.cspSource};
                    script-src 'self' 'unsafe-eval' ${this._panel.webview.cspSource};
                    frame-src 'self' ${this._panel.webview.cspSource} ${cdnBaseUri};
                    connect-src 'self' data: ${this._panel.webview.cspSource};
                ">
            </head>
            <body>
                <iframe id="devtools-frame" frameBorder="0" src="${cdnBaseUri}?experiments=true&theme=${theme}&standaloneScreencast=true&cssMirrorContent=${cssMirrorContent}"></iframe>
                <div id="error-message" class="hidden">
                    <h1>Unable to download DevTools for the current target.</h1>
                    <p>Try these troubleshooting steps:</p>
                    <ol>
                    <li>Check your network connection</li>
                    <li>Close and re-launch the DevTools</li>
                    </ol>
                    <p>If this problem continues, please <a target="_blank" href="https://github.com/microsoft/vscode-edge-devtools/issues/new?template=bug_report.md">file an issue.</a></p>
                </div>
            </body>
            </html>
            `;
    });

    public reveal() {
        this._panel.reveal();
    }
}

const edgeDevToolsThemeByVsCodeTheme = new Map<string, string>([
    ['Default Light+', 'default'],
    ['Visual Studio Light', 'default'],
    ['Default Dark+', 'dark'],
    ['Visual Studio Dark', 'dark'],
    ['System Preference', 'systemPreferred'],
    ['Dark', 'dark'],
    ['Light', 'default'],
    ['Chromium Dark', 'darkChromium'],
    ['Chromium Light', 'lightChromium'],
    ['Monokai', 'vscode-monokai'],
    ['Monokai Dimmed', 'vscode-monokai-dimmed'],
    ['Solarized Dark', 'vscode-solarized-dark'],
    ['Solarized Light', 'vscode-solarized-light'],
    ['Red', 'vscode-red'],
    ['Quiet Light', 'vscode-quietlight'],
    ['Abyss', 'vscode-abyss'],
    ['Kimbie Dark', 'vscode-kimbie-dark'],
    ['Tomorrow Night Blue', 'vscode-tomorrow-night-blue'],
]);
