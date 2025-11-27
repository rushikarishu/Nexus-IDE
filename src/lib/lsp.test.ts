import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LspClient, getLspClient, shutdownAllLspClients } from './lsp';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Mocks
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

describe('LspClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('initialize', () => {
        it('should invoke start_lsp command', async () => {
            invokeMock.mockResolvedValue(undefined);
            listenMock.mockResolvedValue(() => { });

            const client = new LspClient('rust');
            await client.initialize();

            expect(invokeMock).toHaveBeenCalledWith('start_lsp', { language: 'rust' });
            expect(listenMock).toHaveBeenCalledWith('lsp-message-rust', expect.any(Function));
            expect(listenMock).toHaveBeenCalledWith('lsp-diagnostics-rust', expect.any(Function));
        });

        it('should subscribe to lsp-message events', async () => {
            invokeMock.mockResolvedValue(undefined);
            let messageHandler: any;
            listenMock.mockImplementation(async (event: string, handler: any) => {
                if (event === 'lsp-message-rust') {
                    messageHandler = handler;
                }
                return () => { };
            });

            const client = new LspClient('rust');
            await client.initialize();

            expect(messageHandler).toBeDefined();
        });

        it('should subscribe to lsp-diagnostics events', async () => {
            invokeMock.mockResolvedValue(undefined);
            let diagnosticsHandler: any;
            listenMock.mockImplementation(async (event: string, handler: any) => {
                if (event === 'lsp-diagnostics-rust') {
                    diagnosticsHandler = handler;
                }
                return () => { };
            });

            const client = new LspClient('rust');
            await client.initialize();

            expect(diagnosticsHandler).toBeDefined();
        });
    });

    describe('sendRequest', () => {
        it('should send JSON-RPC request and resolve on response', async () => {
            let capturedMsg: any = null;
            invokeMock.mockImplementation((cmd, args: any) => {
                if (cmd === 'start_lsp') return Promise.resolve();
                if (cmd === 'send_lsp_request') {
                    capturedMsg = JSON.parse(args.msg);
                    return Promise.resolve();
                }
                return Promise.resolve();
            });

            let messageHandler: any;
            listenMock.mockImplementation(async (event: string, handler: any) => {
                if (event === 'lsp-message-rust') {
                    messageHandler = handler;
                }
                return () => { };
            });

            const client = new LspClient('rust');
            await client.initialize();

            const requestPromise = client.sendRequest('textDocument/hover', { position: { line: 0, character: 0 } });

            // Simulate LSP response using the captured request id
            await new Promise(resolve => setTimeout(resolve, 10));
            messageHandler({
                payload: JSON.stringify({
                    jsonrpc: '2.0',
                    id: capturedMsg.id,
                    result: { contents: 'hover info' }
                })
            });

            const result = await requestPromise;
            expect(result).toEqual({ contents: 'hover info' });
        });

        it('should reject on LSP error response', async () => {
            let capturedMsg: any = null;
            invokeMock.mockImplementation((cmd, args: any) => {
                if (cmd === 'start_lsp') return Promise.resolve();
                if (cmd === 'send_lsp_request') {
                    capturedMsg = JSON.parse(args.msg);
                    return Promise.resolve();
                }
                return Promise.resolve();
            });

            let messageHandler: any;
            listenMock.mockImplementation(async (event: string, handler: any) => {
                if (event === 'lsp-message-rust') {
                    messageHandler = handler;
                }
                return () => { };
            });

            const client = new LspClient('rust');
            await client.initialize();

            // Start the request
            const requestPromise = client.sendRequest('textDocument/definition', {});

            // Wait a tick for the handler to be ready, then simulate error with matching id
            await new Promise(resolve => setTimeout(resolve, 50));

            messageHandler({
                payload: JSON.stringify({
                    jsonrpc: '2.0',
                    id: capturedMsg.id,
                    error: { message: 'Definition not found' }
                })
            });

            await expect(requestPromise).rejects.toThrow('Definition not found');
        });

        it('should timeout if no response received', async () => {
            invokeMock.mockResolvedValue(undefined);
            listenMock.mockResolvedValue(() => { });

            const client = new LspClient('rust');
            await client.initialize();

            const requestPromise = client.sendRequest('textDocument/hover', {}, 100);

            await expect(requestPromise).rejects.toThrow(/timed out/);
        }, 200);

        it('should reject if send_lsp_request fails', async () => {
            invokeMock.mockImplementation((cmd) => {
                if (cmd === 'start_lsp') return Promise.resolve();
                if (cmd === 'send_lsp_request') return Promise.reject(new Error('No LSP running'));
                return Promise.resolve();
            });
            listenMock.mockResolvedValue(() => { });

            const client = new LspClient('rust');
            await client.initialize();

            await expect(client.sendRequest('textDocument/hover', {})).rejects.toThrow('No LSP running');
        });
    });

    describe('sendNotification', () => {
        it('should send JSON-RPC notification without expecting response', async () => {
            invokeMock.mockResolvedValue(undefined);
            listenMock.mockResolvedValue(() => { });

            const client = new LspClient('rust');
            await client.initialize();

            await client.sendNotification('textDocument/didOpen', { textDocument: { uri: 'file:///test.rs' } });

            expect(invokeMock).toHaveBeenCalledWith('send_lsp_request', {
                language: 'rust',
                msg: expect.stringContaining('"method":"textDocument/didOpen"')
            });
        });
    });

    describe('onDiagnostics', () => {
        it('should register diagnostics handler', async () => {
            invokeMock.mockResolvedValue(undefined);
            let diagnosticsHandler: any;
            listenMock.mockImplementation(async (event: string, handler: any) => {
                if (event === 'lsp-diagnostics-rust') {
                    diagnosticsHandler = handler;
                }
                return () => { };
            });

            const client = new LspClient('rust');
            await client.initialize();

            const mockHandler = vi.fn();
            client.onDiagnostics(mockHandler);

            // Simulate diagnostics event
            diagnosticsHandler({
                payload: {
                    language: 'rust',
                    uri: 'file:///test.rs',
                    diagnostics: [{ severity: 1, message: 'error' }]
                }
            });

            expect(mockHandler).toHaveBeenCalledWith({
                language: 'rust',
                uri: 'file:///test.rs',
                diagnostics: [{ severity: 1, message: 'error' }]
            });
        });

        it('should not call handler for other languages', async () => {
            invokeMock.mockResolvedValue(undefined);
            let diagnosticsHandler: any;
            listenMock.mockImplementation(async (event: string, handler: any) => {
                if (event === 'lsp-diagnostics-rust') {
                    diagnosticsHandler = handler;
                }
                return () => { };
            });

            const client = new LspClient('rust');
            await client.initialize();

            const mockHandler = vi.fn();
            client.onDiagnostics(mockHandler);

            // Simulate diagnostics event for different language
            diagnosticsHandler({
                payload: {
                    language: 'python',
                    uri: 'file:///test.py',
                    diagnostics: []
                }
            });

            expect(mockHandler).not.toHaveBeenCalled();
        });
    });

    describe('shutdown', () => {
        it('should cleanup listeners and invoke shutdown_lsp', async () => {
            invokeMock.mockResolvedValue(undefined);
            const unlisten = vi.fn();
            listenMock.mockResolvedValue(unlisten);

            const client = new LspClient('rust');
            await client.initialize();

            await client.shutdown();

            expect(unlisten).toHaveBeenCalledTimes(2); // message + diagnostics
            expect(invokeMock).toHaveBeenCalledWith('shutdown_lsp', { language: 'rust' });
        });

        it('should reject all pending requests', async () => {
            invokeMock.mockResolvedValue(undefined);
            listenMock.mockResolvedValue(() => { });

            const client = new LspClient('rust');
            await client.initialize();

            const requestPromise = client.sendRequest('textDocument/hover', {});

            await client.shutdown();

            await expect(requestPromise).rejects.toThrow('LSP client shutting down');
        });
    });
});

describe('getLspClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return same instance for same language', () => {
        const client1 = getLspClient('rust');
        const client2 = getLspClient('rust');

        expect(client1).toBe(client2);
    });

    it('should return different instances for different languages', () => {
        const rustClient = getLspClient('rust');
        const pythonClient = getLspClient('python');

        expect(rustClient).not.toBe(pythonClient);
    });
});

describe('shutdownAllLspClients', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should invoke shutdown_lsp for all registered clients', async () => {
        invokeMock.mockResolvedValue(undefined);

        // Create multiple clients
        getLspClient('rust');
        getLspClient('python');
        getLspClient('typescript');

        await shutdownAllLspClients();

        expect(invokeMock).toHaveBeenCalledWith('shutdown_lsp', { language: 'rust' });
        expect(invokeMock).toHaveBeenCalledWith('shutdown_lsp', { language: 'python' });
        expect(invokeMock).toHaveBeenCalledWith('shutdown_lsp', { language: 'typescript' });
    });

    it('should handle shutdown failures gracefully', async () => {
        invokeMock.mockRejectedValue(new Error('Shutdown failed'));

        getLspClient('rust');

        await expect(shutdownAllLspClients()).resolves.not.toThrow();
    });
});
