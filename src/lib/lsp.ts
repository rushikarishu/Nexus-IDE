import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Diagnostic } from "./diagnostics";

let messageIdCounter = 0;

// Diagnostics handler type
export type DiagnosticsHandler = (payload: {
    uri: string;
    diagnostics: Diagnostic[];
    language: string;
}) => void;

interface JsonRpcRequest {
    jsonrpc: "2.0";
    id?: number;
    method: string;
    params?: unknown;
}

export class LspClient {
    private unlistenMessage?: UnlistenFn;
    private unlistenDiagnostics?: UnlistenFn;
    private pendingRequests: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }> = new Map();
    private diagnosticsHandlers: Set<DiagnosticsHandler> = new Set();
    private requestHandlers: Map<string, (params: any) => Promise<any>> = new Map();
    private notificationHandlers: Map<string, (params: any) => void> = new Map();

    constructor(private language: string) { }

    async initialize() {
        try {
            // console.log(`[LspClient] Starting LSP for ${this.language}`);
            await invoke("start_lsp", { language: this.language });

            // Listen to messages from this language's LSP
            const messageEvent = `lsp-message-${this.language}`;
            this.unlistenMessage = await listen<string>(messageEvent, async (event) => {
                try {
                    const raw = JSON.parse(event.payload) as unknown;
                    if (!raw || typeof raw !== "object") {
                        return;
                    }

                    const message = raw as {
                        jsonrpc: "2.0";
                        id?: number | string;
                        method?: string;
                        params?: unknown;
                        result?: unknown;
                        error?: { message?: string };
                    };

                    const id = typeof message.id === "number" ? message.id : (typeof message.id === "string" ? parseInt(message.id) : undefined);

                    // Request from Server
                    if (message.method && message.id !== undefined) {
                        const handler = this.requestHandlers.get(message.method);
                        if (handler) {
                            try {
                                const result = await handler(message.params);
                                await this.sendResponse(message.id, result);
                            } catch (err) {
                                await this.sendError(message.id, err);
                            }
                        } else {
                            // console.warn(`[LspClient] Unhandled request: ${message.method}`);
                        }
                    }
                    // Notification from Server
                    else if (message.method && message.id === undefined) {
                        const handler = this.notificationHandlers.get(message.method);
                        if (handler) {
                            handler(message.params);
                        }
                    }
                    // Response to our request
                    else if (id !== undefined && this.pendingRequests.has(id)) {
                        const pending = this.pendingRequests.get(id)!;
                        this.pendingRequests.delete(id);

                        if (message.error) {
                            const msg =
                                message.error && typeof message.error.message === "string"
                                    ? message.error.message
                                    : "LSP error";
                            pending.reject(new Error(msg));
                        } else {
                            pending.resolve(message.result);
                        }
                    }
                } catch (err) {
                    console.error("[LspClient] Failed to parse lsp-message:", err);
                }
            });

            // Listen to diagnostics events
            const diagnosticsEvent = `lsp-diagnostics-${this.language}`;

            this.unlistenDiagnostics = await listen<{ language: string; uri: string; diagnostics: Diagnostic[] }>(
                diagnosticsEvent,
                (event) => {
                    // Only handle diagnostics for our language
                    if (event.payload.language === this.language) {
                        this.diagnosticsHandlers.forEach((handler) => {
                            try {
                                handler({
                                    uri: event.payload.uri,
                                    diagnostics: event.payload.diagnostics,
                                    language: event.payload.language,
                                });
                            } catch (err) {
                                console.error("[LspClient] Diagnostics handler error:", err);
                            }
                        });
                    }
                }
            );
        } catch (e) {
            console.error(`[LspClient] Failed to initialize LSP for ${this.language}:`, e);
            throw e; // Bubble error to caller
        }
    }

    async sendRequest(method: string, params?: unknown, timeoutMs = 10000): Promise<unknown> {
        const id = messageIdCounter++;
        const request: JsonRpcRequest = {
            jsonrpc: "2.0",
            id,
            method,
            params,
        };

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`LSP request '${method}' timed out after ${timeoutMs}ms`));
                }
            }, timeoutMs);

            this.pendingRequests.set(id, {
                resolve: (result) => {
                    clearTimeout(timer);
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timer);
                    reject(error);
                }
            });

            invoke("send_lsp_request", {
                language: this.language,
                msg: JSON.stringify(request),
            }).catch((e) => {
                clearTimeout(timer);
                this.pendingRequests.delete(id);
                reject(e instanceof Error ? e : new Error(String(e)));
            });
        });
    }

    async sendNotification(method: string, params?: unknown) {
        const request = {
            jsonrpc: "2.0",
            method,
            params,
        };

        await invoke("send_lsp_request", {
            language: this.language,
            msg: JSON.stringify(request),
        });
    }

    async sendResponse(id: number | string, result: unknown) {
        const response = {
            jsonrpc: "2.0",
            id,
            result,
        };
        await invoke("send_lsp_request", {
            language: this.language,
            msg: JSON.stringify(response),
        });
    }

    async sendError(id: number | string, error: any) {
        const response = {
            jsonrpc: "2.0",
            id,
            error: {
                code: -32603, // Internal error
                message: String(error),
            },
        };
        await invoke("send_lsp_request", {
            language: this.language,
            msg: JSON.stringify(response),
        });
    }

    /**
     * Register a diagnostics handler
     * Returns a function to unregister the handler
     */
    onDiagnostics(handler: DiagnosticsHandler): () => void {
        this.diagnosticsHandlers.add(handler);
        return () => this.diagnosticsHandlers.delete(handler);
    }

    onRequest(method: string, handler: (params: any) => Promise<any>) {
        this.requestHandlers.set(method, handler);
        return () => this.requestHandlers.delete(method);
    }

    onNotification(method: string, handler: (params: any) => void) {
        this.notificationHandlers.set(method, handler);
        return () => this.notificationHandlers.delete(method);
    }

    async shutdown() {
        // Reject all pending requests first before clearing
        this.pendingRequests.forEach(req =>
            req.reject(new Error("LSP client shutting down"))
        );
        this.pendingRequests.clear();

        if (this.unlistenMessage) {
            this.unlistenMessage();
            this.unlistenMessage = undefined;
        }
        if (this.unlistenDiagnostics) {
            this.unlistenDiagnostics();
            this.unlistenDiagnostics = undefined;
        }
        this.diagnosticsHandlers.clear();
        this.requestHandlers.clear();
        this.notificationHandlers.clear();

        await invoke("shutdown_lsp", { language: this.language });

        // Emit shutdown event for diagnostics cleanup
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('lsp-shutdown', {
                detail: { language: this.language }
            }));
        }
    }
}

