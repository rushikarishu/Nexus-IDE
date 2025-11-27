import { Folder, Search, Settings, Terminal, AlertCircle, Sparkles, GitBranch, FolderOpen, FilePlus, FolderPlus, List, Play, Puzzle, FolderInput } from "lucide-react";
import { cn } from "../lib/utils";

interface SidebarProps {
    onOpenFolder: () => void;
    onAddFolder: () => void;
    onNewFile: () => void;
    onNewFolder: () => void;
    onToggleFileTree: () => void;
    _fileTreeVisible?: boolean;
    onToggleTerminal: () => void;
    terminalOpen: boolean;
    onToggleError: () => void;
    errorVisible: boolean;
    onSettings: () => void;
    activeTab: "explorer" | "search" | "git" | "ai" | "outline" | "run" | "plugins";
    onTabChange: (tab: "explorer" | "search" | "git" | "ai" | "outline" | "run" | "plugins") => void;
}

export function Sidebar({
    onOpenFolder,
    onAddFolder,
    onNewFile,
    onNewFolder,
    onToggleTerminal,
    terminalOpen,
    onToggleError,
    errorVisible,
    onSettings,
    activeTab,
    onTabChange
}: SidebarProps) {
    return (
        <div className="w-12 border-r border-border flex flex-col items-center py-4 bg-muted/20 z-20">
            <div className="flex flex-col gap-4">
                <button
                    className={cn(
                        "p-2 rounded-md transition-colors",
                        activeTab === "explorer" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    onClick={() => onTabChange("explorer")}
                    title="Explorer"
                >
                    <Folder size={20} />
                </button>
                <button
                    className={cn(
                        "p-2 rounded-md transition-colors",
                        activeTab === "search" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    onClick={() => onTabChange("search")}
                    title="Search"
                >
                    <Search size={20} />
                </button>
                <button
                    className={cn(
                        "p-2 rounded-md transition-colors",
                        activeTab === "git" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    onClick={() => onTabChange("git")}
                    title="Source Control"
                >
                    <GitBranch size={20} />
                </button>
                <button
                    className={cn(
                        "p-3 rounded-lg transition-colors",
                        activeTab === "run" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    onClick={() => onTabChange("run")}
                    title="Run & Test"
                >
                    <Play size={20} />
                </button>
                <button
                    className={cn(
                        "p-3 rounded-lg transition-colors",
                        activeTab === "plugins" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    onClick={() => onTabChange("plugins")}
                    title="Plugins"
                >
                    <Puzzle size={20} />
                </button>
                <button
                    className={cn(
                        "p-2 rounded-md transition-colors",
                        activeTab === "outline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    onClick={() => onTabChange("outline")}
                    title="Outline"
                >
                    <List size={20} />
                </button>
                <button
                    className={cn(
                        "p-2 rounded-md transition-colors",
                        activeTab === "ai" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    onClick={() => onTabChange("ai")}
                    title="AI Assistant"
                >
                    <Sparkles size={20} />
                </button>
            </div>

            <div className="w-8 h-[1px] bg-border my-2" />

            <div className="flex flex-col gap-2">
                <button
                    onClick={onOpenFolder}
                    className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    title="Open Folder"
                >
                    <FolderOpen size={20} />
                </button>
                <button
                    onClick={onAddFolder}
                    className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    title="Add Folder to Workspace"
                >
                    <FolderInput size={20} />
                </button>
                <button
                    onClick={onNewFile}
                    className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    title="New File"
                >
                    <FilePlus size={20} />
                </button>
                <button
                    onClick={onNewFolder}
                    className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    title="New Folder"
                >
                    <FolderPlus size={20} />
                </button>
            </div>

            <div className="mt-auto flex flex-col gap-4">
                <button
                    className={cn(
                        "p-2 rounded-md transition-colors",
                        errorVisible ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    onClick={onToggleError}
                    title="Problems"
                >
                    <AlertCircle size={20} />
                </button>
                <button
                    className={cn(
                        "p-2 rounded-md transition-colors",
                        terminalOpen ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    onClick={onToggleTerminal}
                    title="Terminal"
                >
                    <Terminal size={20} />
                </button>
                <button
                    className="p-2 text-muted-foreground hover:bg-accent hover:text-foreground rounded-md transition-colors"
                    onClick={onSettings}
                    title="Settings"
                >
                    <Settings size={20} />
                </button>
            </div>
        </div>
    );
}
