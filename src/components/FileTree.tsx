import { useState, useEffect, memo, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, FileCode, FileJson, FileType, FileText } from "lucide-react";
import { cn } from "../lib/utils";
import { GitStatus } from "../types/git";

interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    children?: FileEntry[];
}



function getFileIcon(name: string) {
    if (name.endsWith(".rs")) return <FileCode size={14} className="text-orange-500" />;
    if (name.endsWith(".ts") || name.endsWith(".tsx")) return <FileCode size={14} className="text-blue-500" />;
    if (name.endsWith(".js") || name.endsWith(".jsx")) return <FileCode size={14} className="text-yellow-400" />;
    if (name.endsWith(".json")) return <FileJson size={14} className="text-yellow-200" />;
    if (name.endsWith(".css")) return <FileType size={14} className="text-blue-300" />;
    if (name.endsWith(".md")) return <FileText size={14} className="text-gray-400" />;
    return <File size={14} className="text-muted-foreground" />;
}

import { PromptDialog, ConfirmDialog } from "./Dialog";

const FileTreeNode = memo(function FileTreeNode({ entry, onFileSelect, level = 0, onRefresh, gitStatus, workspaceRoot }: { entry: FileEntry, onFileSelect?: (path: string) => void, level?: number, onRefresh?: () => void, gitStatus?: GitStatus | null, workspaceRoot: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [children, setChildren] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false);

    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);

    const [hasLoaded, setHasLoaded] = useState(false);

    // Git status for this file - memoized to prevent recalculation on every render
    const { fileGitStatus, statusColor } = useMemo(() => {
        // Normalize paths to handle Windows backslashes and ensure consistent comparison
        const normalize = (p: string) => p.replace(/\\/g, "/");
        const relPath = entry.path.startsWith(workspaceRoot)
            ? normalize(entry.path.slice(workspaceRoot.length + 1))
            : normalize(entry.path);

        const fileGitStatus = gitStatus?.files.find(
            f => normalize(f.path) === relPath
        );

        const statusColor = fileGitStatus?.status === "M" ? "text-yellow-400" :
            fileGitStatus?.status === "A" || fileGitStatus?.status === "??" || fileGitStatus?.status === "U" ? "text-green-400" :
                fileGitStatus?.status === "D" ? "text-red-400" : "";

        return { fileGitStatus, statusColor };
    }, [entry.path, gitStatus, workspaceRoot]);

    const fetchChildren = async () => {
        setLoading(true);
        try {
            const files = await invoke<FileEntry[]>("read_dir", { path: entry.path });
            setChildren(files);
            setHasLoaded(true);
        } catch (error) {
            console.error("Failed to read dir:", error);
        }
        setLoading(false);
    };

    async function toggleOpen() {
        if (!entry.is_dir) {
            onFileSelect?.(entry.path);
            return;
        }

        if (!isOpen && !hasLoaded) {
            await fetchChildren();
        }
        setIsOpen(!isOpen);
    }

    function handleContextMenu(e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
    }

    async function handleDelete() {
        try {
            await invoke("delete_file", { path: entry.path });
            onRefresh?.();
        } catch (error) {
            console.error("Failed to delete file:", error);
            alert(`Failed to delete: ${String(error)}`);
        }
    }

    async function handleRename(newName: string) {
        if (newName && newName !== entry.name) {
            try {
                // Use backend to get parent path safely
                const parentPath = await invoke<string>("get_parent_path", { path: entry.path });
                const newPath = await invoke<string>("join_path", { parent: parentPath, child: newName });
                await invoke("rename_file", { old_path: entry.path, new_path: newPath });
                onRefresh?.();
            } catch (error) {
                console.error("Failed to rename file:", error);
                alert(`Failed to rename: ${String(error)}`);
            }
        }
    }

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    }, []);

    return (
        <div className="relative">
            <PromptDialog
                isOpen={isRenameOpen}
                onClose={() => setIsRenameOpen(false)}
                onConfirm={(val) => void handleRename(val)}
                title="Rename File"
                initialValue={entry.name}
                confirmText="Rename"
            />
            <ConfirmDialog
                isOpen={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                onConfirm={() => void handleDelete()}
                title="Delete File"
                message={`Are you sure you want to delete ${entry.name}? This action cannot be undone.`}
                confirmText="Delete"
                destructive
            />

            <div
                className={cn(
                    "flex items-center gap-1.5 py-1 px-2 cursor-pointer text-sm select-none transition-colors duration-200 rounded-sm mx-1",
                    !entry.is_dir && "text-muted-foreground",
                    "hover:bg-accent/50 hover:text-accent-foreground",
                    isOpen && entry.is_dir && "text-foreground"
                )}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                onClick={() => void toggleOpen()}
                onContextMenu={handleContextMenu}
            >
                {entry.is_dir ? (
                    <>
                        {isOpen ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                        {isOpen ? <FolderOpen size={14} className="text-blue-400" /> : <Folder size={14} className="text-blue-400" />}
                    </>
                ) : (
                    getFileIcon(entry.name)
                )}
                <span className={cn("truncate flex-1", statusColor)}>{entry.name}</span>
                {fileGitStatus && (
                    <span className={cn("text-[10px] font-mono ml-2", statusColor)}>
                        {fileGitStatus.status === "??" ? "U" : fileGitStatus.status}
                    </span>
                )}
            </div>

            {contextMenu && (
                <div
                    className="fixed z-50 bg-popover text-popover-foreground border border-border rounded shadow-md py-1 min-w-[120px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                        onClick={(e) => { e.stopPropagation(); setIsRenameOpen(true); setContextMenu(null); }}
                    >
                        Rename
                    </button>
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground text-red-500"
                        onClick={(e) => { e.stopPropagation(); setIsDeleteOpen(true); setContextMenu(null); }}
                    >
                        Delete
                    </button>
                </div>
            )}

            {isOpen && (
                <div>
                    {loading ? (
                        <div className="pl-8 text-xs text-muted-foreground py-1">Loading...</div>
                    ) : (
                        children.map((child) => (
                            <FileTreeNode
                                key={child.path}
                                entry={child}
                                onFileSelect={onFileSelect}
                                level={level + 1}
                                onRefresh={() => void fetchChildren()}
                                gitStatus={gitStatus}
                                workspaceRoot={workspaceRoot}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
});

interface FileTreeProps {
    workspaceRoots: string[];
    onFileSelect?: (path: string) => void;
    gitStatus?: GitStatus | null;
}

export function FileTree({ workspaceRoots, onFileSelect, gitStatus }: FileTreeProps & { refreshTrigger?: number }) {
    // We render a root node for each workspace root
    // But wait, FileTreeNode expects an entry.
    // We need to construct "fake" root entries for each workspace root.

    if (!workspaceRoots || workspaceRoots.length === 0) {
        return <div className="p-4 text-sm text-muted-foreground text-center">No folder opened</div>;
    }

    return (
        <div className="flex flex-col h-full overflow-y-auto py-2">
            {workspaceRoots.map((rootPath) => {
                const rootName = rootPath.split(/[/\\]/).pop() || rootPath;
                const rootEntry: FileEntry = {
                    name: rootName,
                    path: rootPath,
                    is_dir: true,
                };

                return (
                    <div key={rootPath} className="mb-2">
                        <div className="px-2 py-1 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            {rootName}
                        </div>
                        <FileTreeNode
                            entry={rootEntry}
                            onFileSelect={onFileSelect}
                            // Start expanded? Or let user expand?
                            // Let's make the root node itself the container, but FileTreeNode fetches children.
                            // Actually, FileTreeNode fetches children of 'entry'.
                            // So if we pass the root as an entry, it will fetch its children.
                            // But we want the root to be always expanded or at least visible as a root.
                            // Let's just use FileTreeNode but maybe force it open?
                            // Or better, we can just map the children of the root?
                            // No, we want the root folder to be visible so we can collapse it.

                            // We need to pass workspaceRoot for git status calculation
                            workspaceRoot={rootPath}
                            gitStatus={gitStatus}
                            level={0}
                        />
                    </div>
                );
            })}
        </div>
    );
}
