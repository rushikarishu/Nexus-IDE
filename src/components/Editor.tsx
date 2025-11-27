import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import MonacoEditor, { useMonaco, OnMount, DiffEditor } from "@monaco-editor/react";
import * as MonacoEditorNS from "monaco-editor";
import { getLspClient } from "../lib/lsp";
import { PeekView, PeekLocation } from "./PeekView";
import { getCurrentTheme, themes } from "../lib/themes";
import { useToast } from "../components/Toast";
import { extractVariable, applyExtraction, canExtractVariable, extractFunction, applyFunctionExtraction, canExtractFunction } from "../lib/refactoring";
import { applyTextEdits } from "../lib/textUtils";
import { useAIEdits } from "../hooks/useAIEdits";
import { collectContext, formatContextForAI } from "../lib/contextCollector";

interface EditorProps {
    value: string;
    language: string;
    onChange: (value: string | undefined) => void;
    onCursorChange?: (line: number, col: number) => void;
    height?: string;
    path?: string;
    lspKey?: string; // Language key for LSP (optional, for LSP-enabled languages)
    jumpTo?: { line: number; column: number } | null;
    onJumpComplete?: () => void;
    onTriggerAI?: (prompt: string) => void;
}

interface CompletionItem {
    label: string;
    kind: number;
    insertText?: string;
    detail?: string;
    documentation?: string | { value: string };
}

interface LspLocation {
    uri: string;
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

interface WorkspaceEdit {
    changes?: {
        [uri: string]: Array<{
            range: {
                start: { line: number; character: number };
                end: { line: number; character: number };
            };
            newText: string;
        }>;
    };
}

interface CodeAction {
    title: string;
    kind?: string;
    diagnostics?: unknown[];
    edit?: WorkspaceEdit;
    command?: {
        command: string;
        title?: string;
        arguments?: unknown[];
    };
}

type ExtendedCodeAction = MonacoEditorNS.languages.CodeAction & {
    action?: {
        id: string;
        title: string;
        run: () => void;
    };
};

export function Editor({ value, language, onChange, onCursorChange, path, lspKey, jumpTo, onJumpComplete, onTriggerAI, height = "100%" }: EditorProps) {
    const monaco = useMonaco();
    const editorRef = useRef<MonacoEditorNS.editor.IStandaloneCodeEditor | null>(null);
    const [peekView, setPeekView] = useState<{ locations: PeekLocation[]; title: string; position: { top: number; left: number } } | null>(null);
    const [breakpoints, setBreakpoints] = useState<number[]>([]);
    const decorationsRef = useRef<string[]>([]);
    const { addToast } = useToast();

    // Helper to show error toast
    const toast = {
        error: (message: string) => addToast(message, 'error', 4000)
    };

    // AI Edits Hook
    const {
        requestEdit,
        acceptEdit,
        rejectEdit,
        diffVisible,
        originalContent,
        modifiedContent,
        isEditing: isAIEditing
    } = useAIEdits(path || null, value, (newContent) => {
        onChange(newContent);
    });

    // Expose requestEdit to parent via ref or event? 
    // For now, let's listen to a custom event 'trigger-ai-edit'
    useEffect(() => {
        const handleTriggerEdit = (e: Event) => {
            const customEvent = e as CustomEvent<{ instruction: string; selection?: string }>;
            requestEdit(customEvent.detail.instruction, customEvent.detail.selection);
        };
        window.addEventListener('trigger-ai-edit', handleTriggerEdit);
        return () => window.removeEventListener('trigger-ai-edit', handleTriggerEdit);
    }, [requestEdit]);

    // Handle Breakpoints
    useEffect(() => {
        if (!editorRef.current || !monaco) return;
        const editor = editorRef.current;

        // Update decorations
        const newDecorations: MonacoEditorNS.editor.IModelDeltaDecoration[] = breakpoints.map(line => ({
            range: new monaco.Range(line, 1, line, 1),
            options: {
                isWholeLine: true,
                glyphMarginClassName: 'codicon codicon-debug-breakpoint text-red-500', // Requires codicons or custom CSS
                glyphMarginHoverMessage: { value: `Breakpoint on line ${line}` }
            }
        }));

        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);

        // Sync with DAP
        if (path) {
            // We need to import dap dynamically or pass it as prop to avoid circular deps if any, 
            // but here we can just import it.
            import("../lib/dap").then(dap => {
                dap.setBreakpoints(path, breakpoints).catch(e => console.error("Failed to set breakpoints:", e));
            });
        }

    }, [breakpoints, monaco, path]);

