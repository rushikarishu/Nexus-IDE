import { useState, useEffect, useCallback } from "react";
import { getLspClient } from "../lib/lsp";
import type { FileDiagnostics } from "../lib/diagnostics";
import { pathToUri } from "../lib/diagnostics";
import { LANGUAGE_MAPPINGS } from "../lib/languageConfig";

/**
 * Central diagnostics store hook
 * Manages diagnostics from all LSP clients
 */
export function useDiagnostics() {
    const [diagnosticsByUri, setDiagnosticsByUri] = useState<Map<string, FileDiagnostics>>(
        new Map()
    );

    useEffect(() => {
        // Track cleanup functions for all LSP client listeners
        const unsubscribers: Array<() => void> = [];

        // Derive languages from language config (only those with LSP support)
        const languages = LANGUAGE_MAPPINGS
            .filter(mapping => mapping.lspKey && mapping.lspKey.trim() !== '')
            .map(mapping => mapping.lspKey);

        // Subscribe to diagnostics from each language's LSP client
        languages.forEach((language) => {
            try {
                const client = getLspClient(language);
                const unsubscribe = client.onDiagnostics((payload) => {
                    setDiagnosticsByUri((prev) => {
                        const next = new Map(prev);

                        // LSP publishDiagnostics semantics: replace diagnostics for this URI
                        if (payload.diagnostics.length > 0) {
                            next.set(payload.uri, {
                                uri: payload.uri,
                                language: payload.language,
                                diagnostics: payload.diagnostics,
                            });
                        } else {
                            // Empty diagnostics array means clear for this URI
                            next.delete(payload.uri);
                        }

                        return next;
                    });
                });

                unsubscribers.push(unsubscribe);
            } catch (err) {
                console.error(`Failed to subscribe to ${language} diagnostics:`, err);
            }
        });

        // Listen for LSP client shutdowns to clean up diagnostics
        const handleLspShutdown = (event: Event) => {
            const customEvent = event as CustomEvent<{ language: string }>;
            const language = customEvent.detail.language;

            setDiagnosticsByUri((prev) => {
                const next = new Map(prev);
                // Remove all diagnostics for this language
                for (const [uri, diag] of prev.entries()) {
                    if (diag.language === language) {
                        next.delete(uri);
                    }
                }
                return next;
            });
        };

        window.addEventListener('lsp-shutdown', handleLspShutdown);
        // Add cleanup function to unsubscribers array - will be called in effect cleanup
        unsubscribers.push(() => window.removeEventListener('lsp-shutdown', handleLspShutdown));

        // Cleanup on unmount - calls all unsubscribe functions
        return () => {
            unsubscribers.forEach((unsub) => unsub());
        };
    }, []);

    // Get diagnostics for a specific URI
    const getDiagnosticsForUri = useCallback(
        (uri: string): FileDiagnostics | undefined => {
            return diagnosticsByUri.get(uri);
        },
        [diagnosticsByUri]
    );

    // Get diagnostics for a filesystem path
    const getDiagnosticsForPath = useCallback(
        (path: string): FileDiagnostics | undefined => {
            const uri = pathToUri(path);
            return diagnosticsByUri.get(uri);
        },
        [diagnosticsByUri]
    );

    // Get all diagnostics as an array
    const getAllDiagnostics = useCallback((): FileDiagnostics[] => {
        return Array.from(diagnosticsByUri.values());
    }, [diagnosticsByUri]);

    // Get total count of diagnostics across all files
    const getDiagnosticsCount = useCallback((): number => {
        let count = 0;
        diagnosticsByUri.forEach((fileDiag) => {
            count += fileDiag.diagnostics.length;
        });
        return count;
    }, [diagnosticsByUri]);

    // Get count of errors (severity 1)
    const getErrorCount = useCallback((): number => {
        let count = 0;
        diagnosticsByUri.forEach((fileDiag) => {
            count += fileDiag.diagnostics.filter((d) => d.severity === 1).length;
        });
        return count;
    }, [diagnosticsByUri]);

    // Get count of warnings (severity 2)
    const getWarningCount = useCallback((): number => {
        let count = 0;
        diagnosticsByUri.forEach((fileDiag) => {
            count += fileDiag.diagnostics.filter((d) => d.severity === 2).length;
        });
        return count;
    }, [diagnosticsByUri]);

    return {
        diagnosticsByUri,
        getDiagnosticsForUri,
        getDiagnosticsForPath,
        getAllDiagnostics,
        getDiagnosticsCount,
        getErrorCount,
        getWarningCount,
    };
}
