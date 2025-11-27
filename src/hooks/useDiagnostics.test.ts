import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiagnostics } from './useDiagnostics';
import { getLspClient } from '../lib/lsp';


// Mock LSP module
vi.mock('../lib/lsp', () => {
    const mockClients = new Map<string, any>();

    return {
        getLspClient: vi.fn((language: string) => {
            if (!mockClients.has(language)) {
                const handlers = new Set<any>();
                mockClients.set(language, {
                    onDiagnostics: vi.fn((handler: any) => {
                        handlers.add(handler);
                        return () => handlers.delete(handler);
                    }),
                    _triggerDiagnostics: (payload: any) => {
                        handlers.forEach(h => h(payload));
                    }
                });
            }
            return mockClients.get(language);
        })
    };
});

describe('useDiagnostics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize with empty diagnostics', () => {
        const { result } = renderHook(() => useDiagnostics());

        expect(result.current.diagnosticsByUri.size).toBe(0);
        expect(result.current.getAllDiagnostics()).toEqual([]);
    });

    it('should subscribe to diagnostics from all supported languages', () => {
        renderHook(() => useDiagnostics());

        const getLspClientMock = vi.mocked(getLspClient);

        // Check that getLspClient was called for all supported languages
        expect(getLspClientMock).toHaveBeenCalledWith('rust');
        expect(getLspClientMock).toHaveBeenCalledWith('python');
        expect(getLspClientMock).toHaveBeenCalledWith('typescript');
    });

    it('should add diagnostics when received', async () => {
        const { result } = renderHook(() => useDiagnostics());

        const rustClient = getLspClient('rust') as any;

        act(() => {
            rustClient._triggerDiagnostics({
                uri: 'file:///test.rs',
                language: 'rust',
                diagnostics: [
                    { severity: 1, message: 'Error 1', range: {} }
                ]
            });
        });

        await waitFor(() => {
            expect(result.current.diagnosticsByUri.size).toBe(1);
        });

        const fileDiag = result.current.getDiagnosticsForUri('file:///test.rs');
        expect(fileDiag).toBeDefined();
        expect(fileDiag?.diagnostics).toHaveLength(1);
        expect(fileDiag?.diagnostics[0].message).toBe('Error 1');
    });

    it('should update diagnostics when received again for same URI', async () => {
        const { result } = renderHook(() => useDiagnostics());

        const rustClient = getLspClient('rust') as any;

        act(() => {
            rustClient._triggerDiagnostics({
                uri: 'file:///test.rs',
                language: 'rust',
                diagnostics: [{ severity: 1, message: 'Error 1', range: {} }]
            });
        });

        await waitFor(() => {
            expect(result.current.diagnosticsByUri.size).toBe(1);
        });

        act(() => {
            rustClient._triggerDiagnostics({
                uri: 'file:///test.rs',
                language: 'rust',
                diagnostics: [{ severity: 2, message: 'Warning 1', range: {} }]
            });
        });

        await waitFor(() => {
            const fileDiag = result.current.getDiagnosticsForUri('file:///test.rs');
            expect(fileDiag?.diagnostics).toHaveLength(1);
            expect(fileDiag?.diagnostics[0].message).toBe('Warning 1');
        });
    });

    it('should remove diagnostics when empty array received', async () => {
        const { result } = renderHook(() => useDiagnostics());

        const rustClient = getLspClient('rust') as any;

        act(() => {
            rustClient._triggerDiagnostics({
                uri: 'file:///test.rs',
                language: 'rust',
                diagnostics: [{ severity: 1, message: 'Error 1', range: {} }]
            });
        });

        await waitFor(() => {
            expect(result.current.diagnosticsByUri.size).toBe(1);
        });

        act(() => {
            rustClient._triggerDiagnostics({
                uri: 'file:///test.rs',
                language: 'rust',
                diagnostics: []
            });
        });

        await waitFor(() => {
            expect(result.current.diagnosticsByUri.size).toBe(0);
        });
    });

    it('should get diagnostics by path', async () => {
        const { result } = renderHook(() => useDiagnostics());

        const rustClient = getLspClient('rust') as any;

        act(() => {
            rustClient._triggerDiagnostics({
                uri: 'file:///workspace/test.rs',
                language: 'rust',
                diagnostics: [{ severity: 1, message: 'Error 1', range: {} }]
            });
        });

        await waitFor(() => {
            const fileDiag = result.current.getDiagnosticsForPath('/workspace/test.rs');
            expect(fileDiag).toBeDefined();
        });
    });

    it('should count errors correctly', async () => {
        const { result } = renderHook(() => useDiagnostics());

        const rustClient = getLspClient('rust') as any;

        act(() => {
            rustClient._triggerDiagnostics({
                uri: 'file:///test.rs',
                language: 'rust',
                diagnostics: [
                    { severity: 1, message: 'Error 1', range: {} },
                    { severity: 1, message: 'Error 2', range: {} },
                    { severity: 2, message: 'Warning 1', range: {} }
                ]
            });
        });

        await waitFor(() => {
            expect(result.current.getErrorCount()).toBe(2);
        });
    });

    it('should count warnings correctly', async () => {
        const { result } = renderHook(() => useDiagnostics());

        const rustClient = getLspClient('rust') as any;

        act(() => {
            rustClient._triggerDiagnostics({
                uri: 'file:///test.rs',
                language: 'rust',
                diagnostics: [
                    { severity: 1, message: 'Error 1', range: {} },
                    { severity: 2, message: 'Warning 1', range: {} },
                    { severity: 2, message: 'Warning 2', range: {} }
                ]
            });
        });

        await waitFor(() => {
            expect(result.current.getWarningCount()).toBe(2);
        });
    });

    it('should get all diagnostics across multiple files', async () => {
        const { result } = renderHook(() => useDiagnostics());

        const rustClient = getLspClient('rust') as any;
        const pythonClient = getLspClient('python') as any;

        act(() => {
            rustClient._triggerDiagnostics({
                uri: 'file:///test.rs',
                language: 'rust',
                diagnostics: [{ severity: 1, message: 'Rust Error', range: {} }]
            });
            pythonClient._triggerDiagnostics({
                uri: 'file:///test.py',
                language: 'python',
                diagnostics: [{ severity: 2, message: 'Python Warning', range: {} }]
            });
        });

        await waitFor(() => {
            expect(result.current.getAllDiagnostics()).toHaveLength(2);
        });
    });
});
