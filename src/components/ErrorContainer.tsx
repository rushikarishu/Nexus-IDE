import { useState, useMemo } from "react";
import { AlertCircle, AlertTriangle, Info, Lightbulb, X } from "lucide-react";
import type { Diagnostic, FileDiagnostics } from "../lib/diagnostics";
import {
    getDiagnosticSeverityLabel,
    getDiagnosticSeverityColor,
    uriToPath,
    getFileName,
    getRelativePath,
    DiagnosticSeverity,
} from "../lib/diagnostics";
import { cn } from "../lib/utils";

interface ErrorContainerProps {
    activeFile: string | null;
    workspaceRoot: string;
    diagnostics: FileDiagnostics[];
    visible: boolean;
    onSelectLocation: (path: string, line: number, character: number) => void;
    onClose?: () => void;
}

type TabType = "current" | "all";

function getSeverityIcon(severity: number | undefined) {
    switch (severity) {
        case DiagnosticSeverity.Error:
            return <AlertCircle className="w-4 h-4" />;
        case DiagnosticSeverity.Warning:
            return <AlertTriangle className="w-4 h-4" />;
        case DiagnosticSeverity.Info:
            return <Info className="w-4 h-4" />;
        case DiagnosticSeverity.Hint:
            return <Lightbulb className="w-4 h-4" />;
        default:
            return <div className="w-4 h-4" />;
    }
}

export function ErrorContainer({
    activeFile,
    workspaceRoot,
    diagnostics,
    visible,
    onSelectLocation,
    onClose,
}: ErrorContainerProps) {
    const [activeTab, setActiveTab] = useState<TabType>("current");

    // Filter diagnostics for current file
    const currentFileDiagnostics = useMemo(() => {
        if (!activeFile) return [];

        const activeFileUri = activeFile.startsWith("file://")
            ? activeFile
            : `file://${activeFile}`;

        const fileDiag = diagnostics.find(d => d.uri === activeFileUri);
        if (!fileDiag) return [];

        // Sort by line, then character
        return [...fileDiag.diagnostics].sort((a, b) => {
            if (a.range.start.line !== b.range.start.line) {
                return a.range.start.line - b.range.start.line;
            }
            return a.range.start.character - b.range.start.character;
        });
    }, [activeFile, diagnostics]);

    // All diagnostics grouped and sorted
    const allDiagnostics = useMemo(() => {
        const result: Array<{ file: FileDiagnostics; diagnostic: Diagnostic }> = [];

        diagnostics.forEach((fileDiag) => {
            fileDiag.diagnostics.forEach((diag) => {
                result.push({ file: fileDiag, diagnostic: diag });
            });
        });

        // Sort by severity (errors first), then by file, then by line
        return result.sort((a, b) => {
            // Severity: 1=Error (highest priority)
            const sevA = a.diagnostic.severity || 4;
            const sevB = b.diagnostic.severity || 4;
            if (sevA !== sevB) return sevA - sevB;

            // File path
            if (a.file.uri !== b.file.uri) {
                return a.file.uri.localeCompare(b.file.uri);
            }

            // Line number
            if (a.diagnostic.range.start.line !== b.diagnostic.range.start.line) {
                return a.diagnostic.range.start.line - b.diagnostic.range.start.line;
            }

            // Character
            return a.diagnostic.range.start.character - b.diagnostic.range.start.character;
        });
    }, [diagnostics]);

    const handleDiagnosticClick = (uri: string, diagnostic: Diagnostic) => {
        const path = uriToPath(uri);
        // LSP uses 0-based positions, editor uses 1-based
        onSelectLocation(path, diagnostic.range.start.line + 1, diagnostic.range.start.character + 1);
    };

    if (!visible) return null;

    const currentFileCount = currentFileDiagnostics.length;
    const allCount = allDiagnostics.length;

    return (
        <div className="h-64 glass border-t border-border flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
                <div className="flex items-center gap-4">
                    <h3 className="text-sm font-semibold text-foreground">Problems</h3>

                    {/* Tabs */}
                    <div className="flex items-center gap-2">
                        <button
                            className={cn(
                                "px-3 py-1 text-xs rounded transition-colors",
                                activeTab === "current"
                                    ? "bg-accent text-foreground"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                            )}
                            onClick={() => setActiveTab("current")}
                        >
                            Current File ({currentFileCount})
                        </button>
                        <button
                            className={cn(
                                "px-3 py-1 text-xs rounded transition-colors",
                                activeTab === "all"
                                    ? "bg-accent text-foreground"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                            )}
                            onClick={() => setActiveTab("all")}
                        >
                            All Files ({allCount})
                        </button>
                    </div>
                </div>

                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Close Problems"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === "current" ? (
                    currentFileCount === 0 ? (
                        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                            {activeFile ? "No problems in this file" : "No file open"}
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {currentFileDiagnostics.map((diagnostic, index) => (
                                <DiagnosticRow
                                    key={index}
                                    diagnostic={diagnostic}
                                    showFile={false}
                                    onClick={() => activeFile && handleDiagnosticClick(activeFile, diagnostic)}
                                />
                            ))}
                        </div>
                    )
                ) : allCount === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                        No problems detected
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {allDiagnostics.map(({ file, diagnostic }, index) => (
                            <DiagnosticRow
                                key={index}
                                diagnostic={diagnostic}
                                showFile={true}
                                filePath={uriToPath(file.uri)}
                                workspaceRoot={workspaceRoot}
                                onClick={() => handleDiagnosticClick(file.uri, diagnostic)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div >
    );
}

interface DiagnosticRowProps {
    diagnostic: Diagnostic;
    showFile: boolean;
    filePath?: string;
    workspaceRoot?: string;
    onClick: () => void;
}

function DiagnosticRow({ diagnostic, showFile, filePath, workspaceRoot, onClick }: DiagnosticRowProps) {
    const severityColor = getDiagnosticSeverityColor(diagnostic.severity);
    const severityLabel = getDiagnosticSeverityLabel(diagnostic.severity);

    // Display using 1-based line numbers (LSP uses 0-based)
    const displayLine = diagnostic.range.start.line + 1;
    const displayCol = diagnostic.range.start.character + 1;

    return (
        <div
            className="px-4 py-2 hover:bg-accent/30 cursor-pointer transition-colors"
            onClick={onClick}
        >
            <div className="flex items-start gap-2">
                {/* Severity Icon */}
                <div className={cn("mt-0.5", severityColor)}>
                    {getSeverityIcon(diagnostic.severity)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                        {/* Message */}
                        <span className="text-sm text-foreground break-words">
                            {diagnostic.message}
                        </span>

                        {/* Source/Code */}
                        {(diagnostic.source || diagnostic.code) && (
                            <span className="text-xs text-muted-foreground shrink-0">
                                [{diagnostic.source || ""}{diagnostic.code ? ` ${diagnostic.code}` : ""}]
                            </span>
                        )}
                    </div>

                    {/* File and Location */}
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {showFile && filePath && (
                            <>
                                <span className="font-mono">
                                    {workspaceRoot
                                        ? getRelativePath(filePath, workspaceRoot)
                                        : getFileName(filePath)}
                                </span>
                                <span>•</span>
                            </>
                        )}
                        <span className="font-mono">
                            {displayLine}:{displayCol}
                        </span>
                        <span>•</span>
                        <span>{severityLabel}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
