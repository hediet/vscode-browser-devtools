// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export type WebviewEvent = 'getState' | 'getUrl' | 'openInEditor' | 'cssMirrorContent' | 'ready' | 'setState' | 'telemetry' | 'websocket'
    | 'getVscodeSettings' | 'copyText' | 'focusEditor' | 'focusEditorGroup' | 'openUrl' | 'toggleScreencast' | 'toggleInspect' | 'replayConsoleMessages'
    | 'devtoolsConnection' | 'toggleCSSMirrorContent' | 'writeToClipboard' | 'readClipboard';

export type FrameToolsEvent = 'sendMessageToBackend' | 'openInNewTab' | 'recordEnumeratedHistogram' |
    'recordPerformanceHistogram' | 'reportError' | 'openInEditor' | 'cssMirrorContent' | 'toggleScreencast' | 'replayConsoleMessages' | 'toggleCSSMirrorContent';

export type TelemetryEvent = 'enumerated' | 'performance' | 'error';

export interface ITelemetryMeasures { [key: string]: number; }
export interface ITelemetryProps { [key: string]: string; }

export interface ITelemetryDataNumber {
    event: 'enumerated' | 'performance';
    name: string;
    data: number;
}
export interface ITelemetryDataObject {
    event: 'error' | 'screencast';
    name: string;
    data: Record<string, unknown>;
}
export type TelemetryData = ITelemetryDataNumber | ITelemetryDataObject;

export interface IOpenEditorData {
    url: string;
    line: number;
    column: number;
    ignoreTabChanges: boolean;
}

export interface ICssMirrorContentData {
    url: string;
    newContent: string;
}

export interface IToggleCSSMirrorContentData {
    isEnabled: boolean;
}
