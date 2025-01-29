import { Webview } from "vscode";
import { IMessageStream } from "../../utils/rpc/IMessageStream";
import { DisposableStore } from "../../utils/disposables";

export function createMessageStreamFromWebview(webview: Webview): IMessageStream {
    const store = new DisposableStore();
    return {
        sendMessage: message => {
            webview.postMessage(message);
        },
        setListener: listener => {
            store.add(webview.onDidReceiveMessage(e => listener(e)));
        },
        dispose: () => {
            store.dispose();
        }
    };
}
