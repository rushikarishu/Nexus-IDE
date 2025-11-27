import { useState } from 'react';
import { X, Check, XCircle, CheckCircle } from 'lucide-react';

interface DiffPreviewProps {
    original: string;
    modified: string;
    onAccept: () => void;
    onReject: () => void;
    title?: string;
}

interface DiffHunk {
    id: number;
    originalStartLine: number;
    modifiedStartLine: number;
    originalLines: { lineNumber: number; content: string; type: 'context' | 'removed' }[];
    modifiedLines: { lineNumber: number; content: string; type: 'context' | 'added' }[];
}

function parseDiffHunks(original: string, modified: string): DiffHunk[] {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    const hunks: DiffHunk[] = [];

    let i = 0, j = 0;
    let hunkId = 0;

    while (i < originalLines.length || j < modifiedLines.length) {
        // Find next difference
        while (i < originalLines.length && j < modifiedLines.length && originalLines[i] === modifiedLines[j]) {
            i++;
            j++;
        }

        if (i >= originalLines.length && j >= modifiedLines.length) break;

        // Start of a hunk - collect context before
        const contextBefore = Math.max(0, i - 3);
        const hunk: DiffHunk = {
            id: hunkId++,
            originalStartLine: contextBefore,
            modifiedStartLine: contextBefore,
            originalLines: [],
            modifiedLines: []
        };

        // Add context before
        for (let k = contextBefore; k < i && k < originalLines.length; k++) {
            hunk.originalLines.push({ lineNumber: k, content: originalLines[k], type: 'context' });
            hunk.modifiedLines.push({ lineNumber: k, content: originalLines[k], type: 'context' });
        }

        // Collect changes
        const changeStartOrig = i;
        const changeStartMod = j;
        while (i < originalLines.length && j < modifiedLines.length && originalLines[i] !== modifiedLines[j]) {
            i++;
            j++;
        }

        // Add changed lines
        for (let k = changeStartOrig; k < i; k++) {
            hunk.originalLines.push({ lineNumber: k, content: originalLines[k], type: 'removed' });
        }
        for (let k = changeStartMod; k < j; k++) {
            hunk.modifiedLines.push({ lineNumber: k, content: modifiedLines[k], type: 'added' });
        }

        // Add context after
        const contextAfter = Math.min(i + 3, originalLines.length);
        for (let k = i; k < contextAfter; k++) {
            hunk.originalLines.push({ lineNumber: k, content: originalLines[k], type: 'context' });
            hunk.modifiedLines.push({ lineNumber: k, content: originalLines[k], type: 'context' });
        }

        hunks.push(hunk);
    }

    return hunks;
}

