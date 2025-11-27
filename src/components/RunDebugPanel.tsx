import { useState } from "react";
import { TaskRunnerPanel } from "./TaskRunnerPanel";
import { TestExplorer } from "./TestExplorer";
import { DebugPanel } from "./DebugPanel";
import { cn } from "../lib/utils";

interface RunDebugPanelProps {
    workspaceRoot: string;
    onEditTasks: () => void;
    onEditLaunchConfig: () => void;
    terminalId: string | null;
    openTerminal: () => void;
}

export function RunDebugPanel({
    workspaceRoot,
    onEditTasks,
    onEditLaunchConfig,
    terminalId,
    openTerminal
}: RunDebugPanelProps) {
    const [activeTab, setActiveTab] = useState<"tasks" | "tests" | "debug">("tasks");

    return (
        <div className="flex flex-col h-full bg-card text-card-foreground">
            <div className="flex items-center border-b border-border">
                <button
                    className={cn(
                        "flex-1 px-4 py-2 text-sm font-medium transition-colors border-b-2",
                        activeTab === "tasks"
                            ? "border-primary text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    )}
                    onClick={() => setActiveTab("tasks")}
                >
                    Tasks
                </button>
                <button
                    className={cn(
                        "flex-1 px-4 py-2 text-sm font-medium transition-colors border-b-2",
                        activeTab === "tests"
                            ? "border-primary text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    )}
                    onClick={() => setActiveTab("tests")}
                >
                    Tests
                </button>
                <button
                    className={cn(
                        "flex-1 px-4 py-2 text-sm font-medium transition-colors border-b-2",
                        activeTab === "debug"
                            ? "border-primary text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    )}
                    onClick={() => setActiveTab("debug")}
                >
                    Debug
                </button>
            </div>

            <div className="flex-1 overflow-hidden">
                {activeTab === "tasks" && (
                    <TaskRunnerPanel
                        workspaceRoot={workspaceRoot}
                        onEditTasks={onEditTasks}
                        terminalId={terminalId}
                        openTerminal={openTerminal}
                    />
                )}
                {activeTab === "tests" && (
                    <TestExplorer
                        workspaceRoot={workspaceRoot}
                        terminalId={terminalId}
                        openTerminal={openTerminal}
                    />
                )}
                {activeTab === "debug" && (
                    <DebugPanel
                        workspaceRoot={workspaceRoot}
                        terminalId={terminalId}
                        openTerminal={openTerminal}
                        onEditLaunchConfig={onEditLaunchConfig}
                    />
                )}
            </div>
        </div>
    );
}
