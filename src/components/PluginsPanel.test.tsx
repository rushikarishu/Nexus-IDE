import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginsPanel } from './PluginsPanel';
import { commandRegistry } from '../lib/pluginSystem';
import type { Plugin } from '../types/plugins';

describe('PluginsPanel', () => {
    const anyRegistry = commandRegistry as any;
    const onRefresh = vi.fn();

    beforeEach(() => {
        anyRegistry.commands.clear();
        anyRegistry.listeners.clear();
        onRefresh.mockReset();
    });

    it('renders empty state when no plugins', () => {
        render(<PluginsPanel plugins={[]} onRefresh={onRefresh} isLoading={false} />);

        expect(screen.getByText('No plugins found in .nexus/plugins')).toBeDefined();
        expect(screen.getByText('No commands registered')).toBeDefined();
    });

    it('renders plugin information and status', () => {
        const plugins: Plugin[] = [
            {
                info: {
                    dir_name: 'plugin-ok',
                    manifest: {
                        id: 'ok',
                        name: 'OK Plugin',
                        version: '1.0.0',
                        description: 'Works fine',
                        main: 'main.js',
                    },
                },
                isActive: true,
            },
            {
                info: {
                    dir_name: 'plugin-bad',
                    manifest: {
                        id: 'bad',
                        name: 'Bad Plugin',
                        version: '0.1.0',
                        description: 'Broken',
                        main: 'index.js',
                    },
                },
                isActive: false,
                error: 'Load failed',
            },
        ];

        render(<PluginsPanel plugins={plugins} onRefresh={onRefresh} isLoading={false} />);

        expect(screen.getByText('OK Plugin')).toBeDefined();
        expect(screen.getByText('v1.0.0')).toBeDefined();
        expect(screen.getByText('Works fine')).toBeDefined();
        expect(screen.getByText('Active')).toBeDefined();

        expect(screen.getByText('Bad Plugin')).toBeDefined();
        expect(screen.getByText('v0.1.0')).toBeDefined();
        expect(screen.getByText('Error: Load failed')).toBeDefined();
    });

    it('renders registered commands and executes them on click', async () => {
        const action = vi.fn();
        commandRegistry.register('cmd1', 'Command One', action);

        render(<PluginsPanel plugins={[]} onRefresh={onRefresh} isLoading={false} />);

        const command = await screen.findByText('Command One');
        expect(command).toBeDefined();

        const runButton = screen.getByTitle('Run Command');
        fireEvent.click(runButton);

        await waitFor(() => {
            expect(action).toHaveBeenCalledTimes(1);
        });
    });

    it('calls onRefresh when reload button is clicked', () => {
        render(<PluginsPanel plugins={[]} onRefresh={onRefresh} isLoading={false} />);

        const refreshButton = screen.getByTitle('Reload Plugins');
        fireEvent.click(refreshButton);

        expect(onRefresh).toHaveBeenCalledTimes(1);
    });
});
