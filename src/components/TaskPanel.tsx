import { useState, useEffect } from 'react';
import { CheckSquare, Square, RefreshCw } from 'lucide-react';

interface TaskItem {
    id: number;
    text: string;
    completed: boolean;
    line: number;
}

interface TaskPanelProps {
    onClose?: () => void;
}

export function TaskPanel({ }: TaskPanelProps) {
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadTasks = async () => {
        setLoading(true);
        setError(null);
        try {
            // Find task.md
            // We assume it's in the standard location or we search for it
            // For now, let's try to find it via a backend command or just assume a path if we knew it
            // Since we don't have a direct "find task.md" command exposed to frontend easily without path,
            // we might need to rely on the agent having created it in a known spot or the user opening it.
            // BUT, the agent creates it in .gemini/.../task.md which is hard to guess.
            // Let's try to read from the open file if it's task.md, or search.

            // For this implementation, we'll assume the backend can help or we just list from the workspace root
            // if we implement a specific command. 
            // Actually, let's use the `read_file` capability if we can find the path.

            // TEMPORARY: We will try to find 'task.md' in the workspace root or .gemini folder.
            // Since we can't easily search from frontend without a command, let's assume the user
            // or agent sets the active task file. 
            // For now, let's just mock it or try to read a fixed path if possible? 
            // No, that's brittle.

            // Better approach: The agent (Compass) uses task.md. 
            // Let's add a backend command to "get_active_task_file" later.
            // For now, I'll implement a simple UI that *would* work if we had the content.
            // I'll add a placeholder.

            setTasks([
                { id: 0, text: "Analyze \"Compass\" agent loop issue", completed: false, line: 3 },
                { id: 1, text: "Improve Agent/User Message UX/UI", completed: false, line: 4 },
                { id: 2, text: "Add Automated Preview Panel", completed: false, line: 5 },
                { id: 3, text: "Add Task List Manager for Agent", completed: false, line: 6 },
                { id: 4, text: "Verify \"Dual Loop\" System", completed: false, line: 7 },
            ]);

        } catch (err) {
            setError("Failed to load tasks");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTasks();
    }, []);

    const toggleTask = (id: number) => {
        setTasks(prev => prev.map(t =>
            t.id === id ? { ...t, completed: !t.completed } : t
        ));
        // TODO: Save back to file
    };

    return (
        <div className="flex flex-col h-full bg-card border-l border-border">
            <div className="h-12 border-b border-border flex items-center px-4 justify-between shrink-0">
                <span className="font-medium">Tasks</span>
                <button onClick={loadTasks} className="p-1 hover:bg-accent rounded">
                    <RefreshCw size={14} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                {loading && <div className="text-sm text-muted-foreground">Loading...</div>}
                {error && <div className="text-sm text-red-500">{error}</div>}

                <div className="space-y-2">
                    {tasks.map(task => (
                        <div key={task.id} className="flex items-start gap-2 group">
                            <button
                                onClick={() => toggleTask(task.id)}
                                className={`mt-0.5 ${task.completed ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {task.completed ? <CheckSquare size={16} /> : <Square size={16} />}
                            </button>
                            <span className={`text-sm ${task.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                {task.text}
                            </span>
                        </div>
                    ))}
                </div>

                <div className="mt-8 p-4 bg-muted/30 rounded-lg border border-border border-dashed text-center">
                    <p className="text-xs text-muted-foreground">
                        Task management is currently in preview.
                        Full integration with <code>task.md</code> coming soon.
                    </p>
                </div>
            </div>
        </div>
    );
}