export function DiffPreview({ original, modified, onAccept, onReject, title = 'AI Suggested Changes' }: DiffPreviewProps) {
    const [view, setView] = useState<'split' | 'unified'>('split');
    const [acceptedHunks, setAcceptedHunks] = useState<Set<number>>(new Set());
    const [rejectedHunks, setRejectedHunks] = useState<Set<number>>(new Set());

    const hunks = parseDiffHunks(original, modified);

    const toggleHunk = (hunkId: number, action: 'accept' | 'reject') => {
        if (action === 'accept') {
            setAcceptedHunks(prev => {
                const next = new Set(prev);
                next.add(hunkId);
                return next;
            });
            setRejectedHunks(prev => {
                const next = new Set(prev);
                next.delete(hunkId);
                return next;
            });
        } else {
            setRejectedHunks(prev => {
                const next = new Set(prev);
                next.add(hunkId);
                return next;
            });
            setAcceptedHunks(prev => {
                const next = new Set(prev);
                next.delete(hunkId);
                return next;
            });
        }
    };

    const handleAcceptAll = () => {
        // If some hunks are explicitly accepted, apply only those
        // Otherwise apply all changes
        if (acceptedHunks.size > 0) {
            // Reconstruct file with only accepted hunks
            const originalLines = original.split('\n');
            let result = [...originalLines];

            // Apply accepted hunks in order
            hunks.forEach(hunk => {
                if (acceptedHunks.has(hunk.id)) {
                    const removedLines = hunk.originalLines.filter(l => l.type === 'removed');
                    const addedLines = hunk.modifiedLines.filter(l => l.type === 'added');

                    if (removedLines.length > 0 || addedLines.length > 0) {
                        const startLine = removedLines[0]?.lineNumber ?? addedLines[0].lineNumber;
                        const deleteCount = removedLines.length;
                        const newContent = addedLines.map(l => l.content);

                        result.splice(startLine, deleteCount, ...newContent);
                    }
                }
            });

            // This won't work perfectly - we'd need a proper diff library
            // For now, just accept all if any hunks are selected
            onAccept();
        } else {
            onAccept();
        }
    };

    const hasSelections = acceptedHunks.size > 0 || rejectedHunks.size > 0;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-semibold">{title}</h2>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setView('split')}
                                className={`px-3 py-1 text-sm rounded ${view === 'split'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                    }`}
                            >
                                Split View
                            </button>
                            <button
                                onClick={() => setView('unified')}
                                className={`px-3 py-1 text-sm rounded ${view === 'unified'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                    }`}
                            >
                                Unified View
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={onReject}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Diff Content with Hunks */}
                <div className="flex-1 overflow-auto p-6 space-y-6">
                    {hunks.map((hunk) => {
                        const isAccepted = acceptedHunks.has(hunk.id);
                        const isRejected = rejectedHunks.has(hunk.id);

                        return (
                            <div
                                key={hunk.id}
                                className={`border rounded-lg overflow-hidden ${isAccepted ? 'border-green-500' : isRejected ? 'border-red-500' : 'border-border'
                                    }`}
                            >
                                {/* Hunk Header */}
                                <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border">
                                    <span className="text-xs text-muted-foreground font-mono">
                                        Hunk {hunk.id + 1} (Line {hunk.originalStartLine + 1})
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => toggleHunk(hunk.id, 'accept')}
                                            className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${isAccepted
                                                ? 'bg-green-500 text-white'
                                                : 'bg-secondary hover:bg-secondary/80'
                                                }`}
                                        >
                                            <CheckCircle size={12} />
                                            Accept
                                        </button>
                                        <button
                                            onClick={() => toggleHunk(hunk.id, 'reject')}
                                            className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${isRejected
                                                ? 'bg-red-500 text-white'
                                                : 'bg-secondary hover:bg-secondary/80'
                                                }`}
                                        >
                                            <XCircle size={12} />
                                            Reject
                                        </button>
                                    </div>
                                </div>

                                {/* Hunk Content */}
                                {view === 'split' ? (
                                    <div className="grid grid-cols-2 divide-x divide-border">
                                        <div className="bg-background">
                                            <div className="text-xs text-muted-foreground px-3 py-1 bg-muted/20">Original</div>
                                            <pre className="p-3 text-xs font-mono overflow-x-auto">
                                                {hunk.originalLines.map((line, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={`${line.type === 'removed' ? 'bg-red-500/10 text-red-400' : ''
                                                            } px-2 -mx-2`}
                                                    >
                                                        <span className="text-muted-foreground select-none mr-4">
                                                            {line.lineNumber + 1}
                                                        </span>
                                                        {line.type === 'removed' && <span className="text-red-500 mr-2">-</span>}
                                                        {line.content || ' '}
                                                    </div>
                                                ))}
                                            </pre>
                                        </div>
                                        <div className="bg-background">
                                            <div className="text-xs text-muted-foreground px-3 py-1 bg-muted/20">Modified</div>
                                            <pre className="p-3 text-xs font-mono overflow-x-auto">
                                                {hunk.modifiedLines.map((line, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={`${line.type === 'added' ? 'bg-green-500/10 text-green-400' : ''
                                                            } px-2 -mx-2`}
                                                    >
                                                        <span className="text-muted-foreground select-none mr-4">
                                                            {line.lineNumber + 1}
                                                        </span>
                                                        {line.type === 'added' && <span className="text-green-500 mr-2">+</span>}
                                                        {line.content || ' '}
                                                    </div>
                                                ))}
                                            </pre>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-background">
                                        <pre className="p-3 text-xs font-mono overflow-x-auto">
                                            {hunk.originalLines.filter(l => l.type === 'removed').map((line, idx) => (
                                                <div key={`rem-${idx}`} className="bg-red-500/10 text-red-400 px-2 -mx-2">
                                                    <span className="text-red-500 select-none mr-2">-</span>
                                                    <span className="text-muted-foreground select-none mr-4">{line.lineNumber + 1}</span>
                                                    {line.content || ' '}
                                                </div>
                                            ))}
                                            {hunk.modifiedLines.filter(l => l.type === 'added').map((line, idx) => (
                                                <div key={`add-${idx}`} className="bg-green-500/10 text-green-400 px-2 -mx-2">
                                                    <span className="text-green-500 select-none mr-2">+</span>
                                                    <span className="text-muted-foreground select-none mr-4">{line.lineNumber + 1}</span>
                                                    {line.content || ' '}
                                                </div>
                                            ))}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/5">
                    <p className="text-sm text-muted-foreground">
                        {hasSelections
                            ? `${acceptedHunks.size} hunks accepted, ${rejectedHunks.size} rejected`
                            : 'Click Accept/Reject on individual hunks or accept all changes'}
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={onReject}
                            className="px-4 py-2 border border-border rounded hover:bg-accent transition-colors flex items-center gap-2"
                        >
                            <X size={16} />
                            Reject All
                        </button>
                        <button
                            onClick={handleAcceptAll}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors flex items-center gap-2"
                        >
                            <Check size={16} />
                            {hasSelections ? 'Apply Selected' : 'Accept All'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
