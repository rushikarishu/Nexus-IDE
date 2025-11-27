import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Activity, User, Bot, Wrench, AlertCircle } from 'lucide-react';
import { AuditEntry } from '../types/audit';

interface AgentActivityPanelProps {
    sessionId?: string;
}

export function AgentActivityPanel({ sessionId }: AgentActivityPanelProps) {
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        async function loadLogs() {
            setIsLoading(true);
            try {
                const logs = await invoke<AuditEntry[]>('ai_get_audit_logs', {
                    session_id: sessionId ?? null,
                });
                setEntries(logs);
            } catch (err) {
                console.error('Failed to load audit logs:', err);
            } finally {
                setIsLoading(false);
            }
        }

        void loadLogs();
    }, [sessionId]);

    const getIcon = (actor: string, action: string) => {
        if (actor === 'user') return <User size={14} />;
        if (actor === 'assistant') return <Bot size={14} />;
        if (action === 'tool_call' || action === 'tool_result') return <Wrench size={14} />;
        if (action === 'error') return <AlertCircle size={14} />;
        return <Activity size={14} />;
    };

    const getColor = (actor: string) => {
        if (actor === 'user') return 'text-blue-500';
        if (actor === 'assistant') return 'text-purple-500';
        if (actor === 'tool') return 'text-amber-500';
        return 'text-muted-foreground';
    };

    return (
        <div className="flex flex-col h-full bg-background border-l border-border">
            <div className="p-3 border-b border-border flex items-center gap-2">
                <Activity size={16} />
                <h3 className="text-sm font-medium">Agent Activity</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {isLoading ? (
                    <div className="text-xs text-muted-foreground text-center py-4">
                        Loading...
                    </div>
                ) : entries.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-4">
                        No activity yet
                    </div>
                ) : (
                    entries.map((entry) => (
                        <div
                            key={entry.id}
                            className="text-xs p-2 rounded border border-border/50 hover:bg-muted/30 transition-colors"
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span className={getColor(entry.actor)}>
                                    {getIcon(entry.actor, entry.action)}
                                </span>
                                <span className="font-medium capitalize">{entry.actor}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="text-muted-foreground">{entry.action}</span>
                                <span className="ml-auto text-muted-foreground text-xs">
                                    {new Date(entry.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                            {entry.details && typeof entry.details === 'object' && (
                                <div className="text-muted-foreground text-xs pl-6 truncate">
                                    {JSON.stringify(entry.details)}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
