import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Editor } from './Editor';
import { getLspClient } from '../lib/lsp';

// --- Mocks ---

const sendRequestMock = vi.fn();
const sendNotificationMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../lib/lsp', () => {
    return {
        getLspClient: vi.fn(() => ({
            initialize: vi.fn(),
            sendRequest: sendRequestMock,
            sendNotification: sendNotificationMock,
            onMessage: vi.fn(),
        })),
    };
});

vi.mock('../components/Toast', () => ({
    useToast: () => ({
        addToast: vi.fn(),
    }),
}));

// Monaco-related mocks must be hoisted
const monacoMocks = vi.hoisted(() => {
    const registerCompletionItemProviderMock = vi.fn(() => ({ dispose: vi.fn() }));
    const registerDefinitionProviderMock = vi.fn(() => ({ dispose: vi.fn() }));
    const registerReferenceProviderMock = vi.fn(() => ({ dispose: vi.fn() }));
    const registerHoverProviderMock = vi.fn(() => ({ dispose: vi.fn() }));
    const registerCodeActionProviderMock = vi.fn(() => ({ dispose: vi.fn() }));
    const addActionMock = vi.fn(() => ({ dispose: vi.fn() }));
    const deltaDecorationsMock = vi.fn(() => []);

    function Range(this: any, sLine: number, sCol: number, eLine: number, eCol: number) {
        return {
            startLineNumber: sLine,
            startColumn: sCol,
            endLineNumber: eLine,
            endColumn: eCol,
        };
    }

    const monacoInstance: any = {
        editor: {
            defineTheme: vi.fn(),
            setTheme: vi.fn(),
            ShowLightbulbIconMode: { On: 1 },
        },
        languages: {
            registerCompletionItemProvider: registerCompletionItemProviderMock,
            registerDefinitionProvider: registerDefinitionProviderMock,
            registerReferenceProvider: registerReferenceProviderMock,
            registerHoverProvider: registerHoverProviderMock,
            registerCodeActionProvider: registerCodeActionProviderMock,
            registerRenameProvider: vi.fn(() => ({ dispose: vi.fn() })),
            CodeActionKind: {
                QuickFix: 'quickfix',
                RefactorRewrite: 'refactor.rewrite',
            },
            CodeActionTriggerType: {
                Auto: 1,
                Manual: 2,
            },
        },
        Uri: {
            parse: vi.fn((uri: string) => ({ uri })),
        },
        KeyCode: { F12: 63, F2: 61 },
        KeyMod: { Alt: 0x0200, Shift: 0x0100 },
        Range,
    };

    return {
        monacoInstance,
        registerCompletionItemProviderMock,
        registerDefinitionProviderMock,
        registerReferenceProviderMock,
        registerHoverProviderMock,
        registerCodeActionProviderMock,
        addActionMock,
        deltaDecorationsMock,
    };
});

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn((cmd) => {
        if (cmd === 'read_file') return Promise.resolve('code content');
        return Promise.resolve(null);
    }),
}));

// Mock contextCollector
vi.mock('../lib/contextCollector', () => ({
    collectContext: vi.fn().mockResolvedValue([
        { type: 'selection', content: 'selected code', relevance: 100, file: '/test.rs' }
    ]),
    formatContextForAI: vi.fn().mockReturnValue('Formatted context'),
}));

// Mock @monaco-editor/react so that it immediately calls onMount
vi.mock('@monaco-editor/react', () => {
    const {
        monacoInstance,
        addActionMock,
        deltaDecorationsMock,
    } = monacoMocks;

    return {
        __esModule: true,
        default: (props: any) => {
            const editor = {
                addAction: addActionMock,
                updateOptions: vi.fn(),
                onMouseDown: vi.fn(() => ({ dispose: vi.fn() })),
                deltaDecorations: deltaDecorationsMock,
                onDidChangeCursorPosition: vi.fn(),
                getSelection: vi.fn(() => ({
                    isEmpty: () => false,
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: 1,
                    endColumn: 5,
                })),
                getModel: vi.fn(() => ({
                    getValueInRange: vi.fn(() => 'selected code'),
                })),
            };

            if (props.onMount) {
                props.onMount(editor, monacoInstance);
            }

            return <div data-testid="editor" />;
        },
        useMonaco: () => monacoInstance,
    };
});

vi.mock('monaco-editor', () => {
    const { monacoInstance } = monacoMocks;
    return {
        editor: {
            ShowLightbulbIconMode: { On: 1 },
        },
        Range: monacoInstance.Range,
    };
});

const {
    registerCompletionItemProviderMock,
    registerDefinitionProviderMock,
    registerReferenceProviderMock,
    registerHoverProviderMock,
    registerCodeActionProviderMock,
} = monacoMocks;

const getLspClientMock = vi.mocked(getLspClient);

