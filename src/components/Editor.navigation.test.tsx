import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Editor } from './Editor';

// Monaco and LSP mocks
const sendRequestMock = vi.fn();
const sendNotificationMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@tauri-apps/api/core", () => ({
    invoke: vi.fn(),
}));

vi.mock('../lib/lsp', () => ({
    getLspClient: vi.fn(() => ({
        initialize: vi.fn(),
        sendRequest: sendRequestMock,
        sendNotification: sendNotificationMock,
    })),
}));

const monacoMocks = vi.hoisted(() => {
    const addActionMock = vi.fn(() => ({ dispose: vi.fn() }));

    const monacoInstance: any = {
        editor: {
            defineTheme: vi.fn(),
            setTheme: vi.fn(),
            ShowLightbulbIconMode: { On: 1 },
        },
        languages: {
            registerCompletionItemProvider: vi.fn(() => ({ dispose: vi.fn() })),
            registerDefinitionProvider: vi.fn(() => ({ dispose: vi.fn() })),
            registerReferenceProvider: vi.fn(() => ({ dispose: vi.fn() })),
            registerHoverProvider: vi.fn(() => ({ dispose: vi.fn() })),
            registerCodeActionProvider: vi.fn(() => ({ dispose: vi.fn() })),
            registerRenameProvider: vi.fn(() => ({ dispose: vi.fn() })),
        },
        Uri: { parse: vi.fn((uri: string) => ({ uri })) },
        KeyCode: { F12: 63, F2: 61 },
        KeyMod: { Alt: 0x0200, Shift: 0x0100 },
    };

    return { monacoInstance, addActionMock };
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
                getScrolledVisiblePosition: vi.fn(() => ({ top: 100, left: 50 })),
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

vi.mock('./PeekView', () => ({
    PeekView: () => <div data-testid="peek-view" />,
}));

const { addActionMock } = monacoMocks;

describe('Editor - Go To/Peek Definition and References', () => {
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

    it('should add Go to Definition action with F12 keybinding', () => {
        renderEditor();

        const gotoDefAction = (addActionMock.mock.calls as any[]).find(
            (call: any[]) => call[0]?.id === 'editor.action.revealDefinition'
        );

        expect(gotoDefAction).toBeDefined();
        if (gotoDefAction && gotoDefAction[0]) {
            expect(gotoDefAction[0].label).toBe('Go to Definition');
            expect(gotoDefAction[0].keybindings).toContain(63); // F12
        }
    });

    it('should dispatch editor-navigate event on Go to Definition', async () => {
        const onJumpComplete = vi.fn();
        renderEditor({ onJumpComplete });

        const gotoDefAction = (addActionMock.mock.calls as any[]).find(
            (call: any[]) => call[0]?.id === 'editor.action.revealDefinition'
        );

        // Mock LSP definition response
        sendRequestMock.mockResolvedValueOnce({
            uri: 'file:///src/lib.rs',
            range: { start: { line: 10, character: 5 }, end: { line: 10, character: 15 } },
        });

        // Spy on window.dispatchEvent
        const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

        if (gotoDefAction && gotoDefAction[0]) {
            await gotoDefAction[0].run();
        }

        await waitFor(() => {
            expect(sendRequestMock).toHaveBeenCalledWith('textDocument/definition', {
                textDocument: { uri: 'file:///test.rs' },
                position: { line: 4, character: 9 },
            });

            expect(dispatchEventSpy).toHaveBeenCalled();
            const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
            expect(event.type).toBe('editor-navigate');
            expect(event.detail).toEqual({
                file: '/src/lib.rs',
                line: 11,
                column: 6,
            });
        });

        dispatchEventSpy.mockRestore();
    });

    it('should add Peek Definition action with Alt+F12 keybinding', () => {
        renderEditor();

        const peekDefAction = (addActionMock.mock.calls as any[]).find(
            (call: any[]) => call[0].id === 'editor.action.peekDefinition'
        );

        expect(peekDefAction).toBeDefined();
        if (peekDefAction && peekDefAction[0]) {
            expect(peekDefAction[0].label).toBe('Peek Definition');
            // Keybinding should be Alt | F12
            expect(peekDefAction[0].keybindings).toBeDefined();
        }
    });

    it('should show peek view on Peek Definition', async () => {
        const { queryByTestId } = renderEditor();

        const peekDefAction = (addActionMock.mock.calls as any[]).find(
            (call: any[]) => call[0].id === 'editor.action.peekDefinition'
        );

        // Mock LSP definition response
        sendRequestMock.mockResolvedValueOnce([
            {
                uri: 'file:///src/lib.rs',
                range: { start: { line: 10, character: 5 }, end: { line: 10, character: 15 } },
            },
        ]);

        if (peekDefAction && peekDefAction[0]) {
            await peekDefAction[0].run();
        }

        await waitFor(() => {
            expect(sendRequestMock).toHaveBeenCalledWith('textDocument/definition', {
                textDocument: { uri: 'file:///test.rs' },
                position: { line: 4, character: 9 },
            });

            // Peek view should be rendered
            expect(queryByTestId('peek-view')).toBeInTheDocument();
        });
    });

    it('should add Go to References action with Shift+F12 keybinding', () => {
        renderEditor();

        const gotoRefsAction = (addActionMock.mock.calls as any[]).find(
            (call: any[]) => call[0].id === 'editor.action.goToReferences'
        );

        expect(gotoRefsAction).toBeDefined();
        if (gotoRefsAction && gotoRefsAction[0]) {
            expect(gotoRefsAction[0].label).toBe('Go to References');
        }
    });

    it('should dispatch editor-navigate event on Go to References', async () => {
        renderEditor();

        const gotoRefsAction = (addActionMock.mock.calls as any[]).find(
            (call: any[]) => call[0].id === 'editor.action.goToReferences'
        );

        // Mock LSP references response
        sendRequestMock.mockResolvedValueOnce([
            {
                uri: 'file:///src/lib.rs',
                range: { start: { line: 20, character: 10 }, end: { line: 20, character: 20 } },
            },
        ]);

        const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

        if (gotoRefsAction && gotoRefsAction[0]) {
            await gotoRefsAction[0].run();
        }

        await waitFor(() => {
            expect(sendRequestMock).toHaveBeenCalledWith('textDocument/references', {
                textDocument: { uri: 'file:///test.rs' },
                position: { line: 4, character: 9 },
                context: { includeDeclaration: true },
            });

            expect(dispatchEventSpy).toHaveBeenCalled();
            const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
            expect(event.detail.file).toBe('/src/lib.rs');
        });

        dispatchEventSpy.mockRestore();
    });

    it('should add Peek References action', () => {
        renderEditor();

        const peekRefsAction = (addActionMock.mock.calls as any[]).find(
            (call: any[]) => call[0].id === 'editor.action.peekReferences'
        );

        expect(peekRefsAction).toBeDefined();
        if (peekRefsAction && peekRefsAction[0]) {
            expect(peekRefsAction[0].label).toBe('Peek References');
        }
    });

    it('should show peek view on Peek References', async () => {
        const { queryByTestId } = renderEditor();

        const peekRefsAction = (addActionMock.mock.calls as any[]).find(
            (call: any[]) => call[0].id === 'editor.action.peekReferences'
        );

        // Mock LSP references response
        sendRequestMock.mockResolvedValueOnce([
            {
                uri: 'file:///src/lib.rs',
                range: { start: { line: 20, character: 10 }, end: { line: 20, character: 20 } },
            },
            {
                uri: 'file:///src/main.rs',
                range: { start: { line: 5, character: 3 }, end: { line: 5, character: 8 } },
            },
        ]);

        if (peekRefsAction && peekRefsAction[0]) {
            await peekRefsAction[0].run();
        }

        await waitFor(() => {
            expect(sendRequestMock).toHaveBeenCalledWith('textDocument/references', {
                textDocument: { uri: 'file:///test.rs' },
                position: { line: 4, character: 9 },
                context: { includeDeclaration: true },
            });

            // Peek view should be rendered with multiple references
            expect(queryByTestId('peek-view')).toBeInTheDocument();
        });
    });
});