// LSP Client Registry
const lspClients = new Map<string, LspClient>();
type LspClientListener = (client: LspClient) => void;
const clientListeners: Set<LspClientListener> = new Set();

/**
 * Listen for new LSP clients
 */
export function onLspClientCreated(listener: LspClientListener): () => void {
    clientListeners.add(listener);
    // Call for existing clients immediately
    lspClients.forEach(listener);
    return () => clientListeners.delete(listener);
}

/**
 * Get or create an LSP client for a language
 */
export function getLspClient(languageKey: string): LspClient {
    if (!lspClients.has(languageKey)) {
        const client = new LspClient(languageKey);
        lspClients.set(languageKey, client);
        clientListeners.forEach(l => l(client));
    }
    return lspClients.get(languageKey)!;
}

/**
 * Shutdown and dispose a single LSP client, if it exists.
 */
export async function shutdownLspClient(languageKey: string): Promise<void> {
    const client = lspClients.get(languageKey);
    if (!client) return;

    try {
        await client.shutdown();
    } catch (e) {
        console.error(`Failed to shutdown ${languageKey} LSP:`, e);
    } finally {
        lspClients.delete(languageKey);
    }
}

/**
 * Shutdown all LSP clients
 */
export async function shutdownAllLspClients(): Promise<void> {
    const clients = Array.from(lspClients.entries());
    lspClients.clear();

    await Promise.all(
        clients.map(async ([language, client]) => {
            try {
                await client.shutdown();
            } catch (e) {
                console.error(`Failed to shutdown ${language} LSP:`, e);
            }
        })
    );
}

// For backward compatibility, export a function to get Rust LSP
export const rustLsp = getLspClient("rust");
