import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceControlPanel } from './SourceControlPanel';
import { invoke } from '@tauri-apps/api/core';
import { GitStatus } from '../types/git';

// Mocks
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

vi.mock("../hooks/useToast", () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
    }),
}));

vi.mock("./GitBranches", () => ({
    GitBranches: () => <div data-testid="git-branches">GitBranches</div>
}));

vi.mock("./GitHistory", () => ({
    GitHistory: () => <div data-testid="git-history">GitHistory</div>
}));

vi.mock("./GitStashList", () => ({
    GitStashList: () => <div data-testid="git-stash-list">GitStashList</div>
}));

const invokeMock = vi.mocked(invoke);

describe('SourceControlPanel', () => {
    const mockOnRefresh = vi.fn();
    const mockGitStatus: GitStatus = {
        branch: 'main',
        files: [
            { path: 'file1.txt', status: 'M', staged: false },
            { path: 'file2.txt', status: 'A', staged: true },
            { path: 'file3.txt', status: '??', staged: false },
        ]
    };

    const mockProps = {
        path: '/test/workspace',
        gitStatus: mockGitStatus,
        onRefresh: mockOnRefresh,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render staged and unstaged sections', () => {
        render(<SourceControlPanel {...mockProps} />);

        expect(screen.getByText('Staged Changes')).toBeDefined();
        expect(screen.getByText('Changes')).toBeDefined();
    });

    it('should display staged file count', () => {
        render(<SourceControlPanel {...mockProps} />);

        const stagedBadge = screen.getAllByText('1')[0]; // Should show 1 staged file
        expect(stagedBadge).toBeDefined();
    });

    it('should display unstaged file count', () => {
        render(<SourceControlPanel {...mockProps} />);

        const unstagedBadge = screen.getAllByText('2')[0]; // Should show 2 unstaged files
        expect(unstagedBadge).toBeDefined();
    });

    it('should call git_add when staging file', async () => {
        invokeMock.mockResolvedValue(undefined);

        render(<SourceControlPanel {...mockProps} />);

        // Find unstaged file and hover to show stage button
        const file1 = screen.getByText('file1.txt');
        fireEvent.mouseEnter(file1.closest('div')!);

        // Find and click the stage button (Plus icon)
        const stageButtons = screen.getAllByTitle('Stage');
        fireEvent.click(stageButtons[0]);

        await waitFor(() => {
            expect(invokeMock).toHaveBeenCalledWith('git_add', {
                path: '/test/workspace',
                file: 'file1.txt'
            });
            expect(mockOnRefresh).toHaveBeenCalled();
        });
    });

    it('should call git_reset when unstaging file', async () => {
        invokeMock.mockResolvedValue(undefined);

        render(<SourceControlPanel {...mockProps} />);

        // Find staged file
        const file2 = screen.getByText('file2.txt');
        fireEvent.mouseEnter(file2.closest('div')!);

        // Find and click the unstage button (Minus icon)
        const unstageButton = screen.getByTitle('Unstage');
        fireEvent.click(unstageButton);

        await waitFor(() => {
            expect(invokeMock).toHaveBeenCalledWith('git_reset', {
                path: '/test/workspace',
                file: 'file2.txt'
            });
            expect(mockOnRefresh).toHaveBeenCalled();
        });
    });

    it('should disable commit button when no staged files', () => {
        const emptyGitStatus: GitStatus = {
            branch: 'main',
            files: [{ path: 'file1.txt', status: 'M', staged: false }]
        };

        render(<SourceControlPanel {...mockProps} gitStatus={emptyGitStatus} />);

        const commitButton = screen.getByText('Commit');
        expect(commitButton).toHaveProperty('disabled', true);
    });

    it('should disable commit button when no message', () => {
        render(<SourceControlPanel {...mockProps} />);

        const commitButton = screen.getByText('Commit');
        expect(commitButton).toHaveProperty('disabled', true);
    });

    it('should enable commit button when staged files and message provided', () => {
        render(<SourceControlPanel {...mockProps} />);

        const textarea = screen.getByPlaceholderText('Commit message');
        fireEvent.change(textarea, { target: { value: 'Test commit' } });

        const commitButton = screen.getByText('Commit');
        expect(commitButton).toHaveProperty('disabled', false);
    });

    it('should call git_commit when commit button clicked', async () => {
        invokeMock.mockResolvedValue(undefined);

        render(<SourceControlPanel {...mockProps} />);

        const textarea = screen.getByPlaceholderText('Commit message');
        fireEvent.change(textarea, { target: { value: 'Test commit' } });

        const commitButton = screen.getByText('Commit');
        fireEvent.click(commitButton);

        await waitFor(() => {
            expect(invokeMock).toHaveBeenCalledWith('git_commit', {
                path: '/test/workspace',
                message: 'Test commit'
            });
            expect(mockOnRefresh).toHaveBeenCalled();
        });
    });

    it('should clear commit message after successful commit', async () => {
        invokeMock.mockResolvedValue(undefined);

        render(<SourceControlPanel {...mockProps} />);

        const textarea = screen.getByPlaceholderText('Commit message') as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: 'Test commit' } });

        const commitButton = screen.getByText('Commit');
        fireEvent.click(commitButton);

        await waitFor(() => {
            expect(textarea.value).toBe('');
        });
    });

    it('should show alert on commit failure', async () => {
        global.alert = vi.fn();
        invokeMock.mockRejectedValue('Commit failed');

        render(<SourceControlPanel {...mockProps} />);

        const textarea = screen.getByPlaceholderText('Commit message');
        fireEvent.change(textarea, { target: { value: 'Test commit' } });

        const commitButton = screen.getByText('Commit');
        fireEvent.click(commitButton);

        await waitFor(() => {
            expect(global.alert).toHaveBeenCalledWith('Commit failed: Commit failed');
        });
    });

    it('should call onRefresh when refresh button clicked', () => {
        render(<SourceControlPanel {...mockProps} />);

        const refreshButton = screen.getByTitle('Refresh Status');
        fireEvent.click(refreshButton);

        expect(mockOnRefresh).toHaveBeenCalled();
    });

    it('should display file status indicators', () => {
        render(<SourceControlPanel {...mockProps} />);

        expect(screen.getByText('M')).toBeDefined(); // Modified
        expect(screen.getByText('U')).toBeDefined(); // Untracked (?? converted to U)
    });
});
