import { BufferingMessageStream } from '../utils/rpc/IMessageStream';

export interface WindowLike {
    postMessage(data: any, ...misc: any[]): void;
    addEventListener(
        ev: "message",
        handler: (ev: { data: any; source: WindowLike | undefined; }) => void
    ): void;
}

export class WindowLikeStream<TIncoming = unknown, TOutgoing = TIncoming> extends BufferingMessageStream<TIncoming, TOutgoing> {
    constructor(
        private readonly source: WindowLike,
        private readonly target: WindowLike
    ) {
        super();

        this.source.addEventListener("message", (message) => {
            if (message.source !== this.target) {
                return;
            }
            if (typeof message.data === "object") {
                this._handleIncomingMessage(message.data);
            }
        });
    }

    public override sendMessage(message: TOutgoing): void {
        this.target.postMessage(message, "*");
    }
}
