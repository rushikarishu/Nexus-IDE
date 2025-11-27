import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useFileSystem } from './useFileSystem';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(() => Promise.resolve(() => { })),
}));

vi.mock('../lib/pathValidation', () => ({
    validatePath: vi.fn(),
    isPathWithinWorkspace: vi.fn().mockReturnValue(true),
}));

// Mock LSP - updated for new API with getLspClient
vi.mock('../lib/lsp', () => {
    const mockLspClient = {
        initialize: vi.fn().mockResolvedValue(undefined),
        sendRequest: vi.fn().mockResolvedValue(undefined),
        sendNotification: vi.fn().mockResolvedValue(undefined),
        onMessage: vi.fn().mockReturnValue(() => { }),
    };

    return {
        getLspClient: vi.fn(() => mockLspClient),
        shutdownAllLspClients: vi.fn().mockResolvedValue(undefined),
        rustLsp: mockLspClient, // For backward compatibility
    };
});

const invokeMock = vi.mocked(invoke);

describe('useFileSystem', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should initialize with empty state', () => {
        const { result } = renderHook(() => useFileSystem("stopped", vi.fn()));
        expect(result.current.fileStates.size).toBe(0);
        expect(result.current.activeFile).toBeNull();
    });

    it('should open a file and read its content', async () => {
        const mockContent = 'Hello World';
        invokeMock.mockResolvedValue(mockContent);

        const { result } = renderHook(() => useFileSystem("stopped", vi.fn()));

        await act(async () => {
            await result.current.handleFileSelect('/test/file.rs');
        });

        expect(invokeMock).toHaveBeenCalledWith('read_file', { path: '/test/file.rs' });
        expect(result.current.activeFile).toBe('/test/file.rs');
        expect(result.current.fileStates.get('/test/file.rs')?.content).toBe(mockContent);
        expect(result.current.fileStates.get('/test/file.rs')?.isDirty).toBe(false);
    });

    it('should update file content and mark as dirty', async () => {
        const mockContent = 'Initial';
        invokeMock.mockResolvedValue(mockContent);

        const { result } = renderHook(() => useFileSystem("stopped", vi.fn()));

        await act(async () => {
            await result.current.handleFileSelect('/test/file.rs');
        });

        act(() => {
            result.current.updateFileState('/test/file.rs', { content: 'Updated', isDirty: true });
        });

        expect(result.current.fileStates.get('/test/file.rs')?.content).toBe('Updated');
        expect(result.current.fileStates.get('/test/file.rs')?.isDirty).toBe(true);
    });

    it('should auto-save after delay', async () => {
        const mockContent = 'Initial';
        invokeMock.mockResolvedValue(mockContent);

        const { result } = renderHook(() => useFileSystem("stopped", vi.fn()));

        await act(async () => {
            await result.current.handleFileSelect('/test/file.rs');
        });

        act(() => {
            result.current.updateFileState('/test/file.rs', { content: 'Updated', isDirty: true });
            result.current.triggerAutoSave('/test/file.rs', 'Updated');
        });

        // Fast-forward time to trigger debounce
        await act(async () => {
            vi.advanceTimersByTime(2000);
            // Flush promises
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(invokeMock).toHaveBeenCalledWith('save_file', { path: '/test/file.rs', content: 'Updated' });
        expect(result.current.fileStates.get('/test/file.rs')?.isDirty).toBe(false);
    });

    it('should start LSP when opening a Rust file', async () => {
        invokeMock.mockResolvedValue('');
        const setLspStatus = vi.fn();
        const { getLspClient } = await import('../lib/lsp');
        const mockClient = vi.mocked(getLspClient)('rust');

        const { result } = renderHook(() => useFileSystem("stopped", setLspStatus));

        await act(async () => {
            await result.current.handleFileSelect('/test/main.rs');
        });

        // Ensure LSP client is created and initialized for Rust files
        expect(getLspClient).toHaveBeenCalledWith('rust');
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockClient.initialize).toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockClient.sendRequest).toHaveBeenCalledWith(
            'initialize',
            expect.objectContaining({ processId: null, rootUri: null })
        );
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockClient.sendNotification).toHaveBeenCalledWith('initialized', {});
        expect(setLspStatus).toHaveBeenCalledWith('running');
    });
});
