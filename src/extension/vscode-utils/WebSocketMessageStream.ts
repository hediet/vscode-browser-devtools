import { BufferingMessageStream } from "../../utils/rpc/IMessageStream";
import { WebSocket } from "ws";

export class WebSocketMessageStream extends BufferingMessageStream {
    public static connect(url: string): Promise<WebSocketMessageStream> {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url);
            ws.onopen = () => {
                resolve(new WebSocketMessageStream(url, ws));
            };
            ws.onerror = (e) => {
                reject(e);
            };
        });
    }

    private constructor(
        public readonly url: string,
        private readonly _ws: WebSocket,
    ) {
        super();

        _ws.onmessage = (e) => {
            this._handleIncomingMessage(JSON.parse(String(e.data)));
        }
    }

    override sendMessage(message: unknown): void {
        this._ws.send(JSON.stringify(message));
    }

    override dispose(): void {
        super.dispose();
    }
}
