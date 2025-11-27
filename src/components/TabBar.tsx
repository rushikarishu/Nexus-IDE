import { X } from "lucide-react";
import { cn } from "../lib/utils";

interface TabBarProps {
    openFiles: string[];
    activeFile: string | null;
    onTabSelect: (path: string) => void;
    onTabClose: (path: string) => void;
}

export function TabBar({ openFiles, activeFile, onTabSelect, onTabClose }: TabBarProps) {
    if (openFiles.length === 0) return null;

    return (
        <div className="flex items-center bg-muted/20 border-b border-border overflow-x-auto no-scrollbar">
            {openFiles.map((file) => {
                const fileName = file.split(/[/\\]/).pop() || file;
                const isActive = file === activeFile;

                return (
                    <div
                        key={file}
                        className={cn(
                            "group flex items-center gap-2 px-3 py-2 text-sm cursor-pointer border-r border-border/50 min-w-[120px] max-w-[200px] hover:bg-accent/50 transition-colors",
                            isActive && "bg-background border-t-2 border-t-primary text-foreground font-medium"
                        )}
                        onClick={() => onTabSelect(file)}
                        title={file}
                    >
                        <span className="truncate flex-1">{fileName}</span>
                        <button
                            className={cn(
                                "opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-muted-foreground/20 transition-all",
                                isActive && "opacity-100"
                            )}
                            onClick={(e) => {
                                e.stopPropagation();
                                onTabClose(file);
                            }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
