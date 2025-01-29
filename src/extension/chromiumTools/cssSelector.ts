import { TextEditor, window } from "vscode";
import { DebugSessionProxy, DebugSessionService } from "../debugService/DebugSessionService";
import { autorun, derived, IReader, observableFromEvent, ObservablePromise } from "../../utils/observables/observableInternal";
import { Disposable } from "../../utils/disposables";
import { JsDebugSession } from "../debugService/JsDebugSupport";
import { observableFromConfig } from "../vscode-utils/observableFromSetting";
import { CdpClient } from "../debugService/CdpClient";
import { mapObservableMapCached } from "../../utils/observables/observableInternal/utils";

export class ChromiumTools extends Disposable {
    private readonly _currentEditor = observableFromEvent(window.onDidChangeActiveTextEditor, e => window.activeTextEditor).map(e => e ? new ObservableEditor(e) : undefined);

    private readonly _patterns = observableFromConfig<Record<string, PatternConfig>>('browser-devtools.domHighlightPatterns');

    private readonly _selectorAtCursor = derived(this, reader => {
        const e = this._currentEditor.read(reader);
        if (!e) { return undefined; }

        const pos = e.position.read(reader);
        const line = e.editor.document.lineAt(pos.line).text;
        const lineWithCursor = line.substring(0, pos.character) + '|' + line.substring(pos.character);

        const patterns = this._patterns.read(reader);
        if (!patterns) {
            return undefined;
        }

        for (const [pattern, config] of Object.entries(patterns)) {
            const regexp = new RegExp(pattern);
            const match = regexp.exec(lineWithCursor);
            if (!match) {
                continue;
            }
            const groupValue = match[1];
            if (groupValue.indexOf('|') === -1) {
                continue;
            }
            const matchedValue = groupValue.replace('|', '');
            return (config.selectorPrefix ?? '') + matchedValue;
        }

        return undefined;
    });

    constructor(
        private readonly _debugSessionService: DebugSessionService,

    ) {
        super();
    }

    private readonly _map = mapObservableMapCached(this, this._debugSessionService.debugSessions, async (session, store) => {
        const s = JsDebugSession.from(session);
        if (!s) { return; }

        await new Promise(r => setTimeout(r, 500));

        if (!await s.supportsDevTools()) {
            return;
        }

        const c = await CdpClient.connectToSession(s);
        if (!c) {
            //console.log('no cdp client');
            return;
        }

        await c.request('DOM.enable');
        await c.request('Overlay.enable');

        const selectedNodeId = derived(this, reader => {
            const selector = this._selectorAtCursor.read(reader);
            return ObservablePromise.fromFn(async () => {
                if (!selector) {
                    return undefined;
                }

                const res = await c.request('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(selector)})` });
                const targetObjId = res.result.objectId;
                if (targetObjId === undefined) {
                    return undefined;
                }
                const nodeId = await c.request('DOM.requestNode', { objectId: targetObjId });
                return nodeId.nodeId;
            }).promiseResult.map(r => r?.data);
        }).flatten().recomputeInitiallyAndOnChange(this._store);

        store.add(autorun(async reader => {
            const nodeId = selectedNodeId.read(reader);
            if (nodeId !== undefined) {
                await c.request('Overlay.highlightNode', {
                    highlightConfig: {
                        showStyles: true,
                        showInfo: true,
                        contentColor: { r: 200, g: 100, b: 100, a: 0.5 }
                    },
                    nodeId: nodeId
                });
            } else {
                await c.request('Overlay.hideHighlight');
            }
        }));

        return {
            selectedNodeId: selectedNodeId,
        };
    }).recomputeInitiallyAndOnChange(this._store);

    public getState(session: DebugSessionProxy, reader: IReader | undefined) {
        const p = this._map.read(reader).get(session);
        return p;
    }
}

interface PatternConfig {
    filePatterns?: string[];
    selectorPrefix?: string;
    languageIds?: string[];
}

class ObservableEditor {
    constructor(
        public readonly editor: TextEditor,
    ) { }

    public readonly selection = observableFromEvent(window.onDidChangeTextEditorSelection, () => this.editor.selection);
    public readonly position = this.selection.map(s => s.active);
}
