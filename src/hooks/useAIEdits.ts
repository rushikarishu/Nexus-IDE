import { useState, useCallback } from 'react';
import { useAISession } from './useAISession';

export interface AIEditState {
    isEditing: boolean;
    originalContent: string | null;
    modifiedContent: string | null;
    diffVisible: boolean;
    error: string | null;
}

export function useAIEdits(
    filePath: string | null,
    currentContent: string,
    onApply: (newContent: string) => void
) {
    const { sessionId, createSession } = useAISession();
    const [state, setState] = useState<AIEditState>({
        isEditing: false,
        originalContent: null,
        modifiedContent: null,
        diffVisible: false,
        error: null
    });

    const requestEdit = useCallback(async (instruction: string, selection?: string) => {
        if (!filePath) return;

        setState(prev => ({
            ...prev,
            isEditing: true,
            originalContent: currentContent,
            modifiedContent: "", // Start empty for streaming
            diffVisible: true,
            error: null
        }));

        // Construct prompt
        const prompt = `
You are an AI coding assistant.
Task: ${instruction}
File: ${filePath}
${selection ? `Selected Code:\n\`\`\`\n${selection}\n\`\`\`\n` : ''}
Current File Content:
\`\`\`
${currentContent}
\`\`\`

Please provide the FULL updated file content. Do not use markdown code blocks, just the raw code.
`;

        // We need a custom streaming handler here because useAISession updates its own history state.
        // But we want to update *our* modifiedContent state.
        // Actually, useAISession's sendPromptStreaming updates history.
        // We might need to "hijack" or listen to the same event?
        // Or, simpler: useAISession is designed for chat.
        // For edits, we might want a specialized function or just reuse the logic.

        // Let's reuse the logic but we need to capture the stream.
        // Since useAISession encapsulates the listener, we can't easily hook into it without modifying it.
        // However, we can use the 'ai_stream_chunk' event directly if we know the session ID.

        // Let's assume we can use a fresh session for edits to avoid polluting chat history?
        // Or just use the same session but listen to events.

        // For now, let's implement a direct invoke/listen pattern similar to useAISession 
        // but specifically for this hook to keep it self-contained and focused on the edit content.

        // Actually, to avoid code duplication, maybe we should modify useAISession to expose the listener?
        // Or just copy the streaming logic here since it's specific to "generating code" vs "chatting".

        // Let's implement a focused streaming handler here.

        try {
            // Ensure session exists
            let currentSessionId = sessionId;
            if (!currentSessionId) {
                currentSessionId = await createSession({ mode: "supadev", provider: "internal" });
            }

            if (!currentSessionId) {
                setState(prev => ({ ...prev, error: "Failed to create AI session", isEditing: false }));
                return;
            }

            // Start listening
            const { listen } = await import('@tauri-apps/api/event');
            const { invoke } = await import('@tauri-apps/api/core');

            const unlisten = await listen<{ session_id: string; chunk: string; done: boolean }>(
                'ai_stream_chunk',
                (event) => {
                    const { session_id, chunk, done } = event.payload;
                    if (session_id !== currentSessionId) return;

                    if (!done) {
                        setState(prev => ({
                            ...prev,
                            modifiedContent: (prev.modifiedContent || "") + chunk
                        }));
                    } else {
                        unlisten();
                        setState(prev => ({ ...prev, isEditing: false }));
                    }
                }
            );

            // Send prompt
            await invoke('ai_send_prompt_streaming', {
                session_id: currentSessionId,
                prompt,
            });

        } catch (err) {
            setState(prev => ({ ...prev, error: String(err), isEditing: false }));
        }

    }, [filePath, currentContent, sessionId, createSession]);

    const acceptEdit = useCallback(() => {
        if (state.modifiedContent) {
            onApply(state.modifiedContent);
        }
        setState(prev => ({
            ...prev,
            isEditing: false,
            diffVisible: false,
            originalContent: null,
            modifiedContent: null
        }));
    }, [state.modifiedContent, onApply]);

    const rejectEdit = useCallback(() => {
        setState(prev => ({
            ...prev,
            isEditing: false,
            diffVisible: false,
            originalContent: null,
            modifiedContent: null
        }));
    }, []);

    return {
        ...state,
        requestEdit,
        acceptEdit,
        rejectEdit
    };
}
