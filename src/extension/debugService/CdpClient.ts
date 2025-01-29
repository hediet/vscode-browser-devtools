import { WebSocket } from "ws";
import { IDisposable } from "../../utils/disposables";
import { Validator } from "../../utils/Validator";
import { JsDebugSession } from "./JsDebugSupport";
import { Event } from "vscode";
import { ProtocolMapping } from "devtools-protocol/types/protocol-mapping";


export class CdpClient implements IDisposable {
    public static async connectToSession(session: JsDebugSession): Promise<CdpClient | undefined> {
        const addr = await session.getCdpWsUrl();
        if (!addr) {
            return undefined;
        }
        return await CdpClient.connectToAddress(addr);
    }

    public static async connectToAddress(address: string): Promise<CdpClient> {
        const webSocket = new WebSocket(address);
        await new Promise<void>((resolve) => {
            webSocket.on('open', async () => {
                resolve();
            });
        });
        return new CdpClient(webSocket);
    }

    private _lastMessageId = 0;
    private readonly _pendingRequests: Map<MessageId, {
        resolve: (result: unknown) => void;
        reject: (err: Error) => void;
    }> = new Map();
    private readonly _subscriptions: Map<string, SubscriptionCallback[]> = new Map();

    constructor(private readonly _ws: WebSocket) {
        this._ws.on('message', (d) => {
            const message = d.toString();
            const json = JSON.parse(message);
            const response = json as ProtocolMessage;

            if (response.id === undefined) {
                const event = response as ICdpEvent;
                const callbacks = this._subscriptions.get(event.method) || [];
                for (const callback of callbacks) {
                    callback(event.params);
                }
            } else {
                const r = response as ICdpResponse;
                const pendingRequest = this._pendingRequests.get(r.id);
                if (!pendingRequest) {
                    return;
                }
                this._pendingRequests.delete(r.id);
                if ('error' in r) {
                    pendingRequest.reject(new Error(JSON.stringify(r.error)));
                } else if ('result' in r) {
                    pendingRequest.resolve(r.result);
                }
            }
        });
    }

    dispose(): void {
        this._ws.close();
    }

    public async requestUntyped(domain: string, method: string, params?: Record<string, unknown>): Promise<unknown> {
        return await this._send(`${domain}.${method}`, params);
    }

    public async request<TMethod extends keyof ProtocolMapping.Commands>(method: TMethod, ...params: ProtocolMapping.Commands[TMethod]['paramsType']): Promise<ProtocolMapping.Commands[TMethod]['returnType']> {
        const result = await this._send(method, (params as any)[0]);
        return result as any;
    }

    private readonly _onBindingCalled: Event<{ name: string; payload: string; }> = listener => {
        return this.subscribe('Runtime', 'bindingCalled', (data) => {
            listener({ name: data.name as string, payload: data.payload as string });
        });
    };

    public async addBinding(bindingName: string, onBindingCalled: (data: string) => void): Promise<void>;
    public async addBinding<T>(binding: Binding<string, T>, onBindingCalled: (data: T) => void): Promise<void>;
    public async addBinding(bindingName: string | Binding<string, any>, onBindingCalled: (data: string | any) => void): Promise<void> {
        if (bindingName instanceof Binding) {
            const binding = bindingName;
            bindingName = binding.name;
            const callback = onBindingCalled;
            onBindingCalled = dataStr => {
                let data;
                try {
                    data = JSON.parse(dataStr);
                } catch (e) {
                    console.error(`Could not parse JSON data received for binding ${bindingName}: ${JSON.stringify(dataStr)}`);
                    data = undefined;
                }
                if (!binding.validator(data)) {
                    console.error(`Invalid data received for binding ${bindingName}: ${JSON.stringify(data, undefined, 4)}`);
                }
                callback(data);
            }
        }

        await this.request('Runtime.addBinding', { name: bindingName });
        this._onBindingCalled(e => {
            if (e.name === bindingName) {
                onBindingCalled(e.payload);
            }
        });
    }

    public subscribe(domain: string, event: string, callback: SubscriptionCallback): IDisposable {
        const domainAndEvent = `${domain}.${event}`;

        let subscriptions = this._subscriptions.get(domainAndEvent);
        if (!subscriptions) {
            subscriptions = [];
            this._subscriptions.set(domainAndEvent, subscriptions);
        }
        subscriptions.push(callback);
        if (subscriptions.length === 1) {
            this.requestUntyped('JsDebug', 'subscribe', { events: [`${domain}.${event}`] });
        }

        return {
            dispose: () => {
                const callbacks = this._subscriptions.get(domainAndEvent);
                if (!callbacks) {
                    return;
                }

                const index = callbacks.indexOf(callback);
                if (index !== -1) {
                    callbacks.splice(index, 1);
                }
            }
        };
    }

    private async _send(method: string, params?: Record<string, unknown>): Promise<unknown> {
        const messageId = 'cdpClient' + (++this._lastMessageId);
        return new Promise((resolve, reject) => {
            this._pendingRequests.set(messageId, { resolve, reject, });

            const message = { id: messageId, method, params, };
            const json = JSON.stringify(message);
            this._ws.send(json);
        });
    }
}

export class Binding<TName extends string, T> {
    private readonly T: T = undefined!;

    public readonly TRuntimeGlobalThis: { [TKey in TName]: (jsonData: string) => void } = undefined!;

    constructor(
        public readonly name: TName,
        public readonly validator: Validator<T>,
    ) { }

    public getFunctionValue(): string {
        return `function (data) { globalThis[${JSON.stringify(this.name)}](JSON.stringify(data)); }`;
    }

    public readonly TFunctionValue: (data: T) => void = undefined!;
}

type SubscriptionCallback = (data: Record<string, unknown>) => void;
type MessageId = string;
type ProtocolMessage = ICdpEvent | ICdpResponse;
type ICdpResponse = ICdpErrorResponse | ICdpSuccessResponse;
interface ICdpEvent {
    id?: MessageId;
    method: string;
    params: Record<string, unknown>;
    sessionId?: string;
}
interface ICdpErrorResponse {
    id: MessageId;
    method?: string;
    error: { code: number; message: string; };
    sessionId?: string;
}
interface ICdpSuccessResponse {
    id: MessageId;
    result: Record<string, unknown>;
    sessionId?: string;
}
