import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface LaunchConfig {
    name: string;
    type: string;
    request: string;
    program?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    adapterExecutable?: string;
    [key: string]: any;
}

export interface DapEvent {
    seq: number;
    type: string;
    event: string;
    body?: any;
}

export interface DapResponse {
    seq: number;
    type: string;
    request_seq: number;
    success: boolean;
    command: string;
    message?: string;
    body?: any;
}

export async function startDebugSession(config: LaunchConfig): Promise<void> {
    await invoke("dap_start_session", { config });
}

export async function stopDebugSession(): Promise<void> {
    await invoke("dap_stop_session");
}

export async function sendDapCommand(command: string, args?: any): Promise<void> {
    await invoke("dap_send_command", { command, args });
}

export async function continueSession(): Promise<void> {
    await invoke("dap_continue");
}

export async function nextStep(): Promise<void> {
    await invoke("dap_next");
}

export async function stepIn(): Promise<void> {
    await invoke("dap_step_in");
}

export async function stepOut(): Promise<void> {
    await invoke("dap_step_out");
}

export async function setBreakpoints(path: string, lines: number[]): Promise<void> {
    await invoke("dap_set_breakpoints", { path, lines });
}

export async function getThreads(): Promise<void> {
    await invoke("dap_threads");
}

export async function getStackTrace(threadId: number): Promise<void> {
    await invoke("dap_stack_trace", { threadId });
}

export async function getScopes(frameId: number): Promise<void> {
    await invoke("dap_scopes", { frameId });
}

export async function getVariables(variablesReference: number): Promise<void> {
    await invoke("dap_variables", { variablesReference });
}

export async function disconnect(): Promise<void> {
    await invoke("dap_disconnect");
}

export function onDapEvent(callback: (event: DapEvent) => void) {
    return listen<DapEvent>("dap://event", (payload) => {
        callback(payload.payload);
    });
}

export function onDapResponse(callback: (response: DapResponse) => void) {
    return listen<DapResponse>("dap://response", (payload) => {
        callback(payload.payload);
    });
}

export function onDapTerminated(callback: () => void) {
    return listen<void>("dap://terminated", () => {
        callback();
    });
}
