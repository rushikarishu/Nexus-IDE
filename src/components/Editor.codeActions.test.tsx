import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Editor } from './Editor';
import { getLspClient } from '../lib/lsp';

// Monaco and LSP mocks
const sendRequestMock = vi.fn();
const sendNotificationMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../lib/lsp', () => ({
    getLspClient: vi.fn(() => ({
        initialize: vi.fn(),
        sendRequest: sendRequestMock,
        sendNotification: sendNotificationMock,
    })),
}));

const monacoMocks = vi.hoisted(() => {
    const registerCodeActionProviderMock = vi.fn(() => ({ dispose: vi.fn() }));

    const monacoInstance: any = {
        editor: {
            defineTheme: vi.fn(),
            setTheme: vi.fn(),
            ShowLightbulbIconMode: { On: 1 },
        },
        languages: {
            CodeActionTriggerType: { Auto: 1, Manual: 2 },
            registerCompletionItemProvider: vi.fn(() => ({ dispose: vi.fn() })),
            registerDefinitionProvider: vi.fn(() => ({ dispose: vi.fn() })),
            registerReferenceProvider: vi.fn(() => ({ dispose: vi.fn() })),
            registerHoverProvider: vi.fn(() => ({ dispose: vi.fn() })),
            registerCodeActionProvider: registerCodeActionProviderMock,
            registerRenameProvider: vi.fn(() => ({ dispose: vi.fn() })),
        },
        Uri: { parse: vi.fn((uri: string) => ({ uri })) },
        KeyCode: { F12: 63, F2: 61 },
        KeyMod: { Alt: 0x0200, Shift: 0x0100 },
    };

    return { monacoInstance, registerCodeActionProviderMock };
});

vi.mock('@monaco-editor/react', () => {
    const { monacoInstance } = monacoMocks;

    return {
        __esModule: true,
        default: (props: any) => {
            const editor = {
                addAction: vi.fn(() => ({ dispose: vi.fn() })),
                updateOptions: vi.fn(),
                onMouseDown: vi.fn(() => ({ dispose: vi.fn() })),
                deltaDecorations: vi.fn(() => []),
                onDidChangeCursorPosition: vi.fn(),
                getPosition: vi.fn(() => null),
                getSelection: vi.fn(() => null),
                getModel: vi.fn(() => null),
            };

            if (props.onMount) {
                props.onMount(editor, monacoInstance);
            }

            return <div data-testid="editor" />;
        },
        useMonaco: () => monacoInstance,
    };
});

vi.mock('../components/Toast', () => ({
    useToast: () => ({
        addToast: vi.fn(),
    }),
}));

vi.mock('monaco-editor', () => ({
    editor: { ShowLightbulbIconMode: { On: 1 } },
}));

const { registerCodeActionProviderMock } = monacoMocks;
const getLspClientMock = vi.mocked(getLspClient);

