import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitCommit } from "../types/git";
import { GitCommit as GitCommitIcon, RefreshCw } from "lucide-react";

interface GitHistoryProps {
    path: string;
}

export function GitHistory({ path }: GitHistoryProps) {
    const [commits, setCommits] = useState<GitCommit[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const loadHistory = async () => {
        setIsLoading(true);
        try {
            const history = await invoke<GitCommit[]>("git_log", { path, limit: 50 });
            setCommits(history);
        } catch (e) {
            console.error("Failed to load git history:", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadHistory();
    }, [path]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-2 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">History</span>
                <button onClick={loadHistory} className="p-1 hover:bg-accent rounded" title="Refresh History">
                    <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {commits.map((commit) => (
                    <div key={commit.hash} className="p-2 border-b border-border/50 hover:bg-accent/30 text-sm">
                        <div className="flex items-start gap-2">
                            <GitCommitIcon size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                                <div className="font-medium truncate" title={commit.message}>{commit.message}</div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                    <span className="truncate">{commit.author}</span>
                                    <span>•</span>
                                    <span className="font-mono">{commit.hash.substring(0, 7)}</span>
                                    <span>•</span>
                                    <span>{commit.date}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {commits.length === 0 && !isLoading && (
                    <div className="p-4 text-center text-muted-foreground text-xs">No history found</div>
                )}
            </div>
        </div>
    );
}
