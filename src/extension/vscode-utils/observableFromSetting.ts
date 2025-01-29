import { workspace } from "vscode";
import { IObservable, observableFromEvent } from "../../utils/observables/observableInternal";

export function observableFromConfig<T>(settingId: string): IObservable<T | undefined> {
    return observableFromEvent(workspace.onDidChangeConfiguration, e => workspace.getConfiguration().get<T>(settingId));
}
