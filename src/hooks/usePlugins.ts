import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PluginInfo, Plugin } from '../types/plugins';
import { createNexusAPI } from '../lib/pluginSystem';
import { useToast } from './useToast';

export function usePlugins() {
    const [plugins, setPlugins] = useState<Plugin[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const toast = useToast();

    const loadPlugins = useCallback(async () => {
        setIsLoading(true);
        try {
            const infos = await invoke<PluginInfo[]>('get_plugins');

            const loadedPlugins: Plugin[] = [];

            for (const info of infos) {
                try {
                    const script = await invoke<string>('load_plugin_script', {
                        pluginDir: info.dir_name,
                        scriptFile: info.manifest.main
                    });

                    // Execute plugin script
                    // We create a function that takes 'nexus' as an argument
                    // and execute it with our API instance.
                    const nexusAPI = createNexusAPI(toast);

                    // eslint-disable-next-line @typescript-eslint/no-implied-eval
                    const pluginFn = new Function('nexus', script);
                    pluginFn(nexusAPI);

                    loadedPlugins.push({
                        info,
                        isActive: true
                    });
                } catch (e) {
                    console.error(`Failed to load plugin ${info.manifest.name}:`, e);
                    loadedPlugins.push({
                        info,
                        isActive: false,
                        error: String(e)
                    });
                }
            }

            setPlugins(loadedPlugins);
        } catch (e) {
            console.error("Failed to fetch plugins:", e);
            toast.error("Failed to load plugins");
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        // Load plugins on mount (or when workspace changes, ideally we'd trigger this from App)
        // For now, we'll expose a refresh function.
        void loadPlugins();
    }, [loadPlugins]);

    return {
        plugins,
        isLoading,
        refreshPlugins: loadPlugins
    };
}