    const handleEditorDidMount: OnMount = (editor, _monaco) => {
        editorRef.current = editor;

        // Enable glyph margin
        editor.updateOptions({
            glyphMargin: true
        });

        // Mouse down handler for breakpoints
        editor.onMouseDown((e) => {
            if (e.target.type === MonacoEditorNS.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                const lineNumber = e.target.position?.lineNumber;
                if (lineNumber) {
                    setBreakpoints(prev => {
                        if (prev.includes(lineNumber)) {
                            return prev.filter(l => l !== lineNumber);
                        } else {
                            return [...prev, lineNumber];
                        }
                    });
                }
            }
        });
    };

    // Handle jump to location
    useEffect(() => {
        if (jumpTo && editorRef.current) {
            const editor = editorRef.current;
            editor.setPosition({ lineNumber: jumpTo.line, column: jumpTo.column });
            editor.revealPositionInCenter({ lineNumber: jumpTo.line, column: jumpTo.column });
            editor.focus();

            if (onJumpComplete) {
                onJumpComplete();
            }
        }
    }, [jumpTo, onJumpComplete]);

    useEffect(() => {
        if (monaco) {
            const currentTheme = getCurrentTheme();

            // Define dark theme
            monaco.editor.defineTheme("nexus-dark", {
                base: "vs-dark",
                inherit: true,
                rules: [],
                colors: {
                    "editor.background": themes.dark.colors.editorBackground,
                    "editor.foreground": themes.dark.colors.editorForeground,
                    "editor.lineHighlightBackground": themes.dark.colors.editorLineHighlight,
                    "editorLineNumber.foreground": themes.dark.colors.editorLineNumber,
                    "editorIndentGuide.background": themes.dark.colors.editorIndentGuide,
                    "editor.selectionBackground": themes.dark.colors.editorSelection,
                    "editorCursor.foreground": themes.dark.colors.editorCursor,
                },
            });

            // Define light theme
            monaco.editor.defineTheme("nexus-light", {
                base: "vs",
                inherit: true,
                rules: [],
                colors: {
                    "editor.background": themes.light.colors.editorBackground,
                    "editor.foreground": themes.light.colors.editorForeground,
                    "editor.lineHighlightBackground": themes.light.colors.editorLineHighlight,
                    "editorLineNumber.foreground": themes.light.colors.editorLineNumber,
                    "editorIndentGuide.background": themes.light.colors.editorIndentGuide,
                    "editor.selectionBackground": themes.light.colors.editorSelection,
                    "editorCursor.foreground": themes.light.colors.editorCursor,
                },
            });

            // Set current theme
            monaco.editor.setTheme(currentTheme === 'light' ? 'nexus-light' : 'nexus-dark');
        }
    }, [monaco]);

    // Listen for theme changes
    useEffect(() => {
        if (!monaco) return;

        const handleThemeChange = (e: Event) => {
            const customEvent = e as CustomEvent<string>;
            const newTheme = customEvent.detail;
            monaco.editor.setTheme(newTheme === 'light' ? 'nexus-light' : 'nexus-dark');
        };

        window.addEventListener('theme-changed', handleThemeChange);
        return () => window.removeEventListener('theme-changed', handleThemeChange);
    }, [monaco]);

