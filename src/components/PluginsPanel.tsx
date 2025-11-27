import { useState, useEffect } from 'react';
import { Plugin } from '../types/plugins';
import { commandRegistry } from '../lib/pluginSystem';
import { Command } from '../types/plugins';
import { RefreshCw, Play, AlertCircle, CheckCircle } from 'lucide-react';

interface PluginsPanelProps {
    plugins: Plugin[];
    onRefresh: () => void;
    isLoading: boolean;
}

export function PluginsPanel({ plugins, onRefresh, isLoading }: PluginsPanelProps) {
    const [commands, setCommands] = useState<Command[]>([]);

    useEffect(() => {
        // Subscribe to command registry updates
        const updateCommands = () => setCommands(commandRegistry.getCommands());
        updateCommands();
        const unsubscribe = commandRegistry.subscribe(updateCommands);
        return () => { unsubscribe(); };
    }, []);

    return (
        <div className="flex flex-col h-full bg-card text-card-foreground">
            <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="font-semibold">Plugins</h2>
                <button
                    onClick={onRefresh}
                    className={`p-1.5 hover:bg-accent rounded transition-colors ${isLoading ? 'animate-spin' : ''}`}
                    title="Reload Plugins"
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300 text-xs">
                    Plugins are fully trusted and can run arbitrary code inside Nexus IDE and access your workspace.
                    Only install plugins from sources you trust.
                </div>

                {/* Installed Plugins List */}
                <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Installed</h3>
                    {plugins.length === 0 ? (
                        <div className="text-sm text-muted-foreground italic">No plugins found in .nexus/plugins</div>
                    ) : (
                        <div className="space-y-2">
                            {plugins.map(plugin => (
                                <div key={plugin.info.manifest.id} className="p-3 bg-muted/30 rounded border border-border">
                                    <div className="flex items-start justify-between mb-1">
                                        <div className="font-medium">{plugin.info.manifest.name}</div>
                                        <div className="text-xs bg-accent px-1.5 py-0.5 rounded text-muted-foreground">v{plugin.info.manifest.version}</div>
                                    </div>
                                    <div className="text-xs text-muted-foreground mb-2">{plugin.info.manifest.description}</div>
                                    <div className="flex items-center gap-2 text-xs">
                                        {plugin.isActive ? (
                                            <div className="flex items-center gap-1 text-green-500">
                                                <CheckCircle size={12} />
                                                <span>Active</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1 text-red-500">
                                                <AlertCircle size={12} />
                                                <span>Error: {plugin.error}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Registered Commands List */}
                <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Commands</h3>
                    {commands.length === 0 ? (
                        <div className="text-sm text-muted-foreground italic">No commands registered</div>
                    ) : (
                        <div className="space-y-2">
                            {commands.map(cmd => (
                                <div key={cmd.id} className="flex items-center justify-between p-2 hover:bg-accent/50 rounded group">
                                    <span className="text-sm">{cmd.title}</span>
                                    <button
                                        onClick={() => commandRegistry.execute(cmd.id)}
                                        className="p-1.5 bg-primary text-primary-foreground rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Run Command"
                                    >
                                        <Play size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
