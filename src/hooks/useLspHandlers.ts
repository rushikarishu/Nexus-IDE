import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { onLspClientCreated, LspClient } from '../lib/lsp';
import { applyTextEdits, TextEdit } from '../lib/textUtils';
import { FileState } from './useFileSystem';

interface WorkspaceEdit {
    changes?: { [uri: string]: TextEdit[] };
    // documentChanges not supported yet
}

export function useLspHandlers(
    fileStates: Map<string, FileState>,
    updateFileState: (path: string, updates: Partial<FileState>) => void
) {
    useEffect(() => {
        const handleWorkspaceEdit = async (params: { label?: string; edit: WorkspaceEdit }) => {
            console.log("Received workspace/applyEdit", params);
            const { edit } = params;

            if (edit.changes) {
                for (const [uri, edits] of Object.entries(edit.changes)) {
                    const path = uri.replace("file://", "");

                    try {
                        let content = "";
                        const fileState = fileStates.get(path);

                        if (fileState) {
                            content = fileState.content;
                        } else {
                            // Read from disk
                            content = await invoke<string>("read_file", { path });
                        }

                        const newContent = applyTextEdits(content, edits);

                        if (fileState) {
                            updateFileState(path, { content: newContent, isDirty: true });
                        } else {
                            // Write to disk
                            await invoke("save_file", { path, content: newContent });
                        }
                    } catch (err) {
                        console.error(`Failed to apply edit to ${path}:`, err);
                        throw err; // Will be sent back as error to LSP
                    }
                }
            }

            return { applied: true };
        };

        const unregister = onLspClientCreated((client: LspClient) => {
            client.onRequest("workspace/applyEdit", handleWorkspaceEdit);
        });

        return () => {
            unregister();
        };
    }, [fileStates, updateFileState]);
}
