import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitStatus } from "../types/git";
import { RefreshCw, Check, Plus, Minus, History, List } from "lucide-react";
import { GitBranches } from "./GitBranches";
import { GitHistory } from "./GitHistory";
import { GitStashList } from "./GitStashList";
import { cn } from "../lib/utils";
import { Logger } from "../lib/Logger";

interface SourceControlPanelProps {
    path: string;
    gitStatus: GitStatus | null;
    onRefresh: () => void | Promise<void>;
}

export function SourceControlPanel({ path, gitStatus, onRefresh, onBusyChange }: SourceControlPanelProps & { onBusyChange?: (busy: boolean) => void }) {
    const [commitMessage, setCommitMessage] = useState("");
    const [isCommitting, setIsCommitting] = useState(false);
    const [activeTab, setActiveTab] = useState<"changes" | "history">("changes");

    const stagedFiles = gitStatus?.files.filter(f => f.staged) || [];
    const unstagedFiles = gitStatus?.files.filter(f => !f.staged) || [];

    async function handleStage(file: string) {
        onBusyChange?.(true);
        try {
            await invoke("git_add", { path, file });
            Logger.info("Git staged file", { path, file });
            await onRefresh();
        } catch (e) {
            console.error("Failed to stage file:", e);
        } finally {
            onBusyChange?.(false);
        }
    }

    async function handleUnstage(file: string) {
        onBusyChange?.(true);
        try {
            await invoke("git_reset", { path, file });
            Logger.info("Git unstaged file", { path, file });
            await onRefresh();
        } catch (e) {
            console.error("Failed to unstage file:", e);
        } finally {
            onBusyChange?.(false);
        }
    }

    async function handleCommit() {
        if (!commitMessage) return;
        setIsCommitting(true);
        onBusyChange?.(true);
        try {
            await invoke("git_commit", { path, message: commitMessage });
            Logger.info("Git commit", { path, message: commitMessage });
            setCommitMessage("");
            await onRefresh();
        } catch (e) {
            console.error("Failed to commit:", e);
            alert(`Commit failed: ${String(e)}`);
        }
        setIsCommitting(false);
        onBusyChange?.(false);
    }

    return (
        <div className="flex flex-col h-full">
            <div className="h-10 border-b border-border flex items-center justify-between px-2 shrink-0">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setActiveTab("changes")}
                        className={cn(
                            "p-1.5 rounded transition-colors",
                            activeTab === "changes" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                        title="Changes"
                    >
                        <List size={16} />
                    </button>
                    <button
                        onClick={() => setActiveTab("history")}
                        className={cn(
                            "p-1.5 rounded transition-colors",
                            activeTab === "history" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                        title="History"
                    >
                        <History size={16} />
                    </button>
                </div>
                <button
                    onClick={() => {
                        void onRefresh();
                    }}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                    title="Refresh Status"
                >
                    <RefreshCw size={14} />
                </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
                {activeTab === "changes" ? (
                    <>
                        <div className="flex-1 overflow-y-auto p-2">
                            <GitBranches
                                path={path}
                                onBranchChange={() => {
                                    void onRefresh();
                                }}
                                onBusyChange={onBusyChange}
                            />

                            {/* Staged Changes */}
                            <div className="mb-4">
                                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider flex items-center justify-between">
                                    <span>Staged Changes</span>
                                    <span className="bg-accent text-accent-foreground px-1.5 rounded-full text-[10px]">{stagedFiles.length}</span>
                                </div>
                                {stagedFiles.length === 0 ? (
                                    <div className="text-xs text-muted-foreground italic pl-2">No staged changes</div>
                                ) : (
                                    <div className="space-y-1">
                                        {stagedFiles.map(file => (
                                            <div key={file.path} className="flex items-center justify-between group text-sm hover:bg-accent/50 rounded px-2 py-1">
                                                <span className="truncate" title={file.path}>{file.path}</span>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => {
                                                            void handleUnstage(file.path);
                                                        }}
                                                        title="Unstage"
                                                    >
                                                        <Minus size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Unstaged Changes */}
                            <div className="mb-4">
                                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider flex items-center justify-between">
                                    <span>Changes</span>
                                    <span className="bg-accent text-accent-foreground px-1.5 rounded-full text-[10px]">{unstagedFiles.length}</span>
                                </div>
                                {unstagedFiles.length === 0 ? (
                                    <div className="text-xs text-muted-foreground italic pl-2">No changes</div>
                                ) : (
                                    <div className="space-y-1">
                                        {unstagedFiles.map(file => (
                                            <div key={file.path} className="flex items-center justify-between group text-sm hover:bg-accent/50 rounded px-2 py-1">
                                                <div className="flex items-center gap-2 truncate">
                                                    <span className={`text-[10px] font-mono w-4 text-center ${file.status === "M" ? "text-blue-400" :
                                                        file.status === "A" || file.status === "??" || file.status === "U" ? "text-green-400" :
                                                            file.status === "D" ? "text-red-400" : "text-muted-foreground"
                                                        }`}>
                                                        {file.status === "??" ? "U" : file.status}
                                                    </span>
                                                    <span className="truncate" title={file.path}>{file.path}</span>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => {
                                                            void handleStage(file.path);
                                                        }}
                                                        title="Stage"
                                                    >
                                                        <Plus size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <GitStashList
                                path={path}
                                onStashChange={() => {
                                    void onRefresh();
                                }}
                                onBusyChange={onBusyChange}
                            />
                        </div>

                        <div className="p-4 border-t border-border bg-muted/20">
                            <textarea
                                className="w-full bg-background border border-input rounded p-2 text-sm min-h-[80px] mb-2 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                                placeholder="Commit message"
                                value={commitMessage}
                                onChange={(e) => setCommitMessage(e.target.value)}
                            />
                            <button
                                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-1.5 rounded text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => {
                                    void handleCommit();
                                }}
                                disabled={isCommitting || stagedFiles.length === 0 || !commitMessage.trim()}
                            >
                                <Check size={14} />
                                Commit
                            </button>
                        </div>
                    </>
                ) : (
                    <GitHistory path={path} />
                )}
            </div>
        </div>
    );
}
