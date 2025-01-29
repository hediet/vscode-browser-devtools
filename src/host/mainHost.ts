// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { DevToolsPaneApi } from '../common/api';
import { SimpleTypedMessageConnection } from '../utils/rpc/IMessageStream';
import { FrameToolsEvent } from '../common/webviewEvents';
import { createMessageStreamToVsCodeHost } from './createMessageStreamToVsCodeHost';
import { WindowLikeStream } from './WindowLikeStream';

window.addEventListener('DOMContentLoaded', () => {
    const toolsFrameWindow = (document.getElementById('devtools-frame') as HTMLIFrameElement).contentWindow;

    const iframeStream = new WindowLikeStream<
        { method: Exclude<FrameToolsEvent, 'sendMessageToBackend'>, args: unknown[] } | { method: 'sendMessageToBackend', args: [cdpMessage: string] },
        { method: 'dispatchMessage', args: [message: unknown] }
    >(window, toolsFrameWindow!);

    const hostApi = SimpleTypedMessageConnection.createClient<DevToolsPaneApi>(createMessageStreamToVsCodeHost(), {
        handleCdpMessage: message => {
            iframeStream.sendMessage({ method: 'dispatchMessage', args: [message] });
        }
    });

    iframeStream.setListener(message => {
        if (message.method === 'sendMessageToBackend') {
            hostApi.api.handleCdpMessage(message.args[0]);
        }
    });

    hostApi.api.initialized();
});
