import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, RefreshCw, Settings, AlertCircle } from "lucide-react";
import { TaskDefinition } from "../types/tasks";
import { useToast } from "../hooks/useToast";

interface TaskRunnerPanelProps {
    workspaceRoot: string;
    onEditTasks: () => void;
    terminalId: string | null; // New prop
    openTerminal: () => void; // New prop
}

export function TaskRunnerPanel({ workspaceRoot, onEditTasks, terminalId, openTerminal }: TaskRunnerPanelProps) {
    const [tasks, setTasks] = useState<TaskDefinition[]>([]);
    const [isLoading, setIsLoading] = useState(false); // Renamed from loading
    const [error, setError] = useState<string | null>(null); // New state
    const toast = useToast();

    const loadTasks = useCallback(async () => { // Renamed from fetchTasks
        if (!workspaceRoot) return;
        setIsLoading(true); // Changed from setLoading
        setError(null); // Reset error
        try {
            const fetchedTasks = await invoke<TaskDefinition[]>("get_tasks");
            setTasks(fetchedTasks);
        } catch (e) {
            console.error("Failed to load tasks:", e); // Updated message
            setError(String(e)); // Set error state
        } finally {
            setIsLoading(false); // Changed from setLoading
        }
    }, [workspaceRoot]); // Dependencies updated

    useEffect(() => {
        loadTasks(); // Call loadTasks
    }, [loadTasks]);

    const handleRunTask = async (task: TaskDefinition) => {
        if (!terminalId) {
            openTerminal(); // Call openTerminal
            toast.error("Opening terminal... Please try again in a moment."); // Updated toast message
            return;
        }

        // Ensure terminal is visible
        openTerminal(); // Call openTerminal

        try {
            await invoke("run_task", {
                task,
                terminalId
            });
            toast.success(`Task "${task.label}" started`); // Updated toast message
        } catch (e) {
            console.error("Failed to run task:", e);
            toast.error(`Failed to run task: ${e}`); // Updated toast message
        }
    };

    return (
        <div className="flex flex-col h-full bg-card text-card-foreground">
            <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="font-semibold">Tasks</h2> {/* Removed TerminalIcon */}
                <div className="flex items-center gap-2"> {/* Changed gap to 2 */}
                    <button
                        onClick={onEditTasks}
                        className="p-1.5 hover:bg-accent rounded transition-colors" // Updated classes
                        title="Edit Tasks (tasks.json)" // Updated title
                    >
                        <Settings size={16} /> {/* Changed to Settings icon, size 16 */}
                    </button>
                    <button
                        onClick={loadTasks} // Changed to loadTasks
                        className={`p-1.5 hover:bg-accent rounded transition-colors ${isLoading ? 'animate-spin' : ''}`} // Updated classes, used isLoading
                        title="Refresh Tasks"
                    >
                        <RefreshCw size={16} /> {/* Size 16 */}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4"> {/* Changed padding */}
                {error && ( // New error display
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-sm flex items-center gap-2">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                {tasks.length === 0 && !isLoading && !error ? ( // Updated condition
                    <div className="text-center text-muted-foreground mt-8"> {/* Updated classes */}
                        <p>No tasks found.</p>
                        <p className="text-xs mt-2">Create a .nexus/tasks.json file to define tasks.</p> {/* Updated message */}
                        <button
                            onClick={onEditTasks}
                            className="mt-4 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 transition-colors" // Updated classes
                        >
                            Create Configuration {/* Updated button text */}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-2"> {/* Changed gap to space-y-2 */}
                        {tasks.map((task, index) => ( // Changed idx to index
                            <div
                                key={`${task.label}-${index}`}
                                className="flex items-center justify-between p-3 bg-muted/30 rounded border border-border hover:bg-muted/50 transition-colors group" // Updated classes
                            >
                                <div className="flex flex-col"> {/* Updated classes */}
                                    <span className="font-medium">{task.label}</span> {/* Updated classes */}
                                    <span className="text-xs text-muted-foreground font-mono mt-0.5"> {/* Updated classes */}
                                        {task.command} {task.args?.join(" ")}
                                    </span>
                                </div>
                                <button
                                    onClick={() => handleRunTask(task)}
                                    className="p-2 bg-primary text-primary-foreground rounded opacity-0 group-hover:opacity-100 transition-opacity" // Updated classes
                                    title="Run Task"
                                >
                                    <Play size={16} /> {/* Size 16 */}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
