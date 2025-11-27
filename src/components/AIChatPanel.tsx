import { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, Square, AlertCircle, RefreshCw, ChevronDown, ChevronsLeft, LayoutTemplate, CheckSquare } from 'lucide-react';
import { useAISession } from '../hooks/useAISession';
import { ToolProposalList } from './ToolProposalList';
import { Proposal } from '../types/ai';
import { ProposalDiffViewer } from './ProposalDiffViewer';
import { PreviewPanel } from './PreviewPanel';
import { TaskPanel } from './TaskPanel';

import { MessageRenderer } from './MessageRenderer';

interface AIChatPanelProps {
    onClose?: () => void;
    session: ReturnType<typeof useAISession>;
}

import { invoke } from '@tauri-apps/api/core';

interface RagStatus {
    qdrant: boolean;
    chutes: boolean;
}

export function AIChatPanel({ onClose, session }: AIChatPanelProps) {
    const {
        sessionId,
        history,
        isLoading,
        error,
        proposals,
        createSession,
        sendPromptStreaming,
        runCompass,
        retryLastPrompt,
        cancelRequest,
        approveProposal,
        rejectProposal
    } = session;

    const [input, setInput] = useState("");
    const [diffProposal, setDiffProposal] = useState<Proposal | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const [ragStatus, setRagStatus] = useState<RagStatus>({ qdrant: false, chutes: false });
    const [mode, setMode] = useState<"supadev" | "beastup">("supadev");
    const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
    const [activePanel, setActivePanel] = useState<"chat" | "preview" | "tasks">("chat");

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const status = await invoke<RagStatus>('get_rag_status');
                setRagStatus(status);
            } catch (e) {
                console.error("Failed to get RAG status:", e);
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    const getDiffPath = (proposal: Proposal | null): string => {
        if (!proposal) return "";
        const maybe = (proposal.args as { path?: unknown }).path;
        return typeof maybe === 'string' ? maybe : "";
    };

    const getDiffContent = (proposal: Proposal | null): string => {
        if (!proposal) return "";
        const maybe = (proposal.args as { content?: unknown }).content;
        if (typeof maybe === 'string') return maybe;
        if (maybe === undefined || maybe === null) return "";
        try {
            return JSON.stringify(maybe, null, 2);
        } catch {
            return "";
        }
    };

    // Auto-scroll to bottom
    useEffect(() => {
        if (activePanel === "chat") {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [history, error, proposals, activePanel]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        if (mode === "beastup") {
            void runCompass(input);
        } else {
            void sendPromptStreaming(input);
        }
        setInput("");
    };

    // Auto-create session on mount if none exists
    useEffect(() => {
        if (sessionId) return; // Don't recreate if already exists
        if (!isLoading) {
            void createSession({
                mode: mode,
                provider: "internal"
            });
        }
    }, [sessionId, isLoading, createSession, mode]);

    const handleModeChange = (newMode: "supadev" | "beastup") => {
        setMode(newMode);
        // Re-create session with new mode
        void createSession({
            mode: newMode,
            provider: "internal"
        });
    };

    return (
        <div className="flex flex-col h-full bg-card text-card-foreground border-l border-border">
            {/* Header */}
            <div className="h-12 border-b border-border flex items-center px-4 justify-between font-medium shrink-0">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span>SupaDev AI</span>
                    <div className="flex items-center gap-1 ml-2" title={`RAG Status: Qdrant ${ragStatus.qdrant ? 'OK' : 'OFF'}, Chutes ${ragStatus.chutes ? 'OK' : 'OFF'}`}>
                        <div className={`w-2 h-2 rounded-full ${ragStatus.qdrant && ragStatus.chutes ? 'bg-green-500' : 'bg-red-500'}`} />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setActivePanel(activePanel === "preview" ? "chat" : "preview")}
                        className={`p-1.5 rounded-md transition-colors ${activePanel === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                        title="Toggle Preview"
                    >
                        <LayoutTemplate size={14} />
                    </button>
                    <button
                        onClick={() => setActivePanel(activePanel === "tasks" ? "chat" : "tasks")}
                        className={`p-1.5 rounded-md transition-colors ${activePanel === "tasks" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                        title="Toggle Tasks"
                    >
                        <CheckSquare size={14} />
                    </button>
                    <div className="w-px h-4 bg-border mx-1" />
                    <div className="relative">
                        <button
                            onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
                            className="flex items-center gap-2 text-xs bg-input text-foreground border border-border rounded-md px-3 py-1.5 hover:bg-accent hover:text-accent-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            <span>{mode === "supadev" ? "SupaDev" : "Beast Mode"}</span>
                            <ChevronDown size={12} className="opacity-50" />
                        </button>

                        {isModeDropdownOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setIsModeDropdownOpen(false)}
                                />
                                <div className="absolute right-0 top-full mt-1 w-32 bg-popover text-popover-foreground border border-border rounded-md shadow-md z-50 py-1 flex flex-col">
                                    <button
                                        onClick={() => {
                                            handleModeChange("supadev");
                                            setIsModeDropdownOpen(false);
                                        }}
                                        className={`text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground transition-colors ${mode === "supadev" ? "bg-accent/50" : ""}`}
                                    >
                                        SupaDev
                                    </button>
                                    <button
                                        onClick={() => {
                                            handleModeChange("beastup");
                                            setIsModeDropdownOpen(false);
                                        }}
                                        className={`text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground transition-colors ${mode === "beastup" ? "bg-accent/50" : ""}`}
                                    >
                                        Beast Mode
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                            title="Collapse Sidebar"
                        >
                            <ChevronsLeft size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden relative">
                {activePanel === "preview" && (
                    <div className="absolute inset-0 z-10 bg-background">
                        <PreviewPanel onClose={() => setActivePanel("chat")} />
                    </div>
                )}

                {activePanel === "tasks" && (
                    <div className="absolute inset-0 z-10 bg-background">
                        <TaskPanel onClose={() => setActivePanel("chat")} />
                    </div>
                )}

                {/* Chat Area */}
                <div className={`flex flex-col h-full ${activePanel !== "chat" ? "hidden" : ""}`}>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {history.length === 0 && !error && (
                            <div className="text-center text-muted-foreground mt-10 text-sm">
                                <p>Welcome to Nexus AI.</p>
                                <p>How can I help you code today?</p>
                            </div>
                        )}

                        {history.map((msg, idx) => (
                            <div
                                key={msg.id || idx}
                                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                            >
                                <div
                                    className={`max-w-[85%] min-w-0 rounded-lg px-3 py-2 text-sm ${msg.role === 'user'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground'
                                        }`}
                                >
                                    <MessageRenderer content={msg.content} />
                                </div>
                                <span className="text-[10px] text-muted-foreground mt-1 opacity-50">
                                    {msg.role === 'user' ? 'You' : 'AI'}
                                </span>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex items-start">
                                <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground animate-pulse">
                                    Thinking...
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="p-3 text-sm text-red-500 bg-red-500/10 rounded border border-red-500/20 flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <AlertCircle size={16} />
                                    <span>{error}</span>
                                </div>
                                <button
                                    onClick={retryLastPrompt}
                                    className="self-end flex items-center gap-1 text-xs bg-red-500/20 hover:bg-red-500/30 px-2 py-1 rounded transition-colors"
                                >
                                    <RefreshCw size={12} />
                                    Retry
                                </button>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Proposals Area */}
                    {proposals.length > 0 && (
                        <ToolProposalList
                            proposals={proposals}
                            onApprove={(id) => { void approveProposal(id); }}
                            onReject={(id) => { void rejectProposal(id); }}
                            onViewDiff={setDiffProposal}
                        />
                    )}

                    {/* Input Area */}
                    <div className="p-4 border-t border-border">
                        <form onSubmit={handleSubmit} className="relative">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Ask SupaDev..."
                                className="w-full bg-input text-foreground rounded-md pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                                disabled={isLoading}
                            />
                            {isLoading ? (
                                <button
                                    type="button"
                                    onClick={cancelRequest}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-red-500 hover:text-red-600"
                                    title="Cancel request"
                                >
                                    <Square size={16} className="fill-current" />
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={!input.trim()}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-primary disabled:opacity-50"
                                >
                                    <Send size={16} />
                                </button>
                            )}
                        </form>
                    </div>
                </div>
            </div>

            {diffProposal && (
                <ProposalDiffViewer
                    path={getDiffPath(diffProposal)}
                    newContent={getDiffContent(diffProposal)}
                    onClose={() => setDiffProposal(null)}
                />
            )}
        </div>
    );
}
