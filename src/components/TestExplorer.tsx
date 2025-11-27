import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, RefreshCw, AlertCircle } from "lucide-react";
import { useToast } from "../hooks/useToast";

interface TestFile {
    path: string;
    name: string;
    suite: string;
}

interface TestExplorerProps {
    workspaceRoot: string;
    terminalId: string | null;
    openTerminal: () => void;
}

export function TestExplorer({ workspaceRoot, terminalId, openTerminal }: TestExplorerProps) {
    const [tests, setTests] = useState<TestFile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const toast = useToast();

    const loadTests = useCallback(async () => {
        if (!workspaceRoot) return;
        setIsLoading(true);
        setError(null);
        try {
            const discovered = await invoke<TestFile[]>("discover_tests");
            setTests(discovered);
        } catch (e) {
            console.error("Failed to discover tests:", e);
            setError(String(e));
        } finally {
            setIsLoading(false);
        }
    }, [workspaceRoot]);

    useEffect(() => {
        loadTests();
    }, [loadTests]);

    const handleRunTest = async (test: TestFile) => {
        if (!terminalId) {
            openTerminal();
            toast.error("Opening terminal... Please try again in a moment.");
            return;
        }
        openTerminal();

        // Construct command based on suite/file type
        // For now, hardcoded for frontend vitest
        let command = "npm";
        let args = ["test", test.path];

        try {
            await invoke("run_task", {
                task: {
                    label: `Test ${test.name}`,
                    command,
                    args,
                    cwd: null,
                    env: null
                },
                terminalId
            });
            toast.success(`Running test: ${test.name}`);
        } catch (e) {
            console.error("Failed to run test:", e);
            toast.error(`Failed to run test: ${e}`);
        }
    };

    const handleRunAll = async () => {
        if (!terminalId) {
            openTerminal();
            toast.error("Opening terminal... Please try again in a moment.");
            return;
        }
        openTerminal();

        try {
            await invoke("run_task", {
                task: {
                    label: "Run All Tests",
                    command: "npm",
                    args: ["test"],
                    cwd: null,
                    env: null
                },
                terminalId
            });
            toast.success("Running all tests");
        } catch (e) {
            console.error("Failed to run all tests:", e);
            toast.error(`Failed to run all tests: ${e}`);
        }
    };

    return (
        <div className="flex flex-col h-full bg-card text-card-foreground">
            <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="font-semibold">Tests</h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRunAll}
                        className="p-1.5 hover:bg-accent rounded transition-colors"
                        title="Run All Tests"
                    >
                        <Play size={16} />
                    </button>
                    <button
                        onClick={loadTests}
                        className={`p-1.5 hover:bg-accent rounded transition-colors ${isLoading ? 'animate-spin' : ''}`}
                        title="Refresh Tests"
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-sm flex items-center gap-2">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                {tests.length === 0 && !isLoading && !error ? (
                    <div className="text-center text-muted-foreground mt-8">
                        <p>No tests found.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {tests.map((test, index) => (
                            <div
                                key={`${test.path}-${index}`}
                                className="flex items-center justify-between p-3 bg-muted/30 rounded border border-border hover:bg-muted/50 transition-colors group"
                            >
                                <div className="flex flex-col overflow-hidden">
                                    <span className="font-medium truncate" title={test.name}>{test.name}</span>
                                    <span className="text-xs text-muted-foreground font-mono mt-0.5 truncate" title={test.path}>
                                        {test.path}
                                    </span>
                                </div>
                                <button
                                    onClick={() => handleRunTest(test)}
                                    className="p-2 bg-primary text-primary-foreground rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2"
                                    title="Run Test"
                                >
                                    <Play size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
