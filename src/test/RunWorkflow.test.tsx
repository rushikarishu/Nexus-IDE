import { render, act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTerminalState } from '../hooks/useTerminalState';
import { Terminal } from '../components/Terminal';
import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';

// Mocks
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
    confirm: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(() => Promise.resolve(() => { })),
}));

vi.mock('../hooks/useToast', () => ({
    useToast: vi.fn(() => ({
        error: vi.fn(),
        success: vi.fn(),
    })),
}));

// Mock XTerm
const mocks = vi.hoisted(() => ({
    mockXTermOpen: vi.fn(),
    mockXTermWrite: vi.fn(),
    mockXTermFocus: vi.fn(),
    mockXTermDispose: vi.fn(),
    mockXTermOnData: vi.fn(),
    mockXTermLoadAddon: vi.fn(),
    mockFit: vi.fn(),
    mockProposeDimensions: vi.fn(),
}));

vi.mock('@xterm/xterm', () => {
    return {
        Terminal: class {
            open = mocks.mockXTermOpen;
            write = mocks.mockXTermWrite;
            focus = mocks.mockXTermFocus;
            dispose = mocks.mockXTermDispose;
            onData = mocks.mockXTermOnData;
            loadAddon = mocks.mockXTermLoadAddon;
        }
    };
});

vi.mock('@xterm/addon-fit', () => {
    return {
        FitAddon: class {
            fit = mocks.mockFit;
            proposeDimensions = mocks.mockProposeDimensions;
        }
    };
});

const invokeMock = vi.mocked(invoke);
const confirmMock = vi.mocked(confirm);

// Simplified App component for integration test
function TestApp() {
    const { isOpen, setTerminalId, runFile } = useTerminalState();

    const handleRun = async () => {
        await runFile('/test/main.rs', async () => {
            // Mock save
            await invoke('save_file', { path: '/test/main.rs', content: 'test' });
        });
    };

    return (
        <div>
            <button onClick={handleRun}>Run</button>
            {isOpen && (
                <Terminal
                    visible={isOpen}
                    onTerminalReady={setTerminalId}
                />
            )}
        </div>
    );
}

describe('Run Workflow Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // @ts-ignore
        window.__TAURI_INTERNALS__ = {};
        confirmMock.mockResolvedValue(true);
        invokeMock.mockResolvedValue(undefined);
    });

    it('should initialize terminal and run file when Run button is clicked', async () => {
        render(<TestApp />);

        // Wait for terminal to initialize and set ID
        await waitFor(() => {
            expect(invokeMock).toHaveBeenCalledWith('create_terminal', expect.anything());
        });

        // Click Run
        const runButton = screen.getByText('Run');
        await act(async () => {
            fireEvent.click(runButton);
        });

        // Verify flow
        expect(confirmMock).toHaveBeenCalled();
        expect(invokeMock).toHaveBeenCalledWith('save_file', expect.anything());
        expect(invokeMock).toHaveBeenCalledWith('run_file', expect.objectContaining({
            path: '/test/main.rs',
            terminal_id: expect.stringMatching(/^term-/),
        }));
    });
});
