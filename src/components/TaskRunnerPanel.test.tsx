import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskRunnerPanel } from './TaskRunnerPanel';
import { invoke } from '@tauri-apps/api/core';

// Mock toast
const mockToast = {
    success: vi.fn(),
    error: vi.fn(),
};

vi.mock('../hooks/useToast', () => ({
    useToast: () => mockToast,
}));

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe('TaskRunnerPanel', () => {
    const mockProps = {
        workspaceRoot: '/test/workspace',
        onEditTasks: vi.fn(),
        terminalId: 'terminal-123',
        openTerminal: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should load tasks on mount', async () => {
        const mockTasks = [
            { label: 'Build', command: 'npm', args: ['run', 'build'] },
            { label: 'Test', command: 'npm', args: ['test'] },
        ];
        invokeMock.mockResolvedValue(mockTasks);

        render(<TaskRunnerPanel {...mockProps} />);

        await waitFor(() => {
            expect(invokeMock).toHaveBeenCalledWith('get_tasks');
            expect(screen.getByText('Build')).toBeDefined();
            expect(screen.getByText('Test')).toBeDefined();
        });
    });

    it('should display error when loading tasks fails', async () => {
        invokeMock.mockRejectedValue('Failed to load tasks');

        render(<TaskRunnerPanel {...mockProps} />);

        await waitFor(() => {
            expect(screen.getByText('Failed to load tasks')).toBeDefined();
        });
    });

    it('should show empty state when no tasks', async () => {
        invokeMock.mockResolvedValue([]);

        render(<TaskRunnerPanel {...mockProps} />);

        await waitFor(() => {
            expect(screen.getByText('No tasks found.')).toBeDefined();
            expect(screen.getByText('Create a .nexus/tasks.json file to define tasks.')).toBeDefined();
        });
    });

    it('should call onEditTasks when edit button clicked', async () => {
        invokeMock.mockResolvedValue([]);

        render(<TaskRunnerPanel {...mockProps} />);

        await waitFor(() => {
            const editButton = screen.getByTitle('Edit Tasks (tasks.json)');
            fireEvent.click(editButton);
        });

        expect(mockProps.onEditTasks).toHaveBeenCalled();
    });

    it('should reload tasks when refresh button clicked', async () => {
        const mockTasks = [{ label: 'Build', command: 'npm', args: ['run', 'build'] }];
        invokeMock.mockResolvedValue(mockTasks);

        render(<TaskRunnerPanel {...mockProps} />);

        await waitFor(() => {
            expect(invokeMock).toHaveBeenCalledTimes(1);
        });

        const refreshButton = screen.getByTitle('Refresh Tasks');
        fireEvent.click(refreshButton);

        await waitFor(() => {
            expect(invokeMock).toHaveBeenCalledTimes(2);
        });
    });

    it('should run task when play button clicked', async () => {
        const mockTasks = [{ label: 'Build', command: 'npm', args: ['run', 'build'] }];
        invokeMock.mockResolvedValueOnce(mockTasks).mockResolvedValueOnce(undefined);

        render(<TaskRunnerPanel {...mockProps} />);

        await waitFor(() => {
            expect(screen.getByText('Build')).toBeDefined();
        });

        // Hover over task to show play button
        const taskElement = screen.getByText('Build').closest('div');
        fireEvent.mouseEnter(taskElement!);

        const playButton = screen.getByTitle('Run Task');
        fireEvent.click(playButton);

        await waitFor(() => {
            expect(invokeMock).toHaveBeenCalledWith('run_task', {
                task: mockTasks[0],
                terminalId: 'terminal-123'
            });
            expect(mockToast.success).toHaveBeenCalledWith('Task "Build" started');
        });
    });

    it('should open terminal if not available when running task', async () => {
        const mockTasks = [{ label: 'Build', command: 'npm', args: ['run', 'build'] }];
        invokeMock.mockResolvedValue(mockTasks);

        render(<TaskRunnerPanel {...mockProps} terminalId={null} />);

        await waitFor(() => {
            expect(screen.getByText('Build')).toBeDefined();
        });

        const taskElement = screen.getByText('Build').closest('div');
        fireEvent.mouseEnter(taskElement!);

        const playButton = screen.getByTitle('Run Task');
        fireEvent.click(playButton);

        expect(mockProps.openTerminal).toHaveBeenCalled();
        expect(mockToast.error).toHaveBeenCalledWith('Opening terminal... Please try again in a moment.');
    });

    it('should handle task run failure', async () => {
        const mockTasks = [{ label: 'Build', command: 'npm', args: ['run', 'build'] }];
        invokeMock.mockResolvedValueOnce(mockTasks).mockRejectedValueOnce('Task execution failed');

        render(<TaskRunnerPanel {...mockProps} />);

        await waitFor(() => {
            expect(screen.getByText('Build')).toBeDefined();
        });

        const taskElement = screen.getByText('Build').closest('div');
        fireEvent.mouseEnter(taskElement!);

        const playButton = screen.getByTitle('Run Task');
        fireEvent.click(playButton);

        await waitFor(() => {
            expect(mockToast.error).toHaveBeenCalledWith('Failed to run task: Task execution failed');
        });
    });

    it('should display task command and args', async () => {
        const mockTasks = [
            { label: 'Build', command: 'npm', args: ['run', 'build'] },
        ];
        invokeMock.mockResolvedValue(mockTasks);

        render(<TaskRunnerPanel {...mockProps} />);

        await waitFor(() => {
            expect(screen.getByText('npm run build')).toBeDefined();
        });
    });

    it('should call openTerminal when running task even with terminal available', async () => {
        const mockTasks = [{ label: 'Build', command: 'npm', args: ['run', 'build'] }];
        invokeMock.mockResolvedValueOnce(mockTasks).mockResolvedValueOnce(undefined);

        render(<TaskRunnerPanel {...mockProps} />);

        await waitFor(() => {
            expect(screen.getByText('Build')).toBeDefined();
        });

        const taskElement = screen.getByText('Build').closest('div');
        fireEvent.mouseEnter(taskElement!);

        const playButton = screen.getByTitle('Run Task');
        fireEvent.click(playButton);

        await waitFor(() => {
            expect(mockProps.openTerminal).toHaveBeenCalled();
        });
    });
});
