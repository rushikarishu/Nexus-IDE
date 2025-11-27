import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlugins } from './usePlugins';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from './useToast';
import type { PluginInfo } from '../types/plugins';

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

vi.mock('./useToast', () => ({
    useToast: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const useToastMock = vi.mocked(useToast);

describe('usePlugins', () => {
    const mockToast = {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        useToastMock.mockReturnValue(mockToast);
    });

    it('loads plugins and marks them as active when scripts execute successfully', async () => {
        const pluginInfo: PluginInfo = {
            dir_name: 'sample-plugin',
            manifest: {
                id: 'sample',
                name: 'Sample Plugin',
                version: '1.0.0',
                description: 'Test plugin',
                main: 'main.js',
            },
        };

        // First call: get_plugins, second call: load_plugin_script
        invokeMock
            .mockResolvedValueOnce([pluginInfo] as any)
            .mockResolvedValueOnce("nexus.toast.success('loaded')");

        const { result } = renderHook(() => usePlugins());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.plugins).toHaveLength(1);
        expect(result.current.plugins[0].info.manifest.name).toBe('Sample Plugin');
        expect(result.current.plugins[0].isActive).toBe(true);
        expect(mockToast.error).not.toHaveBeenCalled();
    });

    it('marks plugin as inactive and records error when script loading fails', async () => {
        const pluginInfo: PluginInfo = {
            dir_name: 'broken-plugin',
            manifest: {
                id: 'broken',
                name: 'Broken Plugin',
                version: '0.1.0',
                description: 'Broken',
                main: 'index.js',
            },
        };

        invokeMock
            .mockResolvedValueOnce([pluginInfo] as any)
            .mockRejectedValueOnce(new Error('Script error'));

        const { result } = renderHook(() => usePlugins());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.plugins).toHaveLength(1);
        expect(result.current.plugins[0].isActive).toBe(false);
        expect(String(result.current.plugins[0].error)).toContain('Error');
    });

    it('shows toast error when fetching plugins fails', async () => {
        invokeMock.mockRejectedValueOnce(new Error('List failed'));

        const { result } = renderHook(() => usePlugins());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.plugins).toHaveLength(0);
        expect(mockToast.error).toHaveBeenCalledWith('Failed to load plugins');
    });
});
