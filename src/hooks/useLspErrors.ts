import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useToast } from "./useToast";

interface LspErrorPayload {
    language: string;
    error: string;
}

export function useLspErrors() {
    const toast = useToast();
    const shownErrors = useRef(new Set<string>());

    useEffect(() => {
        let unlisten: (() => void) | undefined;

        const setupListener = async () => {
            unlisten = await listen<LspErrorPayload>("lsp-error", (event) => {
                const { language, error } = event.payload;
                const errorKey = `${language}:${error}`;

                // Show each error only once per session
                if (!shownErrors.current.has(errorKey)) {
                    shownErrors.current.add(errorKey);
                    toast.error(`LSP (${language}): ${error}`);
                }
            });
        };

        setupListener();

        return () => {
            if (unlisten) {
                unlisten();
            }
        };
    }, [toast]);
}
