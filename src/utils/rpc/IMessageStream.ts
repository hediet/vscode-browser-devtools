import { IDisposable } from "../../utils/disposables";

export interface IMessageStream<TIncoming = unknown, TOutgoing = TIncoming> extends IDisposable {
    /** Clears the last listener. */
    setListener(listener: (message: TIncoming) => void): void;
    sendMessage(message: TOutgoing): void;
}

export function logMessageStream<TIncoming, TOutgoing>(stream: IMessageStream<TIncoming, TOutgoing>): IMessageStream<TIncoming, TOutgoing> {
    return {
        sendMessage: message => {
            console.log('sending message', JSON.stringify(message));
            stream.sendMessage(message);
        },
        setListener: listener => {
            console.log('setting listener');
            stream.setListener(message => {
                console.log('received message', JSON.stringify(message));
                listener(message);
            });
        },
        dispose: () => {
            console.log('disposing');
            stream.dispose();
        }
    };
}

export abstract class BufferingMessageStream<TIncoming = unknown, TOutgoing = TIncoming> implements IMessageStream<TIncoming, TOutgoing> {
    private _listener: ((message: TIncoming) => void) | undefined;
    private _buffer: TIncoming[] = [];

    abstract sendMessage(message: TOutgoing): void;

    protected _handleIncomingMessage(message: TIncoming): void {
        if (this._listener) {
            this._listener(message);
        } else {
            this._buffer.push(message);
        }
    }

    setListener(listener: (message: TIncoming) => void): void {
        this._listener = listener;
        for (const message of this._buffer) {
            listener(message);
        }
        this._buffer.length = 0;
    }

    dispose(): void {
        this._listener = undefined;
        this._buffer.length = 0;
    }
}

export function messageStreamWithIncomingBuffer<TIncoming, TOutgoing>(stream: IMessageStream<TIncoming, TOutgoing>): IMessageStream<TIncoming, TOutgoing> {
    const buffer: TIncoming[] = [];
    let listener: ((message: TIncoming) => void) | undefined;

    stream.setListener(m => {
        if (listener) {
            listener(m);
        } else {
            buffer.push(m);
        }
    });

    return {
        sendMessage: stream.sendMessage,
        setListener: l => {
            listener = l;
            for (const m of buffer) {
                listener(m);
            }
            buffer.length = 0;
        },
        dispose: () => {
            buffer.length = 0;
            listener = undefined;
        }
    };
}

export type MessageSide = Record<string, (...args: any[]) => void>;

export type MessageApi = {
    host: MessageSide;
    client: MessageSide;
}

export interface IMessage {
    method: string;
    args: unknown[];
}

export class SimpleTypedMessageConnection<T extends MessageSide> {
    public static createHost<T extends MessageApi>(stream: IMessageStream, handler: T['host']): SimpleTypedMessageConnection<T['client']> {
        return new SimpleTypedMessageConnection(stream, handler);
    }

    public static createClient<T extends MessageApi>(stream: IMessageStream, handler: T['client']): SimpleTypedMessageConnection<T['host']> {
        return new SimpleTypedMessageConnection(stream, handler);
    }

    private constructor(
        private readonly _stream: IMessageStream,
        private readonly _handler: MessageSide,
    ) {
        this.api = new Proxy({}, {
            get: (target, key: string) => {
                return (...args: any[]) => {
                    this._stream.sendMessage({ method: key, args });
                }
            }
        }) as T;

        this._stream.setListener((message: any) => { //TODO
            if (message.method in this._handler) {
                this._handler[message.method](...message.args);
            }
        });
    }

    public readonly api: T;
}
