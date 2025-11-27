import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Editor } from './Editor';


// Monaco mocks (reuse pattern from existing Editor.test.tsx)
const sendRequestMock = vi.fn();
const sendNotificationMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../lib/lsp', () => ({
    getLspClient: vi.fn(() => ({
        initialize: vi.fn(),
        sendRequest: sendRequestMock,
        sendNotification: sendNotificationMock,
        onMessage: vi.fn(),
    })),
}));

vi.mock('../components/Toast', () => ({
    useToast: () => ({
        addToast: vi.fn(),
    }),
}));

const monacoMocks = vi.hoisted(() => {
    const registerRenameProviderMock = vi.fn(() => ({ dispose: vi.fn() }));
    const addActionMock = vi.fn(() => ({ dispose: vi.fn() }));

    const monacoInstance: any = {
        editor: {
            defineTheme: vi.fn(),
            setTheme: vi.fn(),
            ShowLightbulbIconMode: { On: 1 },
            getModel: vi.fn(() => ({})),
        },
        languages: {
            CodeActionTriggerType: { Auto: 1, Manual: 2 },
            registerCompletionItemProvider: vi.fn(() => ({ dispose: vi.fn() })),
            registerDefinitionProvider: vi.fn(() => ({ dispose: vi.fn() })),
            registerReferenceProvider: vi.fn(() => ({ dispose: vi.fn() })),
            registerHoverProvider: vi.fn(() => ({ dispose: vi.fn() })),
            registerCodeActionProvider: vi.fn(() => ({ dispose: vi.fn() })),
            registerRenameProvider: registerRenameProviderMock,
        },
        Uri: {
            parse: vi.fn((uri: string) => ({ uri })),
        },
        KeyCode: { F2: 61, F12: 63 },
        KeyMod: { Alt: 0x0200, Shift: 0x0100 },
    };

    return {
        monacoInstance,
        registerRenameProviderMock,
        addActionMock,
    };
});

vi.mock('@monaco-editor/react', () => {
    const { monacoInstance, addActionMock } = monacoMocks;

    return {
        __esModule: true,
        default: (props: any) => {
            const editor = {
                addAction: addActionMock,
                getAction: vi.fn(() => ({ run: vi.fn() })),
                updateOptions: vi.fn(),
                onMouseDown: vi.fn(() => ({ dispose: vi.fn() })),
                deltaDecorations: vi.fn(() => []),
                onDidChangeCursorPosition: vi.fn(),
                getPosition: vi.fn(() => ({ lineNumber: 5, column: 10 })),
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

vi.mock('monaco-editor', () => ({
    editor: { ShowLightbulbIconMode: { On: 1 } },
}));

vi.mock('./PeekView', () => ({
    PeekView: () => null,
}));

const { registerRenameProviderMock, addActionMock } = monacoMocks;

describe('Editor - Rename Symbol', () => {
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

    it('should register rename provider when lspKey is provided', () => {
        renderEditor();

        expect(registerRenameProviderMock).toHaveBeenCalled();
    });

    it('should handle rename LSP request and return workspace edits', async () => {
        renderEditor();

        const providerCall = (registerRenameProviderMock.mock.calls as any[])[0];
        if (!providerCall || !providerCall[1]) {
            throw new Error('Rename provider not registered');
        }
        const renameProvider = providerCall[1] as any;

        // Mock LSP rename response
        sendRequestMock.mockResolvedValueOnce({
            changes: {
                'file:///test.rs': [
                    {
                        range: { start: { line: 0, character: 3 }, end: { line: 0, character: 7 } },
                        newText: 'new_name',
                    },
                ],
            },
        });

        const model = {};
        const position = { lineNumber: 1, column: 4 };
        const newName = 'new_name';

        const result = await renameProvider.provideRenameEdits(model, position, newName);

        expect(sendRequestMock).toHaveBeenCalledWith('textDocument/rename', {
            textDocument: { uri: 'file:///test.rs' },
            position: { line: 0, character: 3 },
            newName: 'new_name',
        });

        expect(result).toBeDefined();
        expect(result?.edits).toHaveLength(1);
        expect(result?.edits[0].textEdit.text).toBe('new_name');
    });

    it('should handle rename errors gracefully', async () => {
        renderEditor();

        const providerCall = (registerRenameProviderMock.mock.calls as any[])[0];
        if (!providerCall || !providerCall[1]) {
            throw new Error('Rename provider not registered');
        }
        const renameProvider = providerCall[1] as any;

        // Mock LSP error
        sendRequestMock.mockRejectedValueOnce(new Error('LSP not available'));

        const model = {};
        const position = { lineNumber: 1, column: 4 };
        const newName = 'new_name';

        const result = await renameProvider.provideRenameEdits(model, position, newName);

        expect(result).toBeNull();
    });

    it('should return null when LSP returns no changes', async () => {
        renderEditor();

        const providerCall = (registerRenameProviderMock.mock.calls as any[])[0];
        if (!providerCall || !providerCall[1]) {
            throw new Error('Rename provider not registered');
        }
        const renameProvider = providerCall[1] as any;

        // Mock LSP response with no changes
        sendRequestMock.mockResolvedValueOnce({ changes: {} });

        const model = {};
        const position = { lineNumber: 1, column: 4 };
        const newName = 'new_name';

        const result = await renameProvider.provideRenameEdits(model, position, newName);

        expect(result).toBeNull();
    });

    it('should add rename action with F2 keybinding', () => {
        renderEditor();

        // Check if addAction was called for rename

        const renameAction = (addActionMock.mock.calls as any[]).find(
            (call: any[]) => call[0].id === 'editor.action.rename'
        ); expect(renameAction).toBeDefined();
        if (renameAction && renameAction[0]) {
            expect(renameAction[0].label).toBe('Rename Symbol');
            expect(renameAction[0].keybindings).toContain(61); // F2 key code
        }
    });
});
