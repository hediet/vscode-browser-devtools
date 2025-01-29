import { IMessageStream } from '../utils/rpc/IMessageStream';

declare const acquireVsCodeApi: () => { postMessage(message: unknown, args?: any | undefined): void; };

export function createMessageStreamToVsCodeHost(): IMessageStream {
    const api = acquireVsCodeApi();
    let listener: ((message: unknown) => void) | undefined = undefined;
    window.addEventListener('message', messageEvent => {
        const fromExtension = messageEvent.origin.startsWith('vscode-webview://');
        if (fromExtension && listener) {
            listener(messageEvent.data);
        }
    });
    return {
        sendMessage: message => api.postMessage(message, '*'),
        setListener: newListener => {
            listener = newListener;
        },
        dispose: () => { },
    };
}
