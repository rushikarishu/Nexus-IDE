import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitStash } from "../types/git";
import { Archive, Play, Trash2, Plus } from "lucide-react";
import { useToast } from "../hooks/useToast";

interface GitStashProps {
    path: string;
    onStashChange: () => void;
}

export function GitStashList({ path, onStashChange, onBusyChange }: GitStashProps & { onBusyChange?: (busy: boolean) => void }) {
    const [stashes, setStashes] = useState<GitStash[]>([]);
    const [isStashing, setIsStashing] = useState(false);
    const [stashMessage, setStashMessage] = useState("");
    const toast = useToast();

    const loadStashes = async () => {
        try {
            const list = await invoke<GitStash[]>("git_stash_list", { path });
            setStashes(list);
        } catch (e) {
            console.error("Failed to load stashes:", e);
        }
    };

    useEffect(() => {
        void loadStashes();
    }, [path]);

    const handleStash = async () => {
        onBusyChange?.(true);
        try {
            await invoke("git_stash_save", { path, message: stashMessage || undefined });
            setStashMessage("");
            setIsStashing(false);
            await loadStashes();
            onStashChange();
            toast.success("Changes stashed");
        } catch (e) {
            toast.error(`Failed to stash: ${String(e)}`);
        } finally {
            onBusyChange?.(false);
        }
    };

    const handleApply = async (index: number) => {
        onBusyChange?.(true);
        try {
            await invoke("git_stash_apply", { path, index });
            onStashChange();
            toast.success("Stash applied");
        } catch (e) {
            toast.error(`Failed to apply stash: ${String(e)}`);
        } finally {
            onBusyChange?.(false);
        }
    };

    const handleDrop = async (index: number) => {
        if (!confirm("Drop this stash?")) return;
        onBusyChange?.(true);
        try {
            await invoke("git_stash_drop", { path, index });
            await loadStashes();
            toast.success("Stash dropped");
        } catch (e) {
            toast.error(`Failed to drop stash: ${String(e)}`);
        } finally {
            onBusyChange?.(false);
        }
    };

    return (
        <div className="flex flex-col border-t border-border mt-2 pt-2">
            <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stashes</span>
                <button
                    onClick={() => setIsStashing(!isStashing)}
                    className="p-1 hover:bg-accent rounded"
                    title="Stash Changes"
                >
                    <Plus size={12} />
                </button>
            </div>

            {isStashing && (
                <div className="px-2 mb-2 flex gap-1">
                    <input
                        className="flex-1 bg-input border border-border rounded px-2 py-1 text-xs"
                        placeholder="Message (optional)"
                        value={stashMessage}
                        onChange={(e) => setStashMessage(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                void handleStash();
                            }
                        }}
                    />
                    <button
                        onClick={() => {
                            void handleStash();
                        }}
                        className="p-1 bg-primary text-primary-foreground rounded"
                    >
                        <Archive size={12} />
                    </button>
                </div>
            )}

            <div className="max-h-32 overflow-y-auto px-2 space-y-0.5">
                {stashes.map((stash) => (
                    <div key={stash.index} className="flex items-center justify-between group text-sm hover:bg-accent/50 rounded px-2 py-1">
                        <div className="truncate flex-1 min-w-0 mr-2" title={stash.message}>
                            <span className="font-mono text-xs text-muted-foreground mr-2">@{stash.index}</span>
                            <span>{stash.message}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => {
                                    void handleApply(stash.index);
                                }}
                                className="p-1 hover:text-green-500"
                                title="Apply Stash"
                            >
                                <Play size={12} />
                            </button>
                            <button
                                onClick={() => {
                                    void handleDrop(stash.index);
                                }}
                                className="p-1 hover:text-red-500"
                                title="Drop Stash"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </div>
                ))}
                {stashes.length === 0 && !isStashing && (
                    <div className="text-xs text-muted-foreground italic px-2">No stashes</div>
                )}
            </div>
        </div>
    );
}
