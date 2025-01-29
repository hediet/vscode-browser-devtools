import { ExtensionContext, window } from "vscode";
import { Disposable } from "../utils/disposables";
import { DebugSessionService } from "./debugService/DebugSessionService";
import { EdgeDevToolsPanel } from "./DevToolsPanel";
import { JsDebugSession } from "./debugService/JsDebugSupport";
import { WebSocketMessageStream } from "./vscode-utils/WebSocketMessageStream";
import { attachToDebugSession } from "./commands";
import { IObservableTreeItem, ObservableTreeDataProvider } from "./vscode-utils/ObservableTreeDataProvider";
import { derived, derivedOpts, IObservable, ObservablePromise } from "../utils/observables/observableInternal";
import { mapObservableMapCached, observableFromEvent } from "../utils/observables/observableInternal/utils";
import { compareArrays, isDefined } from "../utils/utils";
import { setTimeout } from "timers/promises";
import { ChromiumTools } from "./chromiumTools/cssSelector";
import { hotReloadExportedItem } from "@hediet/node-reload";

export class Extension extends Disposable {
    private readonly _debugSessionService = this._register(new DebugSessionService());

    private readonly _chromiumTools = hotReloadExported(ChromiumTools)
        .map(ChromiumTools => new ChromiumTools(this._debugSessionService))
        .recomputeInitiallyAndOnChange(this._store);

    constructor(context: ExtensionContext) {
        super();

        const map = mapObservableMapCached(this, this._debugSessionService.debugSessions, (s, store) => {
            const session = JsDebugSession.from(s);
            if (!session) { return undefined; }
            return ObservablePromise.fromFn(async () => {
                await setTimeout(500);
                const cdpUrl = await session.getCdpWsUrl();
                if (!cdpUrl) {
                    return undefined;
                }
                const supported = await session.supportsDevTools();
                if (!supported) {
                    return undefined;
                }
                return { session, cdpUrl };
            });
        }).recomputeInitiallyAndOnChange(this._store);

        const supportedSet = derivedOpts({ equalsFn: compareArrays() }, reader => {
            const m = map.read(reader);
            const val = [...m.values()].map(v => v?.promiseResult.read(reader)?.data).filter(isDefined);
            return val;
        });

        this._register(window.createTreeView('jsdebug-tools', {
            treeDataProvider: new ObservableTreeDataProvider(derived(reader => {
                return supportedSet.read(reader).map<IObservableTreeItem>(s => ({
                    treeItem: {
                        label: s.session.debugSession.session.name,
                        command: attachToDebugSession.toCommand({ title: 'Open Dev Tools' }, { debugSessionId: s.session.debugSession.id })
                    },
                }))
            })),
        }));

        const devToolsPanels = new Set<EdgeDevToolsPanel>();

        this._register(attachToDebugSession.register(async args => {
            const s = args?.debugSessionId !== undefined
                ? this._debugSessionService.getById(args.debugSessionId)
                : this._debugSessionService.activeSession.get();

            if (!s) { return; }
            const i = await map.get().get(s)?.promise;
            if (!i) { return; }

            const cdpConnection = await WebSocketMessageStream.connect(i.cdpUrl);
            cdpConnection.sendMessage({
                method: 'JsDebug.subscribe',
                params: {
                    events: [
                        'Runtime.*',
                        'DOM.*',
                        'CSS.*',
                        'DOMDebugger.*',
                        'Network.*',
                        'Page.*',
                        'Target.*',
                        'Overlay.*',
                    ],
                },
            });

            const id = 'debugSession-' + s.id;

            const existing = [...devToolsPanels].find(p => p.id === id);
            if (existing) {
                existing.reveal();
            } else {
                const selectedNodeId = derived(reader => new ObservablePromise(Promise.resolve(this._chromiumTools.read(reader).getState(s, reader))))
                    .map((v, reader) => v.promiseResult.read(reader)?.data?.selectedNodeId.read(reader));

                const panel = new EdgeDevToolsPanel(context, cdpConnection, id, () => {
                    devToolsPanels.delete(panel);
                }, selectedNodeId);
                devToolsPanels.add(panel);
            }
        }));
    }
}

function hotReloadExported<T>(item: T): IObservable<T> {
    let lastVal = item;
    return observableFromEvent(cb => {
        let isFirst = true;
        return hotReloadExportedItem(item, i => {
            lastVal = i;
            if (!isFirst) {
                cb(undefined);
            } else {
                isFirst = false;
            }
            return undefined;
        });
    }, () => lastVal);
}
