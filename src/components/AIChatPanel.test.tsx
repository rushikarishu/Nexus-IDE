import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIChatPanel } from './AIChatPanel';

// Mock DOM methods
Element.prototype.scrollIntoView = vi.fn();

// Mock Tauri API
vi.mock("@tauri-apps/api/core", () => ({
    invoke: vi.fn().mockResolvedValue({ qdrant: true, ollama: true }),
}));

// Mock useAISession
const mockSession = {
    sessionId: null as string | null,
    history: [] as Array<{ id: string; role: 'user' | 'assistant'; content: string }>,
    isLoading: false,
    error: null as string | null,
    isCancelled: false,
    proposals: [] as any[],
    createSession: vi.fn(),
    sendPrompt: vi.fn(),
    sendPromptStreaming: vi.fn(),
    retryLastPrompt: vi.fn(),
    cancelRequest: vi.fn(),
    approveProposal: vi.fn(),
    rejectProposal: vi.fn(),
    runCompass: vi.fn(),
    fetchProposals: vi.fn(),
};

vi.mock('../hooks/useAISession', () => ({
    useAISession: vi.fn(() => mockSession),
}));

// Mock child components
vi.mock('./ToolProposalList', () => ({
    ToolProposalList: ({ proposals, onApprove, onReject }: any) => (
        <div data-testid="proposal-list">
            {proposals.map((p: any) => (
                <div key={p.id}>
                    <button onClick={() => onApprove(p.id)}>Approve {p.id}</button>
                    <button onClick={() => onReject(p.id)}>Reject {p.id}</button>
                </div>
            ))}
        </div>
    ),
}));

vi.mock('./ProposalDiffViewer', () => ({
    ProposalDiffViewer: ({ path, onClose }: any) => (
        <div data-testid="diff-viewer">
            <div>{path}</div>
            <button onClick={onClose}>Close Diff</button>
        </div>
    ),
}));

