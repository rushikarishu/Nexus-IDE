import { useState, useEffect, useCallback } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export interface PeekLocation {
    uri: string;
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

interface PeekViewProps {
    locations: PeekLocation[];
    title: string;
    onClose: () => void;
    onJumpTo: (uri: string, line: number, column: number) => void;
    position: { top: number; left: number };
}

interface LocationPreview {
    location: PeekLocation;
    fileName: string;
    preview: string;
    lineNumber: number;
}

const CONTEXT_LINES = 3;

export function PeekView({ locations, title, onClose, onJumpTo, position }: PeekViewProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [previews, setPreviews] = useState<LocationPreview[]>([]);

    useEffect(() => {
        const loadPreviews = async () => {
            const results: LocationPreview[] = [];

            for (const loc of locations) {
                const filePath = loc.uri.replace('file://', '');
                const fileName = filePath.split('/').pop() || filePath;
                const lineNumber = loc.range.start.line + 1; // Convert to 1-indexed

                try {
                    // Read file content
                    const content = await invoke<string>('read_file', { path: filePath });
                    const lines = content.split('\n');

                    // Extract preview with context
                    const startLine = Math.max(0, loc.range.start.line - CONTEXT_LINES);
                    const endLine = Math.min(lines.length - 1, loc.range.start.line + CONTEXT_LINES);

                    const previewLines = lines.slice(startLine, endLine + 1);
                    const preview = previewLines.join('\n');

                    results.push({
                        location: loc,
                        fileName,
                        preview,
                        lineNumber,
                    });
                } catch (e) {
                    console.error('Failed to load preview for', filePath, e);
                    results.push({
                        location: loc,
                        fileName,
                        preview: '// Failed to load preview',
                        lineNumber,
                    });
                }
            }

            setPreviews(results);
        };

        void loadPreviews();
    }, [locations]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, locations.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const preview = previews[selectedIndex];
            if (preview) {
                const filePath = preview.location.uri.replace('file://', '');
                onJumpTo(
                    filePath,
                    preview.location.range.start.line + 1,
                    preview.location.range.start.character + 1
                );
                onClose();
            }
        }
    }, [locations.length, previews, selectedIndex, onJumpTo, onClose]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const handleLocationClick = (index: number) => {
        const preview = previews[index];
        if (preview) {
            const filePath = preview.location.uri.replace('file://', '');
            onJumpTo(
                filePath,
                preview.location.range.start.line + 1,
                preview.location.range.start.character + 1
            );
            onClose();
        }
    };

    if (locations.length === 0) return null;

    return (
        <div
            className="absolute z-50 bg-popover border border-border rounded-lg shadow-2xl overflow-hidden"
            style={{
                top: position.top,
                left: position.left,
                width: '600px',
                maxHeight: '400px',
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{title}</span>
                    <span className="text-xs text-muted-foreground">
                        {locations.length} {locations.length === 1 ? 'result' : 'results'}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
                    title="Close (Esc)"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Location List */}
            <div className="flex h-[300px]">
                {/* Sidebar with location list */}
                <div className="w-[250px] border-r border-border overflow-y-auto">
                    {previews.map((preview, index) => (
                        <div
                            key={index}
                            className={`px-3 py-2 cursor-pointer border-b border-border/50 hover:bg-accent/50 ${index === selectedIndex ? 'bg-accent text-accent-foreground' : ''
                                }`}
                            onClick={() => handleLocationClick(index)}
                        >
                            <div className="text-xs font-medium truncate">{preview.fileName}</div>
                            <div className="text-xs text-muted-foreground">
                                Line {preview.lineNumber}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Code Preview */}
                <div className="flex-1 overflow-auto bg-card">
                    {previews[selectedIndex] && (
                        <div className="p-4">
                            <div className="text-xs text-muted-foreground mb-2">
                                {previews[selectedIndex].fileName} : Line {previews[selectedIndex].lineNumber}
                            </div>
                            <pre className="text-xs font-mono overflow-x-auto">
                                <code className="text-foreground">{previews[selectedIndex].preview}</code>
                            </pre>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer with keyboard hints */}
            <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                        <ChevronUp size={12} />
                        <ChevronDown size={12} />
                        <span>Navigate</span>
                    </span>
                    <span>Enter to open</span>
                    <span>Esc to close</span>
                </div>
            </div>
        </div>
    );
}
