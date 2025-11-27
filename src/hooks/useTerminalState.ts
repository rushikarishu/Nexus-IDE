import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useToast } from "./useToast";

export function useTerminalState() {
    const [isOpen, setIsOpen] = useState(true);
    const [terminalId, setTerminalId] = useState<string | null>(null);
    const [hasRunConfirmed, setHasRunConfirmed] = useState(false);
    const toast = useToast();

    const toggleTerminal = useCallback(() => setIsOpen((prev) => !prev), []);

    const runFile = useCallback(async (filePath: string | null, saveFile: () => Promise<void>) => {
        if (!filePath) {
            toast.error("No file selected to run");
            return;
        }

        if (!hasRunConfirmed) {
            const confirmed = await confirm(
                "Running code executes it on your local machine with your user privileges. Only run code you trust.\n\nDo you want to proceed?",
                { title: "Security Warning", kind: 'warning' }
            );
            if (!confirmed) return;
            setHasRunConfirmed(true);
        }

        // Save before running
        await saveFile();

        if (!terminalId) {
            toast.error("Terminal not ready");
            return;
        }

        if (!isOpen) {
            setIsOpen(true);
        }

        try {
            await invoke("run_file", {
                path: filePath,
                terminal_id: terminalId,
            });
        } catch (e) {
            console.error("Failed to run file:", e);
            // Try to write error to terminal
            try {
                await invoke("write_terminal", {
                    id: terminalId,
                    data: `\r\nError running file: ${String(e)}\r\n`
                });
            } catch {
                toast.error(`Failed to run file: ${String(e)}`);
            }
        }
    }, [terminalId, isOpen, hasRunConfirmed, toast]);

    return {
        isOpen,
        setIsOpen,
        toggleTerminal,
        terminalId,
        setTerminalId,
        runFile,
    };
}