    // Register LSP providers if lspKey is provided
    useEffect(() => {
        if (!monaco || !path || !lspKey) return;

        const lspClient = getLspClient(lspKey);

        // Register completion provider for this language
        const completionDisposable = monaco.languages.registerCompletionItemProvider(language, {
            provideCompletionItems: async (_model, position) => {
                try {
                    const response = await lspClient.sendRequest("textDocument/completion", {
                        textDocument: { uri: `file://${path}` },
                        position: { line: position.lineNumber - 1, character: position.column - 1 },
                    }) as { items: CompletionItem[] } | null;

                    if (!response || !response.items) {
                        return { suggestions: [] };
                    }

                    const suggestions: MonacoEditorNS.languages.CompletionItem[] = response.items.map((item) => ({
                        label: item.label,
                        kind: item.kind,
                        insertText: item.insertText || item.label,
                        detail: item.detail,
                        documentation: item.documentation,
                        range: {
                            startLineNumber: position.lineNumber,
                            startColumn: position.column,
                            endLineNumber: position.lineNumber,
                            endColumn: position.column,
                        },
                        insertTextRules: MonacoEditorNS.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    }));

                    return { suggestions };
                } catch (e) {
                    console.error("LSP Completion Error:", e);
                    // Don't show toast for completions - too noisy
                    return { suggestions: [] };
                }
            },
        });

        // Register definition provider
        const defDisposable = monaco.languages.registerDefinitionProvider(language, {
            provideDefinition: async (_model, position) => {
                try {
                    const response = await lspClient.sendRequest("textDocument/definition", {
                        textDocument: { uri: `file://${path}` },
                        position: { line: position.lineNumber - 1, character: position.column - 1 },
                    });

                    if (!response) return null;

                    const locations = (Array.isArray(response) ? response : [response]) as LspLocation[];

                    return locations.map((loc) => ({
                        uri: monaco.Uri.parse(loc.uri),
                        range: {
                            startLineNumber: loc.range.start.line + 1,
                            startColumn: loc.range.start.character + 1,
                            endLineNumber: loc.range.end.line + 1,
                            endColumn: loc.range.end.character + 1,
                        },
                    }));
                } catch (e) {
                    console.error("LSP Definition Error:", e);
                    toast.error(`Failed to find definition: ${e instanceof Error ? e.message : 'LSP error'}`);
                    return null;
                }
            },
        });

        // Register reference provider
        const refDisposable = monaco.languages.registerReferenceProvider(language, {
            provideReferences: async (_model, position, _context) => {
                try {
                    const response = await lspClient.sendRequest("textDocument/references", {
                        textDocument: { uri: `file://${path}` },
                        position: { line: position.lineNumber - 1, character: position.column - 1 },
                        context: { includeDeclaration: true },
                    }) as LspLocation[] | null;

                    if (!response) return null;

                    return response.map((loc) => ({
                        uri: monaco.Uri.parse(loc.uri),
                        range: {
                            startLineNumber: loc.range.start.line + 1,
                            startColumn: loc.range.start.character + 1,
                            endLineNumber: loc.range.end.line + 1,
                            endColumn: loc.range.end.character + 1,
                        },
                    }));
                } catch (e) {
                    console.error("LSP References Error:", e);
                    toast.error(`Failed to find references: ${e instanceof Error ? e.message : 'LSP error'}`);
                    return null;
                }
            },
        });

        // Register hover provider
        const hoverDisposable = monaco.languages.registerHoverProvider(language, {
            provideHover: async (_model, position) => {
                try {
                    const response = await lspClient.sendRequest("textDocument/hover", {
                        textDocument: { uri: `file://${path}` },
                        position: { line: position.lineNumber - 1, character: position.column - 1 },
                    }) as { contents: { value: string } | string } | null;

                    if (!response || !response.contents) return null;

                    const contents = typeof response.contents === 'string'
                        ? [{ value: response.contents }]
                        : Array.isArray(response.contents)
                            ? response.contents
                            : [response.contents];

                    return {
                        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                        contents: contents as MonacoEditorNS.IMarkdownString[],
                    };
                } catch (e) {
                    console.error("LSP Hover Error:", e);
                    // Don't show toast for hover - too noisy
                    return null;
                }
            },
        });

        return () => {
            completionDisposable.dispose();
            defDisposable.dispose();
            refDisposable.dispose();
            hoverDisposable.dispose();
        };
    }, [monaco, path, language, lspKey]);

