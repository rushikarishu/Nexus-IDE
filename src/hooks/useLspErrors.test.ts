import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLspErrors } from './useLspErrors';
import { listen } from '@tauri-apps/api/event';
import { useToast } from './useToast';

// Mocks
vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(),
}));

vi.mock('./useToast', () => ({
    useToast: vi.fn(),
}));

const listenMock = vi.mocked(listen);
const useToastMock = vi.mocked(useToast);

describe('useLspErrors', () => {
    const mockToast = {
        error: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        useToastMock.mockReturnValue(mockToast);
    });

    it('should listen to lsp-error events', async () => {
        listenMock.mockResolvedValue(() => { });

        renderHook(() => useLspErrors());

        await waitFor(() => {
            expect(listenMock).toHaveBeenCalledWith('lsp-error', expect.any(Function));
        });
    });

    it('should show toast on lsp-error event', async () => {
        let errorHandler: any;
        listenMock.mockImplementation(async (_event, handler) => {
            errorHandler = handler;
            return () => { };
        });

        renderHook(() => useLspErrors());

        await waitFor(() => {
            expect(listenMock).toHaveBeenCalled();
        });

        // Trigger an error
        errorHandler({
            payload: {
                language: 'rust',
                error: 'Failed to start LSP server'
            }
        });

        expect(mockToast.error).toHaveBeenCalledWith('LSP (rust): Failed to start LSP server');
    });

    it('should deduplicate identical errors', async () => {
        let errorHandler: any;
        listenMock.mockImplementation(async (_event, handler) => {
            errorHandler = handler;
            return () => { };
        });

        renderHook(() => useLspErrors());

        await waitFor(() => {
            expect(listenMock).toHaveBeenCalled();
        });

        // Trigger same error twice
        errorHandler({
            payload: {
                language: 'rust',
                error: 'Connection lost'
            }
        });
        errorHandler({
            payload: {
                language: 'rust',
                error: 'Connection lost'
            }
        });

        expect(mockToast.error).toHaveBeenCalledTimes(1);
    });

    it('should show different errors from same language', async () => {
        let errorHandler: any;
        listenMock.mockImplementation(async (_event, handler) => {
            errorHandler = handler;
            return () => { };
        });

        renderHook(() => useLspErrors());

        await waitFor(() => {
            expect(listenMock).toHaveBeenCalled();
        });

        errorHandler({
            payload: {
                language: 'rust',
                error: 'Error 1'
            }
        });
        errorHandler({
            payload: {
                language: 'rust',
                error: 'Error 2'
            }
        });

        expect(mockToast.error).toHaveBeenCalledTimes(2);
        expect(mockToast.error).toHaveBeenNthCalledWith(1, 'LSP (rust): Error 1');
        expect(mockToast.error).toHaveBeenNthCalledWith(2, 'LSP (rust): Error 2');
    });

    it('should show errors from different languages', async () => {
        let errorHandler: any;
        listenMock.mockImplementation(async (_event, handler) => {
            errorHandler = handler;
            return () => { };
        });

        renderHook(() => useLspErrors());

        await waitFor(() => {
            expect(listenMock).toHaveBeenCalled();
        });

        errorHandler({
            payload: {
                language: 'rust',
                error: 'Rust error'
            }
        });
        errorHandler({
            payload: {
                language: 'python',
                error: 'Python error'
            }
        });

        expect(mockToast.error).toHaveBeenCalledTimes(2);
        expect(mockToast.error).toHaveBeenNthCalledWith(1, 'LSP (rust): Rust error');
        expect(mockToast.error).toHaveBeenNthCalledWith(2, 'LSP (python): Python error');
    });

    it('should cleanup listener on unmount', async () => {
        const unlisten = vi.fn();
        listenMock.mockResolvedValue(unlisten);

        const { unmount } = renderHook(() => useLspErrors());

        await waitFor(() => {
            expect(listenMock).toHaveBeenCalled();
        });

        unmount();

        expect(unlisten).toHaveBeenCalled();
    });
});