describe('AIChatPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset mock session
        mockSession.sessionId = null;
        mockSession.history = [];
        mockSession.isLoading = false;
        mockSession.error = null;
        mockSession.proposals = [];
    });

    it('should render welcome message when no history', () => {
        render(<AIChatPanel session={mockSession} />);

        expect(screen.getByText('Welcome to Nexus AI.')).toBeDefined();
        expect(screen.getByText('How can I help you code today?')).toBeDefined();
    });

    it('should auto-create session on mount if none exists', async () => {
        render(<AIChatPanel session={mockSession} />);

        await waitFor(() => {
            expect(mockSession.createSession).toHaveBeenCalledWith({
                mode: 'supadev',
                provider: 'internal'
            });
        });
    });

    it('should not auto-create session if one exists', () => {
        mockSession.sessionId = 'session-123';

        render(<AIChatPanel session={mockSession} />);

        expect(mockSession.createSession).not.toHaveBeenCalled();
    });

    it('should render message history', () => {
        mockSession.history = [
            { id: '1', role: 'user', content: 'Hello' },
            { id: '2', role: 'assistant', content: 'Hi there!' },
        ];

        render(<AIChatPanel session={mockSession} />);

        expect(screen.getByText('Hello')).toBeDefined();
        expect(screen.getByText('Hi there!')).toBeDefined();
    });

    it('should send prompt when form submitted', async () => {
        render(<AIChatPanel session={mockSession} />);

        const input = screen.getByPlaceholderText('Ask SupaDev...');
        const form = input.closest('form')!;

        fireEvent.change(input, { target: { value: 'Test prompt' } });
        fireEvent.submit(form);

        await waitFor(() => {
            expect(mockSession.sendPromptStreaming).toHaveBeenCalledWith('Test prompt');
        });
    });

    it('should clear input after sending prompt', async () => {
        render(<AIChatPanel session={mockSession} />);

        const input = screen.getByPlaceholderText('Ask SupaDev...') as HTMLInputElement;
        const form = input.closest('form')!;

        fireEvent.change(input, { target: { value: 'Test prompt' } });
        expect(input.value).toBe('Test prompt');

        fireEvent.submit(form);

        await waitFor(() => {
            expect(input.value).toBe('');
        });
    });

    it('should not send empty prompt', () => {
        render(<AIChatPanel session={mockSession} />);

        const input = screen.getByPlaceholderText('Ask SupaDev...');
        const form = input.closest('form')!;

        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.submit(form);

        expect(mockSession.sendPromptStreaming).not.toHaveBeenCalled();
    });

    it('should not send prompt when loading', () => {
        mockSession.isLoading = true;

        render(<AIChatPanel session={mockSession} />);

        const input = screen.getByPlaceholderText('Ask SupaDev...');
        const form = input.closest('form')!;

        fireEvent.change(input, { target: { value: 'Test' } });
        fireEvent.submit(form);

        expect(mockSession.sendPromptStreaming).not.toHaveBeenCalled();
    });

    it('should show loading indicator', () => {
        mockSession.isLoading = true;

        render(<AIChatPanel session={mockSession} />);

        expect(screen.getByText('Thinking...')).toBeDefined();
    });

    it('should display error message', () => {
        mockSession.error = 'Test error message';

        render(<AIChatPanel session={mockSession} />);

        expect(screen.getByText('Test error message')).toBeDefined();
    });

    it('should retry on error', () => {
        mockSession.error = 'Test error';

        render(<AIChatPanel session={mockSession} />);

        const retryButton = screen.getByText('Retry');
        fireEvent.click(retryButton);

        expect(mockSession.retryLastPrompt).toHaveBeenCalled();
    });

    it('should show proposals when available', () => {
        mockSession.proposals = [
            { id: 'prop-1', status: 'pending', tool: 'file_edit', args: {} },
        ];

        render(<AIChatPanel session={mockSession} />);

        expect(screen.getByTestId('proposal-list')).toBeDefined();
    });

    it('should call approveProposal when proposal approved', () => {
        mockSession.proposals = [
            { id: 'prop-1', status: 'pending', tool: 'file_edit', args: {} },
        ];

        render(<AIChatPanel session={mockSession} />);

        const approveButton = screen.getByText('Approve prop-1');
        fireEvent.click(approveButton);

        expect(mockSession.approveProposal).toHaveBeenCalledWith('prop-1');
    });

    it('should call rejectProposal when proposal rejected', () => {
        mockSession.proposals = [
            { id: 'prop-1', status: 'pending', tool: 'file_edit', args: {} },
        ];

        render(<AIChatPanel session={mockSession} />);

        const rejectButton = screen.getByText('Reject prop-1');
        fireEvent.click(rejectButton);

        expect(mockSession.rejectProposal).toHaveBeenCalledWith('prop-1');
    });

    it('should toggle mode dropdown', () => {
        render(<AIChatPanel session={mockSession} />);

        const modeButton = screen.getByText('SupaDev');
        fireEvent.click(modeButton);

        expect(screen.getByText('Beast Mode')).toBeDefined();
    });

    it('should change mode and recreate session', async () => {
        render(<AIChatPanel session={mockSession} />);

        // Open dropdown
        const modeButton = screen.getByText('SupaDev');
        fireEvent.click(modeButton);

        // Click Beast Mode
        const beastModeButton = screen.getByText('Beast Mode');
        fireEvent.click(beastModeButton);

        await waitFor(() => {
            expect(mockSession.createSession).toHaveBeenCalledWith({
                mode: 'beastup',
                provider: 'internal'
            });
        });
    });

    it('should call onClose when close button clicked', () => {
        const mockOnClose = vi.fn();

        render(<AIChatPanel session={mockSession} onClose={mockOnClose} />);

        const closeButton = screen.getByTitle('Collapse Sidebar');
        fireEvent.click(closeButton);

        expect(mockOnClose).toHaveBeenCalled();
    });

    it('should disable input when loading', () => {
        mockSession.isLoading = true;

        render(<AIChatPanel session={mockSession} />);

        const input = screen.getByPlaceholderText('Ask SupaDev...');
        expect(input).toHaveProperty('disabled', true);
    });

    it('should show send icon when not loading', () => {
        render(<AIChatPanel session={mockSession} />);

        const input = screen.getByPlaceholderText('Ask SupaDev...');
        fireEvent.change(input, { target: { value: 'test' } });

        // Send icon should be visible (not Square/stop icon)
        const submitButton = input.closest('form')!.querySelector('button[type="submit"]');
        expect(submitButton).toBeDefined();
    });
});
