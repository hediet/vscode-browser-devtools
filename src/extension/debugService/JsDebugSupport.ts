import { commands } from "vscode";
import { Disposable } from "../../utils/disposables";
import { DebugSessionProxy } from "./DebugSessionService";
import { CdpClient } from "./CdpClient";

export class JsDebugSession extends Disposable {
    private static readonly _debugSessions = new Map<DebugSessionProxy, JsDebugSession>();

    public static from(debugSession: DebugSessionProxy): JsDebugSession | undefined {
        // https://github.com/microsoft/vscode-js-debug/blob/2152210dc7c3933e2b4ef7c72d72cf2fef765760/src/common/contributionUtils.ts#L65
        const supportedSessionTypes = [
            'pwa-extensionHost',
            'node-terminal',
            'pwa-node',
            'pwa-chrome',
            'pwa-msedge',
            'chrome',
            'msedge',
        ];

        if (!supportedSessionTypes.includes(debugSession.session.type)) {
            return undefined;
        }

        let jsDebugSession = this._debugSessions.get(debugSession);
        if (!jsDebugSession) {
            jsDebugSession = new JsDebugSession(debugSession);
            this._debugSessions.set(debugSession, jsDebugSession);
            debugSession.onDidTerminate(() => {
                jsDebugSession!.dispose();
                return this._debugSessions.delete(debugSession);
            });
        }

        return jsDebugSession;
    }

    //private _cdpInitializationPromise: Promise<CdpClient | undefined> | undefined = undefined;

    constructor(
        public readonly debugSession: DebugSessionProxy
    ) {
        super();
    }

    getCdpWsUrl(): Promise<string | undefined> {
        return getWsAddress(this.debugSession.session.id);
    }

    supportsDevTools(): Promise<boolean> {
        return this._supportsDevTools.value;
    }

    private readonly _supportsDevTools = new Lazy(async () => {
        const url = await this.getCdpWsUrl();
        if (!url) { return false; }
        try {
            const client = await CdpClient.connectToAddress(url);
            try {
                await client.request('Page.enable');
                return true;
            } finally {
                client.dispose();
            }
        } catch (e) {
            return false;
        }
    });

    /*
        public getCdpClient(): Promise<CdpClient | undefined> {
            this.checkCdp();
            return this._cdpInitializationPromise!;
        }
    
        private async checkCdp(): Promise<void> {
            const client = await this._cdpInitializationPromise;
            if (!client) {
                this._cdpInitializationPromise = this._initCdpProxy();
                await this._cdpInitializationPromise;
            }
        }
    
        private async _initCdpProxy(): Promise<CdpClient | undefined> {
            const client = await CdpClient.connectToSession(this);
            if (!client) { return undefined; }
            this._registerOrDispose(client);
            return client;
        }*/
}

export async function getWsAddress(debugSessionId: string): Promise<string | undefined> {
    const data = await commands.executeCommand(
        'extension.js-debug.requestCDPProxy',
        debugSessionId
    ) as { host: string; port: number; path: string; } | undefined;
    if (!data) {
        return undefined;
    }
    const addr = `ws://${data.host}:${data.port}${data.path || ''}`;
    return addr;
}

class Lazy<T> {
    private _hasValue = false;
    private _value: T | undefined = undefined;

    constructor(private readonly _getValue: () => T) { }

    get value(): T {
        if (!this._hasValue) {
            this._value = this._getValue();
            this._hasValue = true;
        }

        return this._value!;
    }
}
