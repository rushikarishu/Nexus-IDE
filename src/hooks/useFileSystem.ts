import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from '@tauri-apps/plugin-dialog';
import { getLspClient } from "../lib/lsp";
import { getLspKey } from "../lib/languageConfig";
import { useMonaco } from "@monaco-editor/react";
import { validatePath } from "../lib/pathValidation";
import { isAbsolute } from "path-browserify";
import { Logger } from "../lib/Logger";

export interface FileState {
    content: string;
    isDirty: boolean;
    version: number;
}

export function useFileSystem(_lspStatus: "stopped" | "running" | "error", setLspStatus: (status: "stopped" | "running" | "error") => void) {
    const monaco = useMonaco();
    const [openFiles, setOpenFiles] = useState<string[]>([]);
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const [fileStates, setFileStates] = useState<Map<string, FileState>>(new Map());
    const [lspStatuses, setLspStatuses] = useState<Map<string, "stopped" | "running" | "error">>(new Map());

    const [workspaceRoots, setWorkspaceRoots] = useState<string[]>([]);

    const addWorkspaceRoot = useCallback(async (path: string) => {
        if (!path) return;
        if (!isAbsolute(path)) {
            console.error("Workspace root must be an absolute path:", path);
            return;
        }
        if (workspaceRoots.includes(path)) return;

        const newRoots = [...workspaceRoots, path];
        setWorkspaceRoots(newRoots);

        try {
            await invoke("set_workspace_roots", { paths: newRoots });

            // Notify LSPs
            const added = [{ uri: `file://${path}`, name: path.split('/').pop() || path }];
            for (const [key, status] of lspStatuses.entries()) {
                if (status === "running") {
                    const client = getLspClient(key);
                    client.sendNotification("workspace/didChangeWorkspaceFolders", {
                        event: { added, removed: [] }
                    });
                }
            }
        } catch (e) {
            console.error("Failed to add workspace root:", e);
            // Revert on failure
            setWorkspaceRoots(workspaceRoots);
        }
    }, [workspaceRoots, lspStatuses]);

    const removeWorkspaceRoot = useCallback(async (path: string) => {
        if (!workspaceRoots.includes(path)) return;

        const newRoots = workspaceRoots.filter(p => p !== path);
        setWorkspaceRoots(newRoots);

        try {
            await invoke("set_workspace_roots", { paths: newRoots });

            // Notify LSPs
            const removed = [{ uri: `file://${path}`, name: path.split('/').pop() || path }];
            for (const [key, status] of lspStatuses.entries()) {
                if (status === "running") {
                    const client = getLspClient(key);
                    client.sendNotification("workspace/didChangeWorkspaceFolders", {
                        event: { added: [], removed }
                    });
                }
            }
        } catch (e) {
            console.error("Failed to remove workspace root:", e);
            // Revert on failure
            setWorkspaceRoots(workspaceRoots);
        }
    }, [workspaceRoots, lspStatuses]);

    const replaceWorkspaceRoots = useCallback(async (paths: string[]) => {
        const oldRoots = [...workspaceRoots];
        setWorkspaceRoots(paths);

        try {
            await invoke("set_workspace_roots", { paths });

            // Notify LSPs
            // Calculate diff
            const added = paths.filter(p => !oldRoots.includes(p)).map(p => ({ uri: `file://${p}`, name: p.split('/').pop() || p }));
            const removed = oldRoots.filter(p => !paths.includes(p)).map(p => ({ uri: `file://${p}`, name: p.split('/').pop() || p }));

            if (added.length > 0 || removed.length > 0) {
                for (const [key, status] of lspStatuses.entries()) {
                    if (status === "running") {
                        const client = getLspClient(key);
                        client.sendNotification("workspace/didChangeWorkspaceFolders", {
                            event: { added, removed }
                        });
                    }
                }
            }
        } catch (e) {
            console.error("Failed to replace workspace roots:", e);
            setWorkspaceRoots(oldRoots);
        }
    }, [workspaceRoots, lspStatuses]);

    const updateFileState = useCallback((path: string, updates: Partial<FileState>) => {
        setFileStates(prev => {
            const newMap = new Map(prev);
            const current = newMap.get(path) || { content: "", isDirty: false, version: 1 };
            newMap.set(path, { ...current, ...updates });
            return newMap;
        });
    }, []);

    const handleFileSelect = useCallback(async (path: string) => {
        // Validate path is within workspace
        try {
            validatePath(path, workspaceRoots);
        } catch (error) {
            console.error("Path validation failed:", error);
            throw error;
        }

        try {
            if (openFiles.includes(path)) {
                setActiveFile(path);
                if (!fileStates.has(path)) {
                    const content = await invoke<string>("read_file", { path });
                    updateFileState(path, { content, isDirty: false, version: 1 });
                    return content;
                } else {
                    return fileStates.get(path)!.content;
                }
            }

            const content = await invoke<string>("read_file", { path });
            setOpenFiles(prev => [...prev, path]);
            setActiveFile(path);
            updateFileState(path, { content, isDirty: false, version: 1 });
            Logger.info("File opened", { path });

            // Start LSP for this language if configured
            const lspKey = getLspKey(path);
            if (lspKey && lspStatuses.get(lspKey) !== "running") {
                try {
                    const lspClient = getLspClient(lspKey);

                    // Initialize will now throw on failure, allowing proper error handling
                    await lspClient.initialize();
                    await lspClient.sendRequest("initialize", {
                        processId: null,
                        rootUri: null,
                        capabilities: {},
                        workspaceFolders: workspaceRoots.map(uri => ({
                            uri: `file://${uri}`,
                            name: uri.split('/').pop() || uri
                        }))
                    });
                    await lspClient.sendNotification("initialized", {});

                    setLspStatuses(prev => new Map(prev).set(lspKey, "running"));
                    setLspStatus("running");
                } catch (e) {
                    console.error(`Failed to start ${lspKey} LSP:`, e);
                    setLspStatuses(prev => new Map(prev).set(lspKey, "error"));
                    setLspStatus("error");
                    // Error is now properly surfaced through setLspStatus
                }
            }
            return content;
        } catch (err) {
            console.error(`Failed to load file: ${String(err)}`);
            throw err;
        }
    }, [openFiles, fileStates, lspStatuses, setLspStatus, updateFileState, workspaceRoots]);

    // Debounced auto-save
    const debouncedSave = useCallback(
        (path: string, content: string) => {
            const timer = setTimeout(() => {
                invoke("save_file", { path, content })
                    .then(() => {
                        updateFileState(path, { isDirty: false });
                        Logger.info("File auto-saved", { path });

                    })
                    .catch((error) => {
                        console.error("Auto-save failed:", error);
                    });
            }, 2000); // 2 second delay
            return () => clearTimeout(timer);
        },
        [updateFileState]
    );

    // Keep track of save timers
    const [saveTimers, setSaveTimers] = useState<Map<string, () => void>>(new Map());

    const triggerAutoSave = useCallback((path: string, content: string) => {
        setSaveTimers(prev => {
            const newMap = new Map(prev);
            if (newMap.has(path)) {
                newMap.get(path)?.(); // Clear existing timer
            }
            const clearTimer = debouncedSave(path, content);
            newMap.set(path, clearTimer);
            return newMap;
        });
    }, [debouncedSave]);

    const handleSave = useCallback(async (content?: string) => {
        if (!activeFile) return;

        // Use provided content or fetch from fileStates
        const saveContent = content ?? fileStates.get(activeFile)?.content;
        if (saveContent === undefined) return;

        // Clear any pending auto-save for this file
        if (saveTimers.has(activeFile)) {
            saveTimers.get(activeFile)?.();
            setSaveTimers(prev => {
                const newMap = new Map(prev);
                newMap.delete(activeFile);
                return newMap;
            });
        }

        try {
            await invoke("save_file", { path: activeFile, content: saveContent });
            updateFileState(activeFile, { isDirty: false });
            Logger.info("File saved", { path: activeFile });

        } catch (error) {
            console.error("Failed to save file:", error);
            throw error;
        }
    }, [activeFile, fileStates, updateFileState, saveTimers]);

    const handleTabClose = useCallback(async (path: string) => {
        // Check for unsaved changes
        const fileState = fileStates.get(path);
        if (fileState?.isDirty) {
            const confirmed = await ask(`Save changes to ${path.split('/').pop()}?`, {
                title: 'Unsaved Changes',
                kind: 'warning',
                okLabel: 'Save',
                cancelLabel: 'Don\'t Save'
            });

            if (confirmed) {
                await handleSave(fileState.content); // Pass content directly to avoid race conditions
            } else {
                // If user cancels the dialog (not the "Don't Save" button, but actual cancel if supported, 
                // though ask() usually returns boolean for Yes/No. 
                // Actually ask() returns boolean. True = OK (Save), False = Cancel (Don't Save).
                // Wait, standard behavior is usually [Save] [Don't Save] [Cancel].
                // Tauri's ask() is simple Yes/No.
                // Let's assume True = Save, False = Discard for now based on labels.
                // But wait, what if they want to cancel the close entirely?
                // Tauri's `ask` doesn't support 3 buttons easily.
                // Let's use `confirm` for simple Yes/No (Close without saving?) or just stick to `ask`.
                // Better UX: "Do you want to save changes?" -> Yes (Save & Close), No (Discard & Close).
                // If they want to Cancel, they usually click X on the dialog, which returns false?
                // Actually, let's use a custom dialog if possible, but for now `ask` is what we have.
                // Let's refine: "Unsaved changes. Save?" -> Yes (Save), No (Discard). 
                // If they want to cancel, they can't with `ask`.
                // Limitation accepted for now as per plan.
            }
        }

        const newOpenFiles = openFiles.filter(f => f !== path);
        setOpenFiles(newOpenFiles);

        setFileStates(prev => {
            const newMap = new Map(prev);
            newMap.delete(path);
            return newMap;
        });

        // Send didClose notification to appropriate LSP server
        const lspKey = getLspKey(path);
        if (lspKey && lspStatuses.get(lspKey) === "running") {
            const lspClient = getLspClient(lspKey);
            void lspClient.sendNotification("textDocument/didClose", {
                textDocument: { uri: `file://${path}` },
            });
        }

        // Dispose Monaco model for this file to avoid leaking models
        if (monaco) {
            const uri = monaco.Uri.parse(`file://${path}`);
            const model = monaco.editor.getModel(uri);
            if (model) {
                model.dispose();
            }
        }

        if (activeFile === path) {
            if (newOpenFiles.length > 0) {
                const lastFile = newOpenFiles[newOpenFiles.length - 1];
                setActiveFile(lastFile);
                return fileStates.get(lastFile)?.content || "";
            } else {
                setActiveFile(null);
                return null;
            }
        }
        return undefined; // No activeFile change
    }, [openFiles, activeFile, lspStatuses, fileStates, monaco, handleSave]);



    const handleCreateFile = useCallback(async (fileName: string) => {
        if (!fileName) return;

        // Validate path is within workspace
        try {
            validatePath(fileName, workspaceRoots);
        } catch (error) {
            console.error("Path validation failed:", error);
            alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }

        try {
            await invoke("create_file", { path: fileName });
            await handleFileSelect(fileName);
            Logger.info("File created", { path: fileName });
            return true;
        } catch (error) {
            console.error("Failed to create file:", error);
            alert(`Error creating file: ${String(error)}`);
            return false;
        }
    }, [handleFileSelect]);

    const handleCreateFolder = useCallback(async (folderPath: string) => {
        if (!folderPath) return false;

        // Validate path is within workspace
        try {
            validatePath(folderPath, workspaceRoots);
        } catch (error) {
            console.error("Path validation failed:", error);
            throw error;
        }

        try {
            await invoke("create_dir", { path: folderPath });
            Logger.info("Folder created", { path: folderPath });
            return true;
        } catch (error) {
            console.error("Failed to create folder:", error);
            throw error;
        }
    }, []);

    // Cleanup auto-save timers on unmount
    useEffect(() => {
        return () => {
            saveTimers.forEach(clearTimer => clearTimer());
        };
    }, [saveTimers]);

    return {
        openFiles,
        activeFile,
        fileStates,
        workspaceRoots,
        addWorkspaceRoot,
        removeWorkspaceRoot,
        replaceWorkspaceRoots,
        handleFileSelect,
        handleTabClose,
        handleSave,
        handleCreateFile,
        handleCreateFolder,
        updateFileState,
        setActiveFile,
        triggerAutoSave
    };
}