    // Register Rename Provider
    useEffect(() => {
        if (!monaco || !path || !lspKey) return;

        const lspClient = getLspClient(lspKey);

        const renameDisposable = monaco.languages.registerRenameProvider(language, {
            provideRenameEdits: async (_model, position, newName) => {
                try {
                    const response = await lspClient.sendRequest("textDocument/rename", {
                        textDocument: { uri: `file://${path}` },
                        position: { line: position.lineNumber - 1, character: position.column - 1 },
                        newName,
                    }) as WorkspaceEdit | null;

                    if (!response || !response.changes) return null;

                    // Convert LSP WorkspaceEdit to Monaco WorkspaceEdit
                    const edits: MonacoEditorNS.languages.IWorkspaceTextEdit[] = [];
                    const closedFileEdits: Map<string, Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }>> = new Map();

                    for (const [uri, changes] of Object.entries(response.changes)) {
                        const model = monaco.editor.getModel(monaco.Uri.parse(uri));
                        if (model) {
                            // Open file - let Monaco handle it
                            changes.forEach(change => {
                                edits.push({
                                    resource: monaco.Uri.parse(uri),
                                    versionId: undefined,
                                    textEdit: {
                                        range: {
                                            startLineNumber: change.range.start.line + 1,
                                            startColumn: change.range.start.character + 1,
                                            endLineNumber: change.range.end.line + 1,
                                            endColumn: change.range.end.character + 1,
                                        },
                                        text: change.newText,
                                    },
                                });
                            });
                        } else {
                            // Closed file - handle manually
                            const filePath = uri.replace("file://", "");
                            closedFileEdits.set(filePath, changes);
                        }
                    }

                    // Apply edits to closed files
                    if (closedFileEdits.size > 0) {
                        await Promise.all(Array.from(closedFileEdits.entries()).map(async ([filePath, changes]) => {
                            try {
                                const content = await invoke<string>("read_file", { path: filePath });
                                const newContent = applyTextEdits(content, changes);
                                await invoke("write_file", { path: filePath, content: newContent });
                            } catch (e) {
                                console.error(`Failed to apply rename to closed file ${filePath}:`, e);
                                toast.error(`Failed to rename in ${filePath}`);
                            }
                        }));
                        toast.error(`Renamed symbol in ${closedFileEdits.size} closed files`); // Using 'error' style for visibility, or success
                        // Actually let's use success if available, but toast.error is defined in the component helper
                        // The component defines `const toast = { error: ... }`. It doesn't have success.
                        // But `useToast` returns `addToast`.
                        addToast(`Renamed symbol in ${closedFileEdits.size} closed files`, 'success', 3000);
                    }

                    // Return null if no edits were generated for open files
                    if (edits.length === 0) return null;

                    return { edits };
                } catch (e) {
                    console.error("LSP Rename Error:", e);
                    toast.error(`Failed to rename symbol: ${e instanceof Error ? e.message : 'LSP error'}`);
                    return null;
                }
            },
        });

        return () => {
            renameDisposable.dispose();
        };
    }, [monaco, path, language, lspKey]);

    // Handle Document Sync (didOpen)
    useEffect(() => {
        if (path && lspKey) {
            const lspClient = getLspClient(lspKey);
            // Send didOpen
            void lspClient.sendNotification("textDocument/didOpen", {
                textDocument: {
                    uri: `file://${path}`,
                    languageId: language,
                    version: 1,
                    text: value,
                },
            }).catch(console.error);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path, language, lspKey]); // Only on path change (new file loaded)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleEditorChange = (value: string | undefined, _event: any) => {
        onChange(value);
    };

    const [fontSize, setFontSize] = useState(() => {
        const saved = localStorage.getItem("editor-font-size");
        return saved ? parseInt(saved, 10) : 14;
    });

    useEffect(() => {
        const handleFontSizeChange = (e: Event) => {
            const customEvent = e as CustomEvent<number>;
            setFontSize(customEvent.detail);
        };

        window.addEventListener("font-size-changed", handleFontSizeChange);
        return () => window.removeEventListener("font-size-changed", handleFontSizeChange);
    }, []);

    // Register Code Actions Provider (LSP + AI + Source Actions)
    useEffect(() => {
        if (!monaco || !language) return;

        const disposable = monaco.languages.registerCodeActionProvider(language, {
            provideCodeActions: async (model, range, context) => {
                const actions: ExtendedCodeAction[] = [];

                // 1. LSP Code Actions (if LSP is available)
                if (path && lspKey) {
                    try {
                        const lspClient = getLspClient(lspKey);

                        // Get all code actions (quick fixes, refactorings, source actions)
                        const lspActions = await lspClient.sendRequest("textDocument/codeAction", {
                            textDocument: { uri: `file://${path}` },
                            range: {
                                start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
                                end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
                            },
                            context: {
                                diagnostics: context.markers.map(m => ({
                                    range: {
                                        start: { line: m.startLineNumber - 1, character: m.startColumn - 1 },
                                        end: { line: m.endLineNumber - 1, character: m.endColumn - 1 },
                                    },
                                    message: m.message,
                                    severity: m.severity,
                                })),
                                only: [], // Request all types of code actions
                                triggerKind: context.trigger === monaco.languages.CodeActionTriggerType.Auto ? 1 : 2,
                            },
                        }) as CodeAction[] | null;

                        if (lspActions && Array.isArray(lspActions)) {
                            lspActions.forEach(lspAction => {
                                const action: ExtendedCodeAction = {
                                    title: lspAction.title,
                                    kind: lspAction.kind || "quickfix",
                                    diagnostics: [],
                                    edit: lspAction.edit
                                        ? {
                                            edits: Object.entries(lspAction.edit.changes || {}).map(([uri, changes]) => ({
                                                resource: monaco.Uri.parse(uri),
                                                textEdits: changes.map(change => ({
                                                    range: {
                                                        startLineNumber: change.range.start.line + 1,
                                                        startColumn: change.range.start.character + 1,
                                                        endLineNumber: change.range.end.line + 1,
                                                        endColumn: change.range.end.character + 1,
                                                    },
                                                    text: change.newText,
                                                })),
                                            })),
                                        } as MonacoEditorNS.languages.WorkspaceEdit
                                        : undefined,
                                    // Mark preferred actions
                                    isPreferred: lspAction.kind?.includes('quickfix') || lspAction.kind?.includes('refactor'),
                                };
                                actions.push(action);
                            });
                        }
                    } catch (e) {
                        console.error("LSP Code Action Error:", e);
                        // Don't show toast for code actions - they're optional
                    }
                }

                // 2. AI Inline Actions (on selection)
                if (!range.isEmpty()) {
                    const explainAction: ExtendedCodeAction = {
                        title: "💡 Ask AI to Explain",
                        kind: "quickfix",
                        diagnostics: [],
                        action: {
                            id: "ai.explain",
                            title: "Ask AI to Explain",
                            run: async () => {
                                if (onTriggerAI && path && lspKey) {
                                    // Gather context
                                    addToast('Gathering context...', 'info', 2000);
                                    const context = await collectContext(
                                        path,
                                        {
                                            start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
                                            end: { line: range.endLineNumber - 1, character: range.endColumn - 1 }
                                        },
                                        lspKey,
                                        1500
                                    );
                                    const contextStr = formatContextForAI(context);
                                    const prompt = `Explain this code:\n\n${contextStr}\n\nPlease explain what this code does and how it works.`;
                                    onTriggerAI(prompt);
                                }
                            }
                        }
                    };

                    const refactorAction: ExtendedCodeAction = {
                        title: "🔧 Ask AI to Refactor",
                        kind: "refactor",
                        diagnostics: [],
                        action: {
                            id: "ai.refactor",
                            title: "Ask AI to Refactor",
                            run: async () => {
                                if (onTriggerAI && path && lspKey) {
                                    addToast('Gathering context...', 'info', 2000);
                                    const context = await collectContext(
                                        path,
                                        {
                                            start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
                                            end: { line: range.endLineNumber - 1, character: range.endColumn - 1 }
                                        },
                                        lspKey,
                                        1500
                                    );
                                    const contextStr = formatContextForAI(context);
                                    const prompt = `Refactor this code to be cleaner and more efficient:\n\n${contextStr}\n\nPlease suggest improvements.`;
                                    onTriggerAI(prompt);
                                }
                            }
                        }
                    };

                    actions.push(explainAction);
                    actions.push(refactorAction);
                }

                // 3. Fix Diagnostics (on error/warning)
                if (context.markers.length > 0) {
                    context.markers.forEach(marker => {
                        if (marker.startLineNumber <= range.endLineNumber && marker.endLineNumber >= range.startLineNumber) {
                            const fixAction: ExtendedCodeAction = {
                                title: `🤖 Fix with AI: ${marker.message}`,
                                kind: "quickfix",
                                diagnostics: [marker],
                                isPreferred: true,
                                action: {
                                    id: "ai.fix",
                                    title: "AI: Fix this",
                                    run: () => {
                                        const text = model.getValueInRange({
                                            startLineNumber: marker.startLineNumber,
                                            startColumn: marker.startColumn,
                                            endLineNumber: marker.endLineNumber,
                                            endColumn: marker.endColumn
                                        });
                                        onTriggerAI?.(`Fix this error: "${marker.message}"\n\nCode context:\n\`\`\`${language}\n${text}\n\`\`\``);
                                    }
                                }
                            };
                            actions.push(fixAction);
                        }
                    });
                }

                return {
                    actions: actions,
                    dispose: () => { }
                };
            }
        });

        return () => {
            disposable.dispose();
        };
    }, [monaco, language, onTriggerAI, path, lspKey]);

    // Register editor actions (Rename, Go To/Peek Definition/References)
    useEffect(() => {
        if (!monaco || !editorRef.current) return;

        const editor = editorRef.current;
        const disposables: MonacoEditorNS.IDisposable[] = [];

        // AI Actions (existing)
        const explainAction = editor.addAction({
            id: 'ai-explain',
            label: 'Ask AI to Explain',
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 1.5,
            run: (ed) => {
                const selection = ed.getSelection();
                if (selection && !selection.isEmpty()) {
                    const text = ed.getModel()?.getValueInRange(selection);
                    if (text && onTriggerAI) {
                        onTriggerAI(`Explain this code:\n\`\`\`${language}\n${text}\n\`\`\``);
                    }
                }
            }
        });
        disposables.push(explainAction);

        const refactorAction = editor.addAction({
            id: 'ai-refactor',
            label: 'Ask AI to Refactor',
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 1.6,
            run: (ed) => {
                const selection = ed.getSelection();
                if (selection && !selection.isEmpty()) {
                    const text = ed.getModel()?.getValueInRange(selection);
                    if (text && onTriggerAI) {
                        onTriggerAI(`Refactor this code:\n\`\`\`${language}\n${text}\n\`\`\``);
                    }
                }
            }
        });
        disposables.push(refactorAction);

        // Rename Symbol (F2)
        if (lspKey) {
            const renameAction = editor.addAction({
                id: 'editor.action.rename',
                label: 'Rename Symbol',
                keybindings: [monaco.KeyCode.F2],
                contextMenuGroupId: '1_modification',
                contextMenuOrder: 1.1,
                run: () => {
                    void editor.getAction('editor.action.rename')?.run();
                }
            });
            disposables.push(renameAction);

            // Organize Imports (Shift+Alt+O)
            const organizeImportsAction = editor.addAction({
                id: 'editor.action.organizeImports',
                label: 'Organize Imports',
                keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyO],
                contextMenuGroupId: '1_modification',
                contextMenuOrder: 1.2,
                run: async () => {
                    if (!path) return;

                    try {
                        const lspClient = getLspClient(lspKey);
                        const model = editor.getModel();
                        if (!model) return;

                        // Request source.organizeImports code action
                        const actions = await lspClient.sendRequest("textDocument/codeAction", {
                            textDocument: { uri: `file://${path}` },
                            range: {
                                start: { line: 0, character: 0 },
                                end: {
                                    line: model.getLineCount() - 1,
                                    character: model.getLineLength(model.getLineCount())
                                },
                            },
                            context: {
                                diagnostics: [],
                                only: ["source.organizeImports"],
                                triggerKind: 2, // Invoked
                            },
                        }) as CodeAction[] | null;

                        if (actions && actions.length > 0) {
                            const organizeAction = actions[0];
                            if (organizeAction.edit && organizeAction.edit.changes) {
                                // Apply workspace edits
                                const edits: MonacoEditorNS.editor.IIdentifiedSingleEditOperation[] = [];

                                Object.entries(organizeAction.edit.changes).forEach(([uri, changes]) => {
                                    if (uri === `file://${path}`) {
                                        changes.forEach(change => {
                                            edits.push({
                                                range: {
                                                    startLineNumber: change.range.start.line + 1,
                                                    startColumn: change.range.start.character + 1,
                                                    endLineNumber: change.range.end.line + 1,
                                                    endColumn: change.range.end.character + 1,
                                                },
                                                text: change.newText,
                                            });
                                        });
                                    }
                                });

                                if (edits.length > 0) {
                                    editor.executeEdits('organizeImports', edits);
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Error organizing imports:', e);
                    }
                }
            });
            disposables.push(organizeImportsAction);

            // Extract Variable (Shift+Ctrl+V)
            const extractVarAction = editor.addAction({
                id: 'editor.action.extractVariable',
                label: 'Extract Variable',
                keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV],
                contextMenuGroupId: 'refactor',
                contextMenuOrder: 2,
                run: (ed) => {
                    const selection = ed.getSelection();
                    const model = ed.getModel();

                    if (!selection || !model) return;

                    // Check if extraction is possible
                    if (!canExtractVariable(model, selection)) {
                        toast.error('Cannot extract: please select a valid expression');
                        return;
                    }

                    // Perform extraction
                    const result = extractVariable(model, selection);
                    if (!result) {
                        toast.error('Failed to extract variable');
                        return;
                    }

                    // Apply the extraction (cast to IStandaloneCodeEditor)
                    const success = applyExtraction(editor, model, result, language);
                    if (success) {
                        addToast(`Extracted to variable: ${result.variableName}`, 'success', 3000);
                    } else {
                        toast.error('Failed to apply extraction');
                    }
                }
            });
            disposables.push(extractVarAction);

            // Extract Function (Shift+Ctrl+F)
            const extractFuncAction = editor.addAction({
                id: 'editor.action.extractFunction',
                label: 'Extract Function',
                keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF],
                contextMenuGroupId: 'refactor',
                contextMenuOrder: 3,
                run: (ed) => {
                    const selection = ed.getSelection();
                    const model = ed.getModel();

                    if (!selection || !model) return;

                    // Check if extraction is possible
                    if (!canExtractFunction(model, selection)) {
                        toast.error('Cannot extract: please select a valid block of code');
                        return;
                    }

                    // Perform extraction
                    const result = extractFunction(model, selection);
                    if (!result) {
                        toast.error('Failed to extract function');
                        return;
                    }

                    // Apply the extraction
                    const success = applyFunctionExtraction(editor, model, result, language);
                    if (success) {
                        addToast(`Extracted to function: ${result.variableName}`, 'success', 3000);
                    } else {
                        toast.error('Failed to apply extraction');
                    }
                }
            });
            disposables.push(extractFuncAction);

            // Go to Definition (F12)
            const gotoDefAction = editor.addAction({
                id: 'editor.action.revealDefinition',
                label: 'Go to Definition',
                keybindings: [monaco.KeyCode.F12],
                contextMenuGroupId: 'navigation',
                contextMenuOrder: 1.2,
                run: async () => {
                    const position = editor.getPosition();
                    if (!position || !path) return;

                    try {
                        const lspClient = getLspClient(lspKey);
                        const response = await lspClient.sendRequest("textDocument/definition", {
                            textDocument: { uri: `file://${path}` },
                            position: { line: position.lineNumber - 1, character: position.column - 1 },
                        });

                        if (!response) return;

                        const locations = (Array.isArray(response) ? response : [response]) as LspLocation[];
                        if (locations.length > 0) {
                            const loc = locations[0];
                            const filePath = loc.uri.replace('file://', '');
                            // Use the provided jump mechanism
                            if (onJumpComplete) {
                                // Signal to App.tsx to handle file opening and navigation
                                window.dispatchEvent(new CustomEvent('editor-navigate', {
                                    detail: {
                                        file: filePath,
                                        line: loc.range.start.line + 1,
                                        column: loc.range.start.character + 1,
                                    }
                                }));
                            }
                        } else {
                            toast.error('No definition found for this symbol');
                        }
                    } catch (e) {
                        console.error("Go to Definition Error:", e);
                        toast.error(`Failed to go to definition: ${e instanceof Error ? e.message : 'LSP error'}`);
                    }
                }
            });
            disposables.push(gotoDefAction);
        }

        // Peek Definition (Alt+F12)
        if (lspKey) {
            const peekDefAction = editor.addAction({
                id: 'editor.action.peekDefinition',
                label: 'Peek Definition',
                keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.F12],
                contextMenuGroupId: 'navigation',
                contextMenuOrder: 1.3,
                run: async () => {
                    const position = editor.getPosition();
                    if (!position || !path) return;

                    try {
                        const lspClient = getLspClient(lspKey);
                        const response = await lspClient.sendRequest("textDocument/definition", {
                            textDocument: { uri: `file://${path}` },
                            position: { line: position.lineNumber - 1, character: position.column - 1 },
                        });

                        if (!response) return;

                        const locations = (Array.isArray(response) ? response : [response]) as LspLocation[];
                        if (locations.length > 0) {
                            const coords = editor.getScrolledVisiblePosition(position);
                            setPeekView({
                                locations: locations as PeekLocation[],
                                title: 'Definition',
                                position: {
                                    top: (coords?.top || 0) + 20,
                                    left: (coords?.left || 0),
                                },
                            });
                        } else {
                            toast.error('No definition found for this symbol');
                        }
                    } catch (e) {
                        console.error("Peek Definition Error:", e);
                        toast.error(`Failed to peek definition: ${e instanceof Error ? e.message : 'LSP error'}`);

                    }
                }
            });
            disposables.push(peekDefAction);
        }

        // Go to References (Shift+F12)
        if (lspKey) {
            const gotoRefsAction = editor.addAction({
                id: 'editor.action.goToReferences',
                label: 'Go to References',
                keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
                contextMenuGroupId: 'navigation',
                contextMenuOrder: 1.4,
                run: async () => {
                    const position = editor.getPosition();
                    if (!position || !path) return;

                    try {
                        const lspClient = getLspClient(lspKey);
                        const response = await lspClient.sendRequest("textDocument/references", {
                            textDocument: { uri: `file://${path}` },
                            position: { line: position.lineNumber - 1, character: position.column - 1 },
                            context: { includeDeclaration: true },
                        }) as LspLocation[] | null;

                        if (response && response.length > 0) {
                            const loc = response[0];
                            const filePath = loc.uri.replace('file://', '');
                            window.dispatchEvent(new CustomEvent('editor-navigate', {
                                detail: {
                                    file: filePath,
                                    line: loc.range.start.line + 1,
                                    column: loc.range.start.character + 1,
                                }
                            }));
                        } else {
                            toast.error('No references found for this symbol');
                        }
                    } catch (e) {
                        console.error("Go to References Error:", e);
                        toast.error(`Failed to find references: ${e instanceof Error ? e.message : 'LSP error'}`);

                    }
                }
            });
            disposables.push(gotoRefsAction);
        }

        // Peek References (Shift+Alt+F12)
        if (lspKey) {
            const peekRefsAction = editor.addAction({
                id: 'editor.action.peekReferences',
                label: 'Peek References',
                keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.F12],
                contextMenuGroupId: 'navigation',
                contextMenuOrder: 1.5,
                run: async () => {
                    const position = editor.getPosition();
                    if (!position || !path) return;

                    try {
                        const lspClient = getLspClient(lspKey);
                        const response = await lspClient.sendRequest("textDocument/references", {
                            textDocument: { uri: `file://${path}` },
                            position: { line: position.lineNumber - 1, character: position.column - 1 },
                            context: { includeDeclaration: true },
                        }) as LspLocation[] | null;

                        if (response && response.length > 0) {
                            const coords = editor.getScrolledVisiblePosition(position);
                            setPeekView({
                                locations: response as PeekLocation[],
                                title: 'References',
                                position: {
                                    top: (coords?.top || 0) + 20,
                                    left: (coords?.left || 0),
                                },
                            });
                        } else {
                            toast.error('No references found for this symbol');
                        }
                    } catch (e) {
                        console.error("Peek References Error:", e);
                        toast.error(`Failed to peek references: ${e instanceof Error ? e.message : 'LSP error'}`);

                    }
                }
            });
            disposables.push(peekRefsAction);
        }

        return () => {
            disposables.forEach(d => d.dispose());
        };
    }, [monaco, language, onTriggerAI, lspKey, path, onJumpComplete]);

    const handleNavigate = (file: string, line: number, column: number) => {
        // Dispatch custom event for App.tsx to handle
        window.dispatchEvent(new CustomEvent('editor-navigate', {
            detail: { file, line, column }
        }));
        setPeekView(null);
    };

    return (
        <div style={{ height, position: 'relative' }}>
            {diffVisible && originalContent && modifiedContent !== null ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div style={{
                        padding: '8px',
                        background: themes.dark.colors.background,
                        borderBottom: `1px solid ${themes.dark.colors.border}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <span style={{ fontWeight: 'bold', color: themes.dark.colors.foreground }}>AI Suggested Changes</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={acceptEdit}
                                disabled={isAIEditing}
                                style={{
                                    padding: '4px 12px',
                                    background: '#4caf50',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: isAIEditing ? 'wait' : 'pointer',
                                    opacity: isAIEditing ? 0.7 : 1
                                }}
                            >
                                Accept
                            </button>
                            <button
                                onClick={rejectEdit}
                                style={{
                                    padding: '4px 12px',
                                    background: '#f44336',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                Reject
                            </button>
                        </div>
                    </div>
                    <DiffEditor
                        height="100%"
                        original={originalContent}
                        modified={modifiedContent}
                        language={language}
                        theme={getCurrentTheme() === 'light' ? 'nexus-light' : 'nexus-dark'}
                        options={{
                            readOnly: true,
                            renderSideBySide: false
                        }}
                    />
                </div>
            ) : (
                <MonacoEditor
                    height="100%"
                    language={language}
                    value={value}
                    theme="vs-dark" // Will be overridden by onMount
                    onMount={(editor, monaco) => {
                        handleEditorDidMount(editor, monaco);
                        editor.onDidChangeCursorPosition((e) => {
                            if (onCursorChange) {
                                onCursorChange(e.position.lineNumber, e.position.column);
                            }
                        });
                    }}
                    onChange={handleEditorChange}
                    options={{
                        minimap: { enabled: true },
                        fontSize: fontSize,
                        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                        fontLigatures: true,
                        smoothScrolling: true,
                        cursorBlinking: "smooth",
                        cursorSmoothCaretAnimation: "on",
                        padding: { top: 16, bottom: 16 },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                    }}
                />
            )}

            {peekView && (
                <PeekView
                    locations={peekView.locations}
                    title={peekView.title}
                    position={peekView.position}
                    onClose={() => setPeekView(null)}
                    onJumpTo={handleNavigate}
                />
            )}
        </div>
    );
}