describe('Editor - LSP providers and AI actions', () => {
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

    it('registers LSP completion, definition, reference and hover providers and calls LSP client correctly', async () => {
        renderEditor();

        expect(getLspClientMock).toHaveBeenCalledWith('rust');
        expect(registerCompletionItemProviderMock).toHaveBeenCalled();
        expect(registerDefinitionProviderMock).toHaveBeenCalled();
        expect(registerReferenceProviderMock).toHaveBeenCalled();
        expect(registerHoverProviderMock).toHaveBeenCalled();
        expect(registerCompletionItemProviderMock).toHaveBeenCalledWith('rust', expect.any(Object));

        const completionProvider = (registerCompletionItemProviderMock.mock.calls as any[])[0]?.[1] as any;
        if (!completionProvider) throw new Error('Completion provider not registered');
        await completionProvider.provideCompletionItems({}, { lineNumber: 2, column: 3 });
        expect(sendRequestMock).toHaveBeenCalledWith('textDocument/completion', expect.any(Object));

        const definitionProvider = (registerDefinitionProviderMock.mock.calls as any[])[0]?.[1] as any;
        if (!definitionProvider) throw new Error('Definition provider not registered');

        const lspResp: any[] = [{
            uri: 'file:///test.rs',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }
        }];
        sendRequestMock.mockResolvedValueOnce(lspResp);
        await definitionProvider.provideDefinition({}, { lineNumber: 1, column: 1 });
        expect(sendRequestMock).toHaveBeenCalledWith('textDocument/definition', expect.any(Object));

        const hoverProvider = (registerHoverProviderMock.mock.calls as any[])[0]?.[1] as any;
        if (!hoverProvider) throw new Error('Hover provider not registered');
        sendRequestMock.mockResolvedValueOnce({ contents: { value: 'hover info' } });
        await hoverProvider.provideHover({}, { lineNumber: 1, column: 1 });
        expect(sendRequestMock).toHaveBeenCalledWith('textDocument/hover', expect.any(Object));
    });

    it('sends didOpen notification when path and lspKey are provided', () => {
        renderEditor();

        expect(sendNotificationMock).toHaveBeenCalledWith('textDocument/didOpen', {
            textDocument: {
                uri: 'file:///test.rs',
                languageId: 'rust',
                version: 1,
                text: 'fn main() {}',
            },
        });
    });

    it('triggers AI inline actions via CodeAction provider and onTriggerAI callback', async () => {
        const onTriggerAI = vi.fn();
        renderEditor({ onTriggerAI });

        expect(registerCodeActionProviderMock).toHaveBeenCalled();
        const provider = (registerCodeActionProviderMock.mock.calls as any[])[0]?.[1] as any;
        if (!provider) throw new Error('Code action provider not registered');

        const model = {
            getValueInRange: vi.fn(() => 'code range'),
        };
        const range: any = {
            isEmpty: () => false,
            startLineNumber: 1,
            endLineNumber: 1,
        };
        const context = { markers: [] };

        const result = await provider.provideCodeActions(model, range, context, {} as any);
        expect(result.actions.length).toBeGreaterThan(0);

        // Inline actions should call onTriggerAI when run
        const explain = result.actions.find((a: any) => a.title === '💡 Ask AI to Explain');
        const refactor = result.actions.find((a: any) => a.title === '🔧 Ask AI to Refactor');

        expect(explain).toBeDefined();
        expect(refactor).toBeDefined();

        await explain.action.run();
        await refactor.action.run();

        expect(onTriggerAI).toHaveBeenCalledTimes(2);
        expect(onTriggerAI.mock.calls[0][0]).toContain('Explain this code');
        expect(onTriggerAI.mock.calls[1][0]).toContain('Refactor this code');
    });

    it('triggers AI fix action for diagnostics', async () => {
        const onTriggerAI = vi.fn();
        renderEditor({ onTriggerAI });

        const provider = (registerCodeActionProviderMock.mock.calls as any[])[0]?.[1] as any;
        if (!provider) throw new Error('Code action provider not registered');

        const model = {
            getValueInRange: vi.fn(() => 'erroneous code'),
        };
        const range: any = {
            isEmpty: () => false,
            startLineNumber: 1,
            endLineNumber: 1,
        };
        const marker = {
            message: 'Something is wrong',
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 10,
        };
        const context = { markers: [marker] };

        const result = await provider.provideCodeActions(model, range, context, {} as any);
        const fix = result.actions.find((a: any) => a.title.startsWith('🤖 Fix with AI'));

        expect(fix).toBeDefined();
        fix.action.run();

        expect(onTriggerAI).toHaveBeenCalledTimes(1);
        expect(onTriggerAI.mock.calls[0][0]).toContain('Fix this error: "Something is wrong"');
    });
});
