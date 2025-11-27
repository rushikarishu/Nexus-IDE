import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import { Logger } from "../lib/Logger";

// Custom interface for DOM element with web mode flag
interface WebModeDiv extends HTMLDivElement {
    _isWebMode?: boolean;
}

// Interface for Tauri window with internals
interface TauriWindow extends Window {
    __TAURI_INTERNALS__?: unknown;
}

export function Terminal({ visible, onTerminalReady }: { visible?: boolean, onTerminalReady?: (id: string) => void }) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const terminalIdRef = useRef<string | null>(null);


    // Refs for cleanup
    const isMounted = useRef(true);
    const unlistenRef = useRef<(() => void) | undefined>(undefined);
    const unlistenErrorRef = useRef<(() => void) | undefined>(undefined);
    const resizeHandlerRef = useRef<(() => void) | undefined>(undefined);



    useEffect(() => {
        if (visible && fitAddonRef.current && xtermRef.current && terminalRef.current) {
            // Small delay to ensure DOM is updated
            setTimeout(() => {
                try {
                    // Only fit if visible
                    if (terminalRef.current?.offsetParent) {
                        fitAddonRef.current?.fit();
                        xtermRef.current?.focus();
                    }
                } catch (err) {
                    console.error("Failed to fit terminal:", err);
                }
            }, 50);
        }
    }, [visible]);

    // Listen for external input (e.g. from Run button)
    useEffect(() => {
        const handleInput = (e: Event) => {
            const customEvent = e as CustomEvent<string>;
            if (terminalIdRef.current && customEvent.detail) {
                // Type-safe check for web mode
                const el = terminalRef.current as WebModeDiv | null;
                if (el?._isWebMode) {
                    if (xtermRef.current) {
                        const key = customEvent.detail;
                        if (key === "\r") {
                            xtermRef.current.write("\r\n$ ");
                        } else if (key === "\u007F") {
                            xtermRef.current.write("\b \b");
                        } else {
                            xtermRef.current.write(key);
                        }
                    }
                    return;
                }

                invoke("write_terminal", { id: terminalIdRef.current, data: customEvent.detail }).catch(console.error);
            }
        };

        window.addEventListener("terminal-input", handleInput);
        return () => window.removeEventListener("terminal-input", handleInput);
    }, []);

    useEffect(() => {
        if (!terminalRef.current || xtermRef.current) return;

        // Reset mounted state at start of effect (important for StrictMode)
        isMounted.current = true;

        const term = new XTerm({
            theme: {
                background: "#020817",
                foreground: "#f8fafc",
                cursor: "#f8fafc",
                selectionBackground: "#334155",
            },
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
            fontSize: 14,
            cursorBlink: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(terminalRef.current);
        // Write welcome message
        term.write("\r\n\x1b[1;34mNexus IDE Terminal\x1b[0m\r\n");
        term.write("Initializing...\r\n\r\n");
        // Do not call fit() here immediately. It causes a crash if the terminal is hidden.
        // The use Effect([visible]) hook will handle the initial fit safely.

        // Focus on click
        if (terminalRef.current) {
            terminalRef.current.onclick = () => {
                term.focus();
            };
        }

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // Reset cleanup refs
        unlistenRef.current = undefined;
        resizeHandlerRef.current = undefined;

        // Initialize backend terminal
        const termId = `term-${Date.now()}`;
        terminalIdRef.current = termId; // Set ID early for external input handler


        // Define startWebMode first so it's available in initTerminal
        const startWebMode = () => {
            if (!isMounted.current) return;

            term.write("\r\n\x1b[1;33m⚠ Backend not available. Running in Web Mode.\x1b[0m\r\n");
            term.write("This is a local echo terminal for preview purposes.\r\n\r\n$ ");

            // Type-safe assignment to WebModeDiv
            const el = terminalRef.current as WebModeDiv | null;
            if (el) {
                el._isWebMode = true;
            }

            term.onData((data) => {
                if (data === "\r") { // Enter
                    term.write("\r\n$ ");
                } else if (data === "\u007F") { // Backspace
                    term.write("\b \b");
                } else {
                    term.write(data);
                }
            });
        };

        // Wait for Tauri API to be ready
        const initTerminal = async () => {
            try {
                // Check if component was already unmounted (e.g., StrictMode double-mount)
                if (!isMounted.current) {
                    return;
                }

                // Type-safe check for Tauri
                const w = window as TauriWindow;
                const isTauri = typeof w.__TAURI_INTERNALS__ !== 'undefined';

                if (!isTauri) {
                    startWebMode();
                    return;
                }
                // Race invoke with a timeout as a safety net
                const createPromise = invoke<void>("create_terminal", { id: termId });
                // Silence unhandled rejection if this promise loses the race and then fails later
                createPromise.catch(() => { });

                const timeoutPromise = new Promise<void>((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout waiting for Tauri backend")), 5000)
                );

                await Promise.race([createPromise, timeoutPromise]);

                // Check if unmounted during initialization
                if (!isMounted.current) {
                    invoke("destroy_terminal", { id: termId }).catch(console.error);
                    return;
                }

                // Setup listener for incoming data
                const unlisten = await listen<string>(`terminal-data-${termId}`, (event) => {
                    term.write(event.payload);
                });

                // Listen for backend terminal errors
                const unlistenError = await listen<string>(`terminal-error-${termId}`, (event) => {
                    term.write(`\r\n\x1b[31m${event.payload}\x1b[0m\r\n`);
                });

                if (!isMounted.current) {
                    unlisten();
                    unlistenError();
                    return;
                }
                unlistenRef.current = unlisten;
                unlistenErrorRef.current = unlistenError;

                // Send input to backend
                term.onData((data) => {
                    invoke("write_terminal", { id: termId, data }).catch(console.error);
                });

                // Handle resize
                const resizeHandler = () => {
                    if (!terminalRef.current?.offsetParent) return;
                    try {
                        fitAddon.fit();
                        const dims = fitAddon.proposeDimensions();
                        if (dims) {
                            invoke("resize_terminal", {
                                id: termId,
                                rows: dims.rows,
                                cols: dims.cols
                            }).catch(console.error);
                        }
                    } catch {
                        // Silently ignore resize errors, often happens during rapid unmount/remount
                    }
                };
                resizeHandlerRef.current = resizeHandler;
                window.addEventListener("resize", resizeHandler);
                resizeHandler();
                resizeHandler();

                // Notify that terminal is ready (for Run button wiring)
                if (onTerminalReady) {
                    onTerminalReady(termId);
                }
                Logger.info("Terminal created", { id: termId });

            } catch (err) {
                // In StrictMode, the first mount may be cancelled - this is expected
                // Only log if component is still mounted (i.e., this isn't a StrictMode cleanup)
                if (isMounted.current) {
                    console.warn("Failed to initialize backend terminal:", err);
                    startWebMode();
                }
            }
        };

        void initTerminal();


        return () => {
            isMounted.current = false;
            // eslint-disable-next-line react-hooks/exhaustive-deps
            const currentTerminalRef = terminalRef.current;
            if (currentTerminalRef) currentTerminalRef.onclick = null;

            // Dispose and reset XTerm instance to allow clean remount (StrictMode)
            if (xtermRef.current) {
                xtermRef.current.dispose();
                xtermRef.current = null;
            }

            if (unlistenRef.current) unlistenRef.current();
            if (unlistenErrorRef.current) unlistenErrorRef.current();
            if (resizeHandlerRef.current) window.removeEventListener("resize", resizeHandlerRef.current);

            if (terminalIdRef.current) {
                invoke("destroy_terminal", { id: terminalIdRef.current }).catch(console.error);
                Logger.info("Terminal destroyed", { id: terminalIdRef.current });
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="h-full w-full overflow-hidden bg-card p-2 relative">
            <div ref={terminalRef} className="h-full w-full" />

        </div>
    );
}
