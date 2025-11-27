import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, RefreshCw, Settings, AlertCircle, Square, ArrowDown, ArrowUp, ArrowRight } from "lucide-react";
import { useToast } from "../hooks/useToast";
import * as dap from "../lib/dap";
import { VariableViewer, WatchPanel, StackFrameItem } from "./DebugComponents";

interface LaunchConfig {
    name: string;
    type: string;
    request: string;
    program?: string;
}

interface DebugPanelProps {
    workspaceRoot: string;
    terminalId: string | null;
    openTerminal: () => void;
    onEditLaunchConfig: () => void;
}

export function DebugPanel({ workspaceRoot, onEditLaunchConfig, openTerminal }: DebugPanelProps) {
    const [configs, setConfigs] = useState<LaunchConfig[]>([]);
    const [selectedConfigIndex, setSelectedConfigIndex] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDebugging, setIsDebugging] = useState(false);
    const [debugOutput, setDebugOutput] = useState<string[]>([]);

    interface Thread {
        id: number;
        name: string;
    }

    interface StackFrame {
        id: number;
        name: string;
        line: number;
        column: number;
        source?: { path?: string };
    }

    interface Variable {
        name: string;
        value: string;
        type?: string;
        variablesReference: number;
    }

    const [threads, setThreads] = useState<Thread[]>([]);
    const [stackFrames, setStackFrames] = useState<StackFrame[]>([]);
    const [variables, setVariables] = useState<Variable[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
    const [activeFrameId, setActiveFrameId] = useState<number | null>(null);
    const [watches, setWatches] = useState<Array<{ id: string; expression: string; value?: string; error?: string }>>([]);

    const toast = useToast();

    const loadConfigs = useCallback(async () => {
        if (!workspaceRoot) return;
        setIsLoading(true);
        setError(null);
        try {
            const fetchedConfigs = await invoke<LaunchConfig[]>("get_launch_configurations");
            setConfigs(fetchedConfigs);
            if (fetchedConfigs.length > 0) {
                setSelectedConfigIndex(0);
            }
        } catch (e) {
            console.error("Failed to load launch configs:", e);
            setError(String(e));
        } finally {
            setIsLoading(false);
        }
    }, [workspaceRoot]);

    useEffect(() => {
        loadConfigs();
    }, [loadConfigs]);

    useEffect(() => {
        const unlistenEvent = dap.onDapEvent(async (event) => {

            if (event.event === "output" && event.body?.output) {
                setDebugOutput(prev => [...prev, event.body.output]);
            }
            if (event.event === "stopped") {
                toast.info("Debugger stopped/paused");
                // Fetch threads when stopped
                try {
                    await dap.getThreads();
                } catch (e) {
                    console.error("Failed to fetch threads:", e);
                }
            }
        });

        const unlistenResponse = dap.onDapResponse(async (response) => {
            if (response.command === "threads" && response.success && response.body?.threads) {
                setThreads(response.body.threads);
                if (response.body.threads.length > 0) {
                    const threadId = response.body.threads[0].id;
                    setActiveThreadId(threadId);
                    await dap.getStackTrace(threadId);
                }
            }
            if (response.command === "stackTrace" && response.success && response.body?.stackFrames) {
                setStackFrames(response.body.stackFrames);
                if (response.body.stackFrames.length > 0) {
                    // Fetch scopes for top frame
                    await dap.getScopes(response.body.stackFrames[0].id);
                }
            }
            if (response.command === "scopes" && response.success && response.body?.scopes) {
                if (response.body.scopes.length > 0) {
                    // Fetch variables for first scope (usually "Local")
                    await dap.getVariables(response.body.scopes[0].variablesReference);
                }
            }
            if (response.command === "variables" && response.success && response.body?.variables) {
                setVariables(response.body.variables);
            }
        });

        const unlistenTerminated = dap.onDapTerminated(() => {
            setIsDebugging(false);
            setThreads([]);
            setStackFrames([]);
            setVariables([]);
            toast.info("Debug session terminated");
        });

        return () => {
            unlistenEvent.then(f => f());
            unlistenResponse.then(f => f());
            unlistenTerminated.then(f => f());
        };
    }, [toast]);

    const handleDebugLaunch = async () => {
        if (configs.length === 0) return;

        const config = configs[selectedConfigIndex];

        try {
            setIsDebugging(true);
            setDebugOutput([]);
            await dap.startDebugSession(config);
            openTerminal();
            toast.success(`Debugging "${config.name}"`);
        } catch (e) {
            console.error("Failed to launch debug:", e);
            toast.error(`Failed to launch: ${e}`);
            setIsDebugging(false);
        }
    };

    const handleStop = async () => {
        try {
            await dap.stopDebugSession();
            setIsDebugging(false);
        } catch (e) {
            toast.error(`Failed to stop: ${e}`);
        }
    };

    return (
        <div className="flex flex-col h-full bg-card text-card-foreground">
            <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="font-semibold">Run & Debug</h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onEditLaunchConfig}
                        className="p-1.5 hover:bg-accent rounded transition-colors"
                        title="Edit launch.json"
                    >
                        <Settings size={16} />
                    </button>
                    <button
                        onClick={loadConfigs}
                        className={`p-1.5 hover:bg-accent rounded transition-colors ${isLoading ? 'animate-spin' : ''}`}
                        title="Refresh Configurations"
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            <div className="p-4 flex flex-col gap-4 flex-1 overflow-hidden">
                {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-sm flex items-center gap-2">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                {isDebugging ? (
                    <div className="flex flex-col gap-4 h-full">
                        <div className="flex items-center justify-center gap-2 p-2 bg-accent/20 rounded">
                            <button onClick={() => dap.continueSession()} className="p-2 hover:bg-accent rounded" title="Continue">
                                <Play size={20} className="text-green-500" />
                            </button>
                            <button onClick={() => dap.nextStep()} className="p-2 hover:bg-accent rounded" title="Step Over">
                                <ArrowRight size={20} />
                            </button>
                            <button onClick={() => dap.stepIn()} className="p-2 hover:bg-accent rounded" title="Step In">
                                <ArrowDown size={20} />
                            </button>
                            <button onClick={() => dap.stepOut()} className="p-2 hover:bg-accent rounded" title="Step Out">
                                <ArrowUp size={20} />
                            </button>
                            <button onClick={handleStop} className="p-2 hover:bg-accent rounded" title="Stop">
                                <Square size={20} className="text-red-500" />
                            </button>
                        </div>

                        {/* Threads Section */}
                        <div className="flex-1 border border-border rounded bg-muted/30 p-2 overflow-auto">
                            <h3 className="text-xs font-semibold mb-2 text-muted-foreground">Threads</h3>
                            {threads.length === 0 ? (
                                <span className="text-xs text-muted-foreground italic">No threads available</span>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    {threads.map((t, i) => (
                                        <div
                                            key={i}
                                            className={`text-xs font-mono p-1 rounded cursor-pointer ${activeThreadId === t.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
                                            onClick={() => {
                                                setActiveThreadId(t.id);
                                                dap.getStackTrace(t.id);
                                            }}
                                        >
                                            {t.name} (ID: {t.id})
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Variables Section */}
                        <div className="flex-1 border border-border rounded bg-muted/30 overflow-hidden flex flex-col">
                            <div className="p-2 border-b border-border bg-muted/20">
                                <h3 className="text-xs font-semibold text-muted-foreground">Variables</h3>
                            </div>
                            <div className="flex-1 overflow-auto">
                                <VariableViewer variables={variables} />
                            </div>
                        </div>

                        {/* Watch Expressions */}
                        <div className="flex-1 border border-border rounded bg-muted/30 overflow-hidden">
                            <WatchPanel
                                watches={watches}
                                onAdd={(expr) => {
                                    const id = `watch-${Date.now()}`;
                                    setWatches(prev => [...prev, { id, expression: expr, value: 'Not yet evaluated' }]);
                                }}
                                onRemove={(id) => setWatches(prev => prev.filter(w => w.id !== id))}
                                onEvaluate={async (expr) => {
                                    // TODO: Implement DAP evaluate command
                                    return `${expr} = <value>`;
                                }}
                            />
                        </div>

                        {/* Call Stack Section */}
                        <div className="flex-1 border border-border rounded bg-muted/30 overflow-hidden flex flex-col">
                            <div className="p-2 border-b border-border bg-muted/20">
                                <h3 className="text-xs font-semibold text-muted-foreground">Call Stack</h3>
                            </div>
                            <div className="flex-1 overflow-auto">
                                {stackFrames.length === 0 ? (
                                    <div className="text-xs text-muted-foreground italic p-2">No stack trace</div>
                                ) : (
                                    <div className="flex flex-col">
                                        {stackFrames.map((frame, i) => (
                                            <StackFrameItem
                                                key={frame.id || i}
                                                frame={frame}
                                                isActive={activeFrameId === frame.id}
                                                onClick={() => {
                                                    setActiveFrameId(frame.id);
                                                    dap.getScopes(frame.id);
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Debug Console */}
                        <div className="h-32 border border-border rounded bg-muted/30 p-2 overflow-auto font-mono text-xs">
                            <h3 className="text-xs font-semibold mb-2 text-muted-foreground sticky top-0 bg-muted/30">Console</h3>
                            {debugOutput.length === 0 ? (
                                <span className="text-muted-foreground italic">Debug output will appear here...</span>
                            ) : (
                                debugOutput.map((line, i) => (
                                    <div key={i} className="whitespace-pre-wrap">{line}</div>
                                ))
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        {configs.length === 0 && !isLoading && !error ? (
                            <div className="text-center text-muted-foreground mt-4">
                                <p>No configurations found.</p>
                                <p className="text-xs mt-2">Create a .nexus/launch.json file to define debug configurations.</p>
                                <button
                                    onClick={onEditLaunchConfig}
                                    className="mt-4 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 transition-colors"
                                >
                                    Create Configuration
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <div className="flex gap-2">
                                    <select
                                        className="flex-1 bg-muted border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                        value={selectedConfigIndex}
                                        onChange={(e) => setSelectedConfigIndex(Number(e.target.value))}
                                    >
                                        {configs.map((config, index) => (
                                            <option key={index} value={index}>
                                                {config.name} ({config.type})
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={handleDebugLaunch}
                                        className="p-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                                        title="Start Debugging"
                                    >
                                        <Play size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
