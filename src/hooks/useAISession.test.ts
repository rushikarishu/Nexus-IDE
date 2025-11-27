import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAISession } from './useAISession';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Mocks
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

describe('useAISession', () => {
    beforeEach(() => {
        // Reset all mocks so per-test mockResolvedValueOnce chains don't leak between tests
        vi.resetAllMocks();
    });

    describe('createSession', () => {
        it('should create a new AI session', async () => {
            invokeMock.mockResolvedValue('session-123');

            const { result } = renderHook(() => useAISession());

            let sessionId: string | null = null;
            await act(async () => {
                sessionId = await result.current.createSession({
                    mode: 'supadev',
                    provider: 'internal'
                });
            });

            expect(sessionId).toBe('session-123');
            expect(result.current.sessionId).toBe('session-123');
            expect(invokeMock).toHaveBeenCalledWith('ai_create_session', {
                config: { mode: 'supadev', provider: 'internal', version: '1.0' }
            });
        });

        it('should handle creation errors', async () => {
            invokeMock.mockRejectedValue('Failed to create session');

            const { result } = renderHook(() => useAISession());

            let sessionId: string | null = 'not-null';
            await act(async () => {
                sessionId = await result.current.createSession({
                    mode: 'supadev',
                    provider: 'internal'
                });
            });

            expect(sessionId).toBeNull();
            expect(result.current.error).toBe('Failed to create session');
        });
    });

    describe('sendPrompt', () => {
        it('should send prompt and receive response', async () => {
            invokeMock
                .mockResolvedValueOnce('session-123') // createSession
                .mockResolvedValueOnce('AI response') // sendPrompt
                .mockResolvedValueOnce([]); // fetchProposals

            const { result } = renderHook(() => useAISession());

            await act(async () => {
                await result.current.createSession({ mode: 'supadev', provider: 'internal' });
            });

            await act(async () => {
                await result.current.sendPrompt('Hello AI');
            });

            expect(result.current.history).toHaveLength(2);
            expect(result.current.history[0]).toMatchObject({
                role: 'user',
                content: 'Hello AI'
            });
            expect(result.current.history[1]).toMatchObject({
                role: 'assistant',
                content: 'AI response'
            });
        });

        it('should auto-create session if none exists', async () => {
            invokeMock
                .mockResolvedValueOnce('session-123') // auto createSession
                .mockResolvedValueOnce('AI response') // sendPrompt
                .mockResolvedValueOnce([]); // fetchProposals

            const { result } = renderHook(() => useAISession());

            await act(async () => {
                await result.current.sendPrompt('Hello AI');
            });

            expect(result.current.sessionId).toBe('session-123');
            expect(invokeMock).toHaveBeenCalledWith('ai_create_session', expect.any(Object));
        });

        it('should handle send errors', async () => {
            invokeMock
                .mockResolvedValueOnce('session-123')
                .mockRejectedValueOnce(new Error('Network error'));

            const { result } = renderHook(() => useAISession());

            await act(async () => {
                await result.current.createSession({ mode: 'supadev', provider: 'internal' });
            });

            await act(async () => {
                await result.current.sendPrompt('Hello AI');
            });

            // sendPrompt should handle errors internally and set a user-friendly error string
            await waitFor(() => {
                expect(result.current.error).toContain('Network error');
            }, { timeout: 2000 });
        });

        it('should fetch proposals after successful response', async () => {
            const mockProposals = [{ id: 'prop-1', status: 'pending' }];
            invokeMock
                .mockResolvedValueOnce('session-123')
                .mockResolvedValueOnce('AI response')
                .mockResolvedValueOnce(mockProposals);

            const { result } = renderHook(() => useAISession());

            await act(async () => {
                await result.current.createSession({ mode: 'supadev', provider: 'internal' });
            });

            await act(async () => {
                await result.current.sendPrompt('Hello AI');
            });

            await waitFor(() => {
                expect(invokeMock).toHaveBeenCalledWith('ai_list_proposals', {
                    sessionId: 'session-123'
                });
            });
        });
    });

    describe('sendPromptStreaming', () => {
        it('should handle streaming responses', async () => {
            let streamHandler: any = null;
            listenMock.mockImplementation(async (event, handler) => {
                if (event === 'ai_stream_chunk') {
                    streamHandler = handler;
                }
                return () => { };
            });

            invokeMock
                .mockResolvedValueOnce('session-123')
                .mockResolvedValueOnce(undefined); // streaming invoke

            const { result } = renderHook(() => useAISession());

            await act(async () => {
                await result.current.createSession({ mode: 'supadev', provider: 'internal' });
            });

            await act(async () => {
                await result.current.sendPromptStreaming('Hello AI');
            });

            // Wait for handler to be set
            await waitFor(() => {
                expect(streamHandler).not.toBeNull();
            });

            // Simulate stream chunks
            act(() => {
                streamHandler({ payload: { session_id: 'session-123', chunk: 'Hello', done: false } });
            });

            await waitFor(() => {
                const lastMsg = result.current.history[result.current.history.length - 1];
                expect(lastMsg.content).toContain('Hello');
            });
        });
    });

    describe('approveProposal', () => {
        it('should invoke ai_approve_tool', async () => {
            invokeMock
                .mockResolvedValueOnce('session-123')
                .mockResolvedValueOnce(undefined) // approve
                .mockResolvedValueOnce([]); // fetchProposals

            const { result } = renderHook(() => useAISession());

            await act(async () => {
                await result.current.createSession({ mode: 'supadev', provider: 'internal' });
            });

            await act(async () => {
                await result.current.approveProposal('prop-1');
            });

            await waitFor(() => {
                expect(invokeMock).toHaveBeenCalledWith('ai_approve_tool', {
                    sessionId: 'session-123',
                    proposalId: 'prop-1'
                });
            });
        });
    });

    describe('rejectProposal', () => {
        it('should invoke ai_reject_tool', async () => {
            invokeMock
                .mockResolvedValueOnce('session-123')
                .mockResolvedValueOnce(undefined) // reject
                .mockResolvedValueOnce([]); // fetchProposals

            const { result } = renderHook(() => useAISession());

            await act(async () => {
                await result.current.createSession({ mode: 'supadev', provider: 'internal' });
            });

            await act(async () => {
                await result.current.rejectProposal('prop-1');
            });

            await waitFor(() => {
                expect(invokeMock).toHaveBeenCalledWith('ai_reject_tool', {
                    sessionId: 'session-123',
                    proposalId: 'prop-1'
                });
            });
        });
    });

    describe('retryLastPrompt', () => {
        it('should resend the last prompt', async () => {
            invokeMock
                .mockResolvedValueOnce('session-123')
                .mockResolvedValueOnce('First response')
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce('Retry response')
                .mockResolvedValueOnce([]);

            const { result } = renderHook(() => useAISession());

            await act(async () => {
                await result.current.createSession({ mode: 'supadev', provider: 'internal' });
                await result.current.sendPrompt('Test prompt');
            });

            await act(async () => {
                result.current.retryLastPrompt();
            });

            await waitFor(() => {
                expect(invokeMock).toHaveBeenCalledTimes(5);
            });
        });
    });
});
