import { TreeItem, TreeDataProvider, EventEmitter, ProviderResult } from "vscode";
import { Disposable } from "../../utils/disposables";
import { IObservable, constObservable, observableValue, autorun } from "../../utils/observables/observableInternal";
import { waitForState } from "../../utils/observables/observableInternal/utilsCancellation";

export interface IObservableTreeItem {
    treeItem: IObservable<TreeItem | 'loading'> | TreeItem;
    children?: IObservable<IObservableTreeItem[] | 'loading'> | IObservableTreeItem[];
}

export class ObservableTreeDataProvider implements TreeDataProvider<CachedNode> {
    private readonly _changeEmitter = new EventEmitter<void | CachedNode | CachedNode[] | null | undefined>();
    private readonly _root: CachedNode;

    constructor(children: IObservable<IObservableTreeItem[] | 'loading'>) {
        this._root = new CachedNode({
            treeItem: constObservable('loading'),
            children: children,
        }, (node: CachedNode) => {
            this._changeEmitter.fire(node === this._root ? undefined : node);
        });
    }

    public readonly onDidChangeTreeData = this._changeEmitter.event;

    getTreeItem(element: CachedNode): TreeItem | Thenable<TreeItem> {
        return element.getTreeItem();
    }
    getChildren(element?: CachedNode | undefined): ProviderResult<CachedNode[]> {
        return (element ?? this._root).getChildren();
    }
}

class CachedNode extends Disposable {
    private _trackChildren = false;
    private _trackTreeItem = false;

    constructor(
        private readonly _node: IObservableTreeItem,
        private readonly _onDidChange: (node: CachedNode) => void
    ) {
        super();

        this._register({
            dispose: () => {
                for (const c of this._children) {
                    c.dispose();
                }
                this._children = [];
            }
        });
    }

    private _isLoading = observableValue(this, false);
    private _children: CachedNode[] = [];

    getChildren(): Promise<CachedNode[]> | CachedNode[] {
        if (!this._trackChildren) {
            this._trackChildren = true;
            let first = true;

            this._register(autorun(reader => {
                const c = isObservable(this._node.children) ? this._node.children.read(reader) : this._node.children;
                if (c === 'loading') {
                    this._isLoading.set(true, undefined);
                } else {
                    this._isLoading.set(false, undefined);
                    const oldChildren = this._children;
                    this._children = (c ?? []).map(n => new CachedNode(n, this._onDidChange));
                    for (const c of oldChildren) {
                        c.dispose();
                    }
                }

                if (first) {
                    first = false;
                } else {
                    this._onDidChange(this);
                }
            }));
        }

        if (!this._isLoading.get()) {
            return this._children;
        }
        return waitForState(this._isLoading, isLoading => !isLoading).then(() => this._children);
    }

    getTreeItem(): Promise<TreeItem> | TreeItem {
        if (!this._trackTreeItem) {
            this._trackTreeItem = true;
            let first = true;
            const treeItem = this._node.treeItem;
            if (isObservable(treeItem)) {
                this._register(autorun(reader => {
                    treeItem.read(reader);
                    if (first) {
                        first = false;
                    } else {
                        this._onDidChange(this);
                    }
                }));
            }
        }
        if (!isObservable(this._node.treeItem)) {
            return this._node.treeItem;
        }
        const item = this._node.treeItem.get();
        if (item !== 'loading') {
            return item;
        }
        return waitForState(this._node.treeItem, item => item !== 'loading');
    }
}

function isObservable(value: unknown): value is IObservable<any> {
    return !!value && !!(value as IObservable<any>).get;
}
