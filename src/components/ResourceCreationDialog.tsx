/* eslint react-hooks/set-state-in-effect: "off" */
import React, { useState, useEffect, useRef } from "react";
import { Dialog } from "./Dialog";
import { FileTree } from "./FileTree";
import { Folder, File } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface ResourceCreationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (path: string) => void;
    title: string;
    type: "file" | "folder";
    workspaceRoots: string[];
}

export function ResourceCreationDialog({ isOpen, onClose, onConfirm, title, type, workspaceRoots }: ResourceCreationDialogProps): React.JSX.Element {
    const [name, setName] = useState("");
    const [selectedPath, setSelectedPath] = useState(workspaceRoots[0] || "");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        // Reset state derived from props when dialog is opened
        setName("");
        setSelectedPath(workspaceRoots[0] || "");
        const id = window.setTimeout(() => inputRef.current?.focus(), 50);
        return () => window.clearTimeout(id);
    }, [isOpen, workspaceRoots]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) return;

        try {
            const fullPath = await invoke<string>("join_path", { parent: selectedPath, child: name });
            onConfirm(fullPath);
            onClose();
        } catch (error) {
            console.error("Failed to join path:", error);
        }
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="resource-form"
                        className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                    >
                        Create
                    </button>
                </>
            }
        >
            <div className="flex flex-col gap-4 h-[400px]">
                <div className="flex-1 border border-border rounded-md overflow-hidden flex flex-col">
                    <div className="bg-muted/50 px-3 py-2 text-xs font-medium border-b border-border">
                        Select Location: {selectedPath || "/"}
                    </div>
                    <div className="flex-1 overflow-y-auto bg-background/50">
                        <FileTree
                            workspaceRoots={workspaceRoots}
                            onFileSelect={async (path) => {
                                setSelectedPath(path);
                                return ""; // Dummy return to satisfy interface
                            }}
                        />
                    </div>
                </div>

                <form
                    id="resource-form"
                    onSubmit={(e) => { void handleSubmit(e); }}
                    className="flex flex-col gap-2"
                >
                    <label className="text-sm font-medium">Name</label>
                    <div className="relative">
                        <div className="absolute left-3 top-2.5 text-muted-foreground">
                            {type === "file" ? <File size={16} /> : <Folder size={16} />}
                        </div>
                        <input
                            ref={inputRef}
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={type === "file" ? "e.g., main.rs" : "e.g., components"}
                            className="w-full bg-input border border-input rounded pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                </form>
            </div>
        </Dialog>
    );
}
