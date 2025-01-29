/*
import { enableHotReload } from "@hediet/node-reload/node";
import path = require("path");
enableHotReload({ entryModule: module, loggingFileRoot: path.join(__dirname, '..'), skipInitializationIfEnabled: true });
*/

import { ExtensionContext } from "vscode";
import { Extension } from "./extension";
import { hotReloadExportedItem } from "@hediet/node-reload";

export function activate(context: ExtensionContext) {
	let first = true;
	context.subscriptions.push(hotReloadExportedItem(Extension, Ext => {
		let ext: Extension | undefined;
		const fn = () => {
			ext = new Ext(context);
		};
		if (first) {
			first = false;
			fn();
			return {
				dispose: () => { ext?.dispose(); }
			};
		}

		const timeoutId = setTimeout(() => {
			fn();
		}, 50);
		return {
			dispose: () => {
				clearTimeout(timeoutId);
				ext?.dispose();
			}
		};
	}));
}
