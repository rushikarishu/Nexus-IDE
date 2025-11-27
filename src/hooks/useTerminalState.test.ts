import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTerminalState } from './useTerminalState';
import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';
import { useToast } from './useToast';

// Mocks
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
    confirm: vi.fn(),
}));

vi.mock('./useToast', () => ({
    useToast: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const confirmMock = vi.mocked(confirm);
const useToastMock = vi.mocked(useToast);

describe('useTerminalState', () => {
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

    it('should initialize with default state', () => {
        const { result } = renderHook(() => useTerminalState());
        expect(result.current.isOpen).toBe(true);
        expect(result.current.terminalId).toBeNull();
    });

    it('should toggle terminal visibility', () => {
        const { result } = renderHook(() => useTerminalState());

        act(() => {
            result.current.toggleTerminal();
        });
        expect(result.current.isOpen).toBe(false);

        act(() => {
            result.current.toggleTerminal();
        });
        expect(result.current.isOpen).toBe(true);
    });

    it('should show error when running with no file', async () => {
        const { result } = renderHook(() => useTerminalState());
        const saveFile = vi.fn();

        await act(async () => {
            await result.current.runFile(null, saveFile);
        });

        expect(mockToast.error).toHaveBeenCalledWith("No file selected to run");
        expect(saveFile).not.toHaveBeenCalled();
        expect(invokeMock).not.toHaveBeenCalled();
    });

    it('should prompt for security confirmation on first run', async () => {
        const { result } = renderHook(() => useTerminalState());
        const saveFile = vi.fn();
        confirmMock.mockResolvedValue(false); // User denies

        await act(async () => {
            await result.current.runFile('/test/file.rs', saveFile);
        });

        expect(confirmMock).toHaveBeenCalled();
        expect(saveFile).not.toHaveBeenCalled();

        // User accepts
        confirmMock.mockResolvedValue(true);
        // Set terminal ID so it can proceed
        act(() => {
            result.current.setTerminalId('term-123');
        });

        await act(async () => {
            await result.current.runFile('/test/file.rs', saveFile);
        });

        expect(confirmMock).toHaveBeenCalledTimes(2);
        expect(saveFile).toHaveBeenCalled();
        expect(invokeMock).toHaveBeenCalledWith('run_file', {
            path: '/test/file.rs',
            terminal_id: 'term-123',
        });
    });

    it('should not prompt for security confirmation on subsequent runs', async () => {
        const { result } = renderHook(() => useTerminalState());
        const saveFile = vi.fn();
        confirmMock.mockResolvedValue(true);

        act(() => {
            result.current.setTerminalId('term-123');
        });

        // First run
        await act(async () => {
            await result.current.runFile('/test/file.rs', saveFile);
        });
        expect(confirmMock).toHaveBeenCalledTimes(1);

        // Second run
        await act(async () => {
            await result.current.runFile('/test/file.rs', saveFile);
        });
        expect(confirmMock).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should show error if terminal is not ready', async () => {
        const { result } = renderHook(() => useTerminalState());
        const saveFile = vi.fn();
        confirmMock.mockResolvedValue(true);

        await act(async () => {
            await result.current.runFile('/test/file.rs', saveFile);
        });

        expect(mockToast.error).toHaveBeenCalledWith("Terminal not ready");
        expect(invokeMock).not.toHaveBeenCalledWith('run_file', expect.anything());
    });

    it('should open terminal panel if closed when running', async () => {
        const { result } = renderHook(() => useTerminalState());
        const saveFile = vi.fn();
        confirmMock.mockResolvedValue(true);

        act(() => {
            result.current.setIsOpen(false);
            result.current.setTerminalId('term-123');
        });

        await act(async () => {
            await result.current.runFile('/test/file.rs', saveFile);
        });

        expect(result.current.isOpen).toBe(true);
    });

    it('should handle run_file failure by writing to terminal', async () => {
        const { result } = renderHook(() => useTerminalState());
        const saveFile = vi.fn();
        confirmMock.mockResolvedValue(true);

        act(() => {
            result.current.setTerminalId('term-123');
        });

        const error = new Error("Run failed");
        invokeMock.mockImplementation((cmd) => {
            if (cmd === 'run_file') return Promise.reject(error);
            if (cmd === 'write_terminal') return Promise.resolve();
            return Promise.resolve();
        });

        await act(async () => {
            await result.current.runFile('/test/file.rs', saveFile);
        });

        expect(invokeMock).toHaveBeenCalledWith('write_terminal', {
            id: 'term-123',
            data: expect.stringContaining("Error running file: Error: Run failed"),
        });
    });

    it('should fallback to toast if writing to terminal fails', async () => {
        const { result } = renderHook(() => useTerminalState());
        const saveFile = vi.fn();
        confirmMock.mockResolvedValue(true);

        act(() => {
            result.current.setTerminalId('term-123');
        });

        const error = new Error("Run failed");
        invokeMock.mockImplementation((cmd) => {
            if (cmd === 'run_file') return Promise.reject(error);
            if (cmd === 'write_terminal') return Promise.reject(new Error("Write failed"));
            return Promise.resolve();
        });

        await act(async () => {
            await result.current.runFile('/test/file.rs', saveFile);
        });

        expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining("Failed to run file"));
    });
});
