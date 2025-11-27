import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAISession } from '../hooks/useAISession';
import { invoke } from '@tauri-apps/api/core';
import { Editor } from '../components/Editor';

// Mocks
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(() => Promise.resolve(() => { })),
}));

// Simplified Editor mock that just exposes an AI trigger button
vi.mock('../components/Editor', () => ({
    Editor: (props: any) => (
        <button onClick={() => props.onTriggerAI?.('Explain this code')}>Trigger AI</button>
    ),
}));

const invokeMock = vi.mocked(invoke);

function TestAiEditorApp() {
    const { sendPrompt } = useAISession();

    return (
        <div>
            <span>Editor-AI Integration Test</span>
            <Editor
                // Other props are irrelevant for this integration test
                value={"fn main() {}"}
                language="rust"
                onChange={() => { }}
                onTriggerAI={(prompt: string) => {
                    void sendPrompt(prompt);
                }}
            />
        </div>
    );
}

describe('AI + Editor workflow integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // First call: ai_create_session, second: ai_send_prompt
        invokeMock
            .mockResolvedValueOnce('session-123' as any)
            .mockResolvedValueOnce('AI response' as any);
    });

    it('triggers AI session and sends prompt when Editor onTriggerAI is invoked', async () => {
        render(<TestAiEditorApp />);

        const button = screen.getByText('Trigger AI');
        fireEvent.click(button);

        await waitFor(() => {
            // ai_create_session
            // Expect session creation first (auto-create)
            expect(invokeMock).toHaveBeenCalledWith('ai_create_session', expect.any(Object));

            // Then expect prompt
            expect(invokeMock).toHaveBeenCalledWith('ai_send_prompt', {
                sessionId: 'session-123',
                prompt: expect.stringContaining('Explain this code'),
            });
        });
    });
});
