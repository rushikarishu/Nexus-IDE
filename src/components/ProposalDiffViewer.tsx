import { useEffect, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { getMonacoLanguage } from '../lib/languageConfig';

interface ProposalDiffViewerProps {
    path: string;
    newContent: string;
    onClose: () => void;
}

export function ProposalDiffViewer({ path, newContent, onClose }: ProposalDiffViewerProps) {
    const [original, setOriginal] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadOriginal() {
            setIsLoading(true);
            setError(null);
            try {
                const content = await invoke<string>('read_file', { path });
                if (!cancelled) {
                    setOriginal(content);
                }
            } catch (e) {
                if (!cancelled) {
                    // If file doesn't exist (e.g. new file), treat as empty
                    const msg = String(e);
                    if (msg.includes("No such file") || msg.includes("not found")) {
                        setOriginal('');
                    } else {
                        setError(msg);
                    }
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        if (path) {
            void loadOriginal();
        } else {
            setIsLoading(false);
        }

        return () => {
            cancelled = true;
        };
    }, [path]);

    const language = getMonacoLanguage(path);

    return (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur flex items-center justify-center">
            <div className="w-[80vw] h-[70vh] bg-card border border-border rounded-lg shadow-lg flex flex-col">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                    <span className="text-sm font-medium truncate">Proposed changes: {path || 'Unknown file'}</span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 text-muted-foreground hover:text-foreground"
                    >
                        <X size={16} />
                    </button>
                </div>

                {error ? (
                    <div className="p-4 text-sm text-red-500">
                        Failed to load original file: {error}
                    </div>
                ) : (
                    <div className="relative flex-1">
                        <DiffEditor
                            original={original}
                            modified={newContent}
                            language={language}
                            theme="nexus-dark"
                            options={{
                                readOnly: true,
                                renderSideBySide: true,
                                automaticLayout: true,
                            }}
                        />

                        {isLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
                                Loading diff...
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
