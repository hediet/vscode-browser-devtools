import { assumeType } from "../utils/Validator";
import { CommandDef } from "./vscode-utils/Command";

export const attachToDebugSession = new CommandDef('browser-devtools.attachToDebugSession', assumeType<{
    debugSessionId?: string;
} | undefined>());