describe('Editor - LSP Code Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function renderEditor(extraProps: Partial<React.ComponentProps<typeof Editor>> = {}) {
        return render(
            <Editor
                value={"fn main() {}"}
                language="rust"
                onChange={() => { }}
                path="/test.rs"
                lspKey="rust"
                {...extraProps}
            />
        );
    }

    it('should register code action provider', () => {
        renderEditor();

        expect(getLspClientMock).toHaveBeenCalledWith('rust');
        expect(registerCodeActionProviderMock).toHaveBeenCalled();
    });

    it('should fetch LSP code actions and merge with AI actions', async () => {
        renderEditor({ onTriggerAI: vi.fn() });

        const providerCall = (registerCodeActionProviderMock.mock.calls as any[])[0];
        if (!providerCall || !providerCall[1]) throw new Error('Code action provider not registered');
        const provider = providerCall[1] as any;

        // Mock LSP code actions response
        sendRequestMock.mockResolvedValueOnce([
            {
                title: 'Add missing import',
                kind: 'quickfix',
                edit: {
                    changes: {
                        'file:///test.rs': [
                            {
                                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                                newText: 'use std::io;\\n',
                            },
                        ],
                    },
                },
            },
        ]);

        const model = { getValueInRange: vi.fn(() => 'some code') };
        const range: any = {
            isEmpty: () => false,
            startLineNumber: 5,
            startColumn: 10,
            endLineNumber: 5,
            endColumn: 20,

        };
        const context = { markers: [] };

        const result = await provider.provideCodeActions(model, range, context);

        await waitFor(() => {
            expect(sendRequestMock).toHaveBeenCalledWith('textDocument/codeAction', {
                textDocument: { uri: 'file:///test.rs' },
                range: {
                    start: { line: 4, character: 9 },
                    end: { line: 4, character: 19 },
                },
                context: {
                    diagnostics: [],
                    only: [],
                    triggerKind: 2,
                },
            });
        });

        expect(result.actions).toBeDefined();
        expect(result.actions.length).toBeGreaterThan(0);

        // Should have LSP action
        const lspAction = result.actions.find((a: any) => a.title === 'Add missing import');
        expect(lspAction).toBeDefined();

        // Should also have AI actions
        const aiAction = result.actions.find((a: any) => a.title === '💡 Ask AI to Explain');
        expect(aiAction).toBeDefined();
    });

    it('should include diagnostics in LSP code action request', async () => {
        renderEditor();

        const providerCall = (registerCodeActionProviderMock.mock.calls as any[])[0];
        if (!providerCall || !providerCall[1]) throw new Error('Code action provider not registered');
        const provider = providerCall[1] as any;

        sendRequestMock.mockResolvedValueOnce([]);

        const model = { getValueInRange: vi.fn() };
        const range: any = {
            isEmpty: () => true,
            startLineNumber: 5,
            startColumn: 10,
            endLineNumber: 5,
            endColumn: 10,
        };
        const marker = {
            startLineNumber: 5,
            startColumn: 10,
            endLineNumber: 5,
            endColumn: 20,
            message: 'unused variable',
            severity: 2,
        };
        const context = { markers: [marker] };

        await provider.provideCodeActions(model, range, context);

        expect(sendRequestMock).toHaveBeenCalledWith(
            'textDocument/codeAction',
            expect.objectContaining({
                context: expect.objectContaining({
                    diagnostics: [
                        {
                            range: {
                                start: { line: 4, character: 9 },
                                end: { line: 4, character: 19 },
                            },
                            message: 'unused variable',
                            severity: 2,
                        },
                    ],
                }),
            })
        );
    });

    it('should convert LSP workspace edits to Monaco format', async () => {
        renderEditor();

        const providerCall = (registerCodeActionProviderMock.mock.calls as any[])[0];
        if (!providerCall || !providerCall[1]) throw new Error('Code action provider not registered');
        const provider = providerCall[1] as any;

        // Mock LSP code actions with workspace edits
        sendRequestMock.mockResolvedValueOnce([
            {
                title: 'Fix issue',
                kind: 'quickfix',
                edit: {
                    changes: {
                        'file:///test.rs': [
                            {
                                range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
                                newText: 'fixed code',
                            },
                        ],
                        'file:///other.rs': [
                            {
                                range: { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } },
                                newText: 'other',
                            },
                        ],
                    },
                },
            },
        ]);

        const model = { getValueInRange: vi.fn() };
        const range: any = {
            isEmpty: () => true,
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1,
        };
        const context = { markers: [] };

        const result = await provider.provideCodeActions(model, range, context);

        const lspAction = result.actions.find((a: any) => a.title === 'Fix issue');
        expect(lspAction).toBeDefined();
        expect(lspAction.edit).toBeDefined();
        expect(lspAction.edit.edits).toBeDefined();
        expect(lspAction.edit.edits.length).toBe(2); // Two files modified
    });

    it('should handle LSP code action errors gracefully', async () => {
        renderEditor({ onTriggerAI: vi.fn() });

        const providerCall = (registerCodeActionProviderMock.mock.calls as any[])[0];
        if (!providerCall || !providerCall[1]) throw new Error('Code action provider not registered');
        const provider = providerCall[1] as any;

        // Mock LSP error
        sendRequestMock.mockRejectedValueOnce(new Error('LSP error'));

        const model = { getValueInRange: vi.fn(() => 'code') };
        const range: any = {
            isEmpty: () => false,
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 5,
        };
        const context = { markers: [] };

        const result = await provider.provideCodeActions(model, range, context);

        // Should still return AI actions even if LSP fails
        expect(result.actions.length).toBeGreaterThan(0);
        const aiAction = result.actions.find((a: any) => a.title === '💡 Ask AI to Explain');
        expect(aiAction).toBeDefined();
    });
});
