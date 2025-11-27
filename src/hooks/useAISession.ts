import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Message, SessionConfig, AIError, Proposal } from '../types/ai';

export function useAISession() {
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [history, setHistory] = useState<Message[]>([]);
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isCancelled, setIsCancelled] = useState(false);
    const lastPromptRef = useRef<string | null>(null);
    const streamUnlistenRef = useRef<UnlistenFn | null>(null);
    const streamErrorUnlistenRef = useRef<UnlistenFn | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const createSession = useCallback(async (config: SessionConfig) => {
        // Tear down previous session listeners
        if (streamUnlistenRef.current) {
            streamUnlistenRef.current();
            streamUnlistenRef.current = null;
        }
        if (streamErrorUnlistenRef.current) {
            streamErrorUnlistenRef.current();
            streamErrorUnlistenRef.current = null;
        }

        setIsLoading(true);
        setError(null);
        setHistory([]); // Clear history for new session
        setProposals([]); // Clear proposals for new session

        try {
            const id = await invoke<string>('ai_create_session', {
                config: { ...config, version: "1.0" }
            });
            setSessionId(id);
            return id;
        } catch (err) {
            setError(String(err));
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchProposals = useCallback(async () => {
        if (!sessionId) return;
        try {
            const list = await invoke<Proposal[]>('ai_list_proposals', { sessionId });
            // Filter for pending only for now
            setProposals(list.filter(p => p.status === 'pending'));
        } catch (err) {
            console.error("Failed to fetch proposals:", err);
            setError(`Failed to fetch proposals: ${String(err)}`);
        }
    }, [sessionId]);

    const sendPrompt = useCallback(async (prompt: string) => {
        let currentSessionId = sessionId;
        if (!currentSessionId) {
            // Auto-create session if none exists
            currentSessionId = await createSession({ mode: "supadev", provider: "internal" });
            if (!currentSessionId) {
                setError("Failed to create AI session");
                return;
            }
        }

        lastPromptRef.current = prompt;
        setIsLoading(true);
        setError(null);

        // Optimistic update
        const userMsg: Message = {
            role: 'user',
            content: prompt,
            timestamp: Date.now()
        };
        setHistory(prev => [...prev, userMsg]);

        try {
            const response = await invoke<string>('ai_send_prompt', {
                sessionId: currentSessionId,
                prompt,
            });

            const assistantMsg: Message = {
                role: 'assistant',
                content: response,
                timestamp: Date.now()
            };
            setHistory(prev => [...prev, assistantMsg]);

            // Check for proposals immediately after response
            await fetchProposals();
        } catch (err) {
            console.error("AI Error:", err);
            // Try to parse structured error
            let errorMsg = String(err);
            try {
                const parsed = JSON.parse(errorMsg) as AIError;
                if (parsed.Auth) errorMsg = `Auth Error: ${parsed.Auth}`;
                else if (parsed.RateLimit !== undefined) errorMsg = "Rate limit exceeded";
                else if (parsed.Server) errorMsg = `Server Error: ${parsed.Server}`;
                else if (parsed.Configuration) errorMsg = `Config Error: ${parsed.Configuration}`;
                else if (parsed.Network) errorMsg = `Network Error: ${parsed.Network}`;
            } catch {
                // Not JSON, keep original string
            }
            setError(errorMsg);
            // Revert optimistic update? Or just show error.
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, fetchProposals, createSession]);

    const sendPromptStreaming = useCallback(async (prompt: string) => {
        let currentSessionId = sessionId;
        if (!currentSessionId) {
            // Auto-create session if none exists
            currentSessionId = await createSession({ mode: "supadev", provider: "internal" });
            if (!currentSessionId) {
                setError("Failed to create AI session");
                return;
            }
        }

        lastPromptRef.current = prompt;
        setIsLoading(true);
        setError(null);

        // Optimistic user message
        const userMsg: Message = {
            role: 'user',
            content: prompt,
            timestamp: Date.now()
        };
        setHistory(prev => [...prev, userMsg]);

        // Placeholder assistant message we will stream into
        const assistantId = `assistant-${Date.now()}`;
        const assistantMsg: Message = {
            id: assistantId,
            role: 'assistant',
            content: '',
            timestamp: Date.now()
        };
        setHistory(prev => [...prev, assistantMsg]);

        try {
            // Clean up any previous listener
            if (streamUnlistenRef.current) {
                streamUnlistenRef.current();
                streamUnlistenRef.current = null;
            }

            if (streamErrorUnlistenRef.current) {
                streamErrorUnlistenRef.current();
                streamErrorUnlistenRef.current = null;
            }

            const unlisten = await listen<{ session_id: string; chunk: string; done: boolean }>(
                'ai_stream_chunk',
                (event) => {
                    const { session_id, chunk, done } = event.payload;
                    if (session_id !== currentSessionId) return;

                    if (!done) {
                        setHistory(prev => prev.map(msg =>
                            msg.id === assistantId
                                ? { ...msg, content: (msg.content || '') + chunk }
                                : msg
                        ));
                    } else {
                        // Stream finished
                        if (streamUnlistenRef.current) {
                            streamUnlistenRef.current();
                            streamUnlistenRef.current = null;
                        }
                        if (streamErrorUnlistenRef.current) {
                            streamErrorUnlistenRef.current();
                            streamErrorUnlistenRef.current = null;
                        }
                        void fetchProposals();
                    }
                }
            );

            streamUnlistenRef.current = unlisten;

            const unlistenError = await listen<{ session_id: string; error: string }>(
                'ai_stream_error',
                (event) => {
                    const { session_id, error: rawError } = event.payload;
                    if (session_id !== currentSessionId) return;

                    let errorMsg = String(rawError);
                    try {
                        const parsed = JSON.parse(errorMsg) as AIError;
                        if (parsed.Auth) errorMsg = `Auth Error: ${parsed.Auth}`;
                        else if (parsed.RateLimit !== undefined) errorMsg = "Rate limit exceeded";
                        else if (parsed.Server) errorMsg = `Server Error: ${parsed.Server}`;
                        else if (parsed.Configuration) errorMsg = `Config Error: ${parsed.Configuration}`;
                        else if (parsed.Network) errorMsg = `Network Error: ${parsed.Network}`;
                    } catch {
                        // Not JSON, keep original string
                    }

                    setError(errorMsg);

                    if (streamUnlistenRef.current) {
                        streamUnlistenRef.current();
                        streamUnlistenRef.current = null;
                    }
                    if (streamErrorUnlistenRef.current) {
                        streamErrorUnlistenRef.current();
                        streamErrorUnlistenRef.current = null;
                    }
                    setIsLoading(false);
                }
            );

            streamErrorUnlistenRef.current = unlistenError;

            // Fire streaming command and get the final processed response
            const finalResponse = await invoke<string>('ai_send_prompt_streaming', {
                sessionId: currentSessionId,
                prompt,
            });

            // Update the assistant message with the final response (which has tool calls stripped/processed)
            setHistory(prev => prev.map(msg =>
                msg.id === assistantId
                    ? { ...msg, content: finalResponse }
                    : msg
            ));
        } catch (err) {
            console.error("AI Streaming Error:", err);
            let errorMsg = String(err);
            try {
                const parsed = JSON.parse(errorMsg) as AIError;
                if (parsed.Auth) errorMsg = `Auth Error: ${parsed.Auth}`;
                else if (parsed.RateLimit !== undefined) errorMsg = "Rate limit exceeded";
                else if (parsed.Server) errorMsg = `Server Error: ${parsed.Server}`;
                else if (parsed.Configuration) errorMsg = `Config Error: ${parsed.Configuration}`;
                else if (parsed.Network) errorMsg = `Network Error: ${parsed.Network}`;
            } catch {
                // Not JSON, keep original string
            }
            setError(errorMsg);
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, fetchProposals, createSession]);

    const retryLastPrompt = useCallback(() => {
        if (lastPromptRef.current) {
            // Remove the last failed user message if it exists (optional, but cleaner)
            // For now, just resend.
            void sendPrompt(lastPromptRef.current);
        }
    }, [sendPrompt]);

    const approveProposal = useCallback(async (proposalId: string) => {
        if (!sessionId) return;
        try {
            const result = await invoke<string>('ai_approve_tool', { sessionId, proposalId });

            // Add tool execution result to history immediately
            const toolResultMsg: Message = {
                id: `tool-result-${Date.now()}`,
                role: 'assistant',
                content: `Tool executed successfully. ${result}`,
                timestamp: Date.now()
            };
            setHistory(prev => [...prev, toolResultMsg]);

            // Refresh proposals to update UI
            await fetchProposals();
        } catch (err) {
            setError(`Failed to approve: ${String(err)}`);
        }
    }, [sessionId, fetchProposals]);

    const rejectProposal = useCallback(async (proposalId: string) => {
        if (!sessionId) return;
        try {
            await invoke('ai_reject_tool', { sessionId, proposalId });
            await fetchProposals();
        } catch (err) {
            setError(`Failed to reject: ${String(err)}`);
        }
    }, [sessionId, fetchProposals]);

    // Cancel ongoing request
    const cancelRequest = useCallback(() => {
        // Stop listening to stream events
        if (streamUnlistenRef.current) {
            streamUnlistenRef.current();
            streamUnlistenRef.current = null;
        }
        if (streamErrorUnlistenRef.current) {
            streamErrorUnlistenRef.current();
            streamErrorUnlistenRef.current = null;
        }

        // Abort any pending request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        setIsCancelled(true);
        setIsLoading(false);

        // Add a system message indicating cancellation
        const cancelMsg: Message = {
            id: `cancel-${Date.now()}`,
            role: 'assistant',
            content: '[Request cancelled by user]',
            timestamp: Date.now()
        };
        setHistory(prev => [...prev, cancelMsg]);
    }, []);

    // Cleanup stream listeners on unmount
    useEffect(() => {
        return () => {
            if (streamUnlistenRef.current) {
                streamUnlistenRef.current();
            }
            if (streamErrorUnlistenRef.current) {
                streamErrorUnlistenRef.current();
            }
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    const runCompass = useCallback(async (query: string) => {
        setIsLoading(true);
        setError(null);
        setHistory([]); // Clear history for new Compass run

        // Optimistic user message
        const userMsg: Message = {
            role: 'user',
            content: query,
            timestamp: Date.now()
        };
        setHistory(prev => [...prev, userMsg]);

        try {
            // Clean up any previous listener
            if (streamUnlistenRef.current) {
                streamUnlistenRef.current();
                streamUnlistenRef.current = null;
            }

            const unlisten = await listen<{ session_id: string; event: any }>(
                'compass_event',
                (eventPayload) => {
                    const { event } = eventPayload.payload;

                    // Handle different event types
                    if (event.Step) {
                        const step = event.Step;
                        const msg: Message = {
                            id: `step-${Date.now()}`,
                            role: 'assistant',
                            content: `**Thought:** ${step.thought}\n\n**Action:**\n\`\`\`\n${step.action}\n\`\`\`\n\n**Observation:**\n${step.observation}`,
                            timestamp: Date.now()
                        };
                        setHistory(prev => [...prev, msg]);
                    } else if (event.Decision) {
                        const decision = event.Decision;
                        let content = '';
                        if (decision.Stop) content = `**Meta-Thinker:** STOP. Answer: ${decision.Stop}`;
                        else if (decision.Reflect) content = `**Meta-Thinker:** REFLECT. Feedback: ${decision.Reflect}`;
                        else if (decision.Pivot) content = `**Meta-Thinker:** PIVOT. Feedback: ${decision.Pivot}`;
                        else if (decision.Verify) content = `**Meta-Thinker:** VERIFY. Feedback: ${decision.Verify}`;
                        else if (decision === 'Continue') content = `**Meta-Thinker:** CONTINUE`;
                        else content = `**Meta-Thinker:** ${JSON.stringify(decision)}`;

                        const msg: Message = {
                            id: `decision-${Date.now()}`,
                            role: 'system', // Use system role for meta-decisions
                            content: content,
                            timestamp: Date.now()
                        };
                        setHistory(prev => [...prev, msg]);
                    } else if (event.Answer) {
                        const answer = event.Answer;
                        const msg: Message = {
                            id: `answer-${Date.now()}`,
                            role: 'assistant',
                            content: answer,
                            timestamp: Date.now()
                        };
                        setHistory(prev => [...prev, msg]);
                    } else if (event.Error) {
                        setError(event.Error);
                        setIsLoading(false);
                    }
                }
            );

            streamUnlistenRef.current = unlisten;

            await invoke('ai_compass_run_streaming', {
                query,
                sessionId: sessionId || undefined, // Use existing session ID if available, or let backend generate one
            });

        } catch (err) {
            console.error("Compass Error:", err);
            setError(String(err));
        } finally {
            setIsLoading(false);
        }
    }, [sessionId]);

    return {
        sessionId,
        history,
        isLoading,
        error,
        isCancelled,
        proposals,
        createSession,
        sendPrompt,
        sendPromptStreaming,
        runCompass,
        retryLastPrompt,
        cancelRequest,
        fetchProposals,
        approveProposal,
        rejectProposal
    };
}
