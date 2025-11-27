import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitBranch } from "../types/git";
import { GitBranch as GitBranchIcon, Plus, Trash2, Check } from "lucide-react";
import { useToast } from "../hooks/useToast";

interface GitBranchesProps {
    path: string;
    onBranchChange: () => void;
}

export function GitBranches({ path, onBranchChange, onBusyChange }: GitBranchesProps & { onBusyChange?: (busy: boolean) => void }) {
    const [branches, setBranches] = useState<GitBranch[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [newBranchName, setNewBranchName] = useState("");
    const toast = useToast();

    const loadBranches = async () => {
        try {
            const list = await invoke<GitBranch[]>("git_get_branches", { path });
            setBranches(list);
        } catch (e) {
            console.error("Failed to load branches:", e);
        }
    };

    useEffect(() => {
        void loadBranches();
    }, [path]);

    const handleCheckout = async (branchName: string) => {
        onBusyChange?.(true);
        try {
            await invoke("git_checkout_branch", { path, branchName });
            await loadBranches();
            onBranchChange();
            toast.success(`Checked out ${branchName}`);
        } catch (e) {
            toast.error(`Failed to checkout ${branchName}: ${String(e)}`);
        } finally {
            onBusyChange?.(false);
        }
    };

    const handleCreate = async () => {
        if (!newBranchName) return;
        onBusyChange?.(true);
        try {
            await invoke("git_create_branch", { path, branchName: newBranchName });
            setNewBranchName("");
            setIsCreating(false);
            await loadBranches();
            onBranchChange();
            toast.success(`Created branch ${newBranchName}`);
        } catch (e) {
            toast.error(`Failed to create branch: ${String(e)}`);
        } finally {
            onBusyChange?.(false);
        }
    };

    const handleDelete = async (branchName: string) => {
        if (!confirm(`Delete branch ${branchName}?`)) return;
        onBusyChange?.(true);
        try {
            await invoke("git_delete_branch", { path, branchName });
            await loadBranches();
            toast.success(`Deleted branch ${branchName}`);
        } catch (e) {
            toast.error(`Failed to delete branch: ${String(e)}`);
        } finally {
            onBusyChange?.(false);
        }
    };

    return (
        <div className="flex flex-col border-b border-border pb-2 mb-2">
            <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Branches</span>
                <button
                    onClick={() => setIsCreating(!isCreating)}
                    className="p-1 hover:bg-accent rounded"
                    title="New Branch"
                >
                    <Plus size={12} />
                </button>
            </div>

            {isCreating && (
                <div className="px-2 mb-2 flex gap-1">
                    <input
                        className="flex-1 bg-input border border-border rounded px-2 py-1 text-xs"
                        placeholder="Branch name"
                        value={newBranchName}
                        onChange={(e) => setNewBranchName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                void handleCreate();
                            }
                        }}
                    />
                    <button
                        onClick={() => {
                            void handleCreate();
                        }}
                        className="p-1 bg-primary text-primary-foreground rounded"
                    >
                        <Check size={12} />
                    </button>
                </div>
            )}

            <div className="max-h-32 overflow-y-auto px-2 space-y-0.5">
                {branches.map((branch) => (
                    <div key={branch.name} className="flex items-center justify-between group text-sm hover:bg-accent/50 rounded px-2 py-1">
                        <div
                            className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                            onClick={() => {
                                void handleCheckout(branch.name);
                            }}
                        >
                            <GitBranchIcon size={12} className={branch.active ? "text-primary" : "text-muted-foreground"} />
                            <span className={`truncate ${branch.active ? "font-medium text-primary" : ""}`}>
                                {branch.name}
                            </span>
                        </div>
                        {!branch.active && (
                            <button
                                onClick={() => {
                                    void handleDelete(branch.name);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity"
                                title="Delete Branch"
                            >
                                <Trash2 size={12} />
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
