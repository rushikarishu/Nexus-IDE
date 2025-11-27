import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, File, ChevronsLeft, Replace, ArrowRight } from "lucide-react";
import { SearchResult } from "../types/search";

interface SearchPanelProps {
    path: string;
    onFileSelect: (path: string, line?: number) => void;
    onClose?: () => void;
}

export function SearchPanel({ path, onFileSelect, onClose }: SearchPanelProps) {
    const [query, setQuery] = useState("");
    const [replaceQuery, setReplaceQuery] = useState("");
    const [showReplace, setShowReplace] = useState(false);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const performSearch = useCallback(async (value: string) => {
        const trimmed = value.trim();

        if (!trimmed) {
            setResults([]);
            setError(null);
            setLoading(false);
            return;
        }

        if (!path) {
            setError("No workspace opened");
            setResults([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const files = await invoke<SearchResult[]>("search_text", {
                query: trimmed,
                path,
                caseSensitive
            });
            setResults(files);
        } catch (err) {
            console.error("Search failed:", err);
            setError(String(err));
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [path, caseSensitive]);

    const handleReplaceAll = async () => {
        if (!query || !replaceQuery || results.length === 0) return;

        // Get unique files
        const files = Array.from(new Set(results.map(r => r.file)));

        if (!confirm(`Replace "${query}" with "${replaceQuery}" in ${files.length} files?`)) {
            return;
        }

        try {
            const count = await invoke<number>("replace_text", {
                files,
                query,
                replacement: replaceQuery,
                caseSensitive
            });
            alert(`Replaced ${count} files.`);
            performSearch(query); // Refresh
        } catch (err) {
            alert(`Replace failed: ${err}`);
        }
    };

    // Live, debounced search
    useEffect(() => {
        const handle = window.setTimeout(() => {
            void performSearch(query);
        }, 250);

        return () => window.clearTimeout(handle);
    }, [query, performSearch]);

    // Group results by file
    const groupedResults = results.reduce((acc, result) => {
        if (!acc[result.file]) acc[result.file] = [];
        acc[result.file].push(result);
        return acc;
    }, {} as Record<string, SearchResult[]>);

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b border-border flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search..."
                            className="w-full bg-muted/50 border border-input rounded px-3 py-1.5 pl-8 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            autoFocus
                        />
                        <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
                    </div>
                    <button
                        onClick={() => setShowReplace(!showReplace)}
                        className={`p-1.5 rounded transition-colors ${showReplace ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        title="Toggle Replace"
                    >
                        <Replace size={16} />
                    </button>
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

                {showReplace && (
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={replaceQuery}
                                onChange={(e) => setReplaceQuery(e.target.value)}
                                placeholder="Replace with..."
                                className="w-full bg-muted/50 border border-input rounded px-3 py-1.5 pl-8 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <ArrowRight size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
                        </div>
                        <button
                            onClick={handleReplaceAll}
                            className="px-2 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 rounded text-xs whitespace-nowrap"
                        >
                            Replace All
                        </button>
                    </div>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <label className="flex items-center gap-1 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={caseSensitive}
                            onChange={(e) => setCaseSensitive(e.target.checked)}
                            className="rounded border-muted"
                        />
                        Case Sensitive
                    </label>
                    <span className="ml-auto">{results.length} results</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                {loading && <div className="text-center text-xs text-muted-foreground py-4">Searching...</div>}

                {error && (
                    <div className="p-2 text-xs text-red-500 bg-red-500/10 rounded border border-red-500/20 mb-2">
                        Error: {error}
                    </div>
                )}

                {!loading && !error && results.length === 0 && query && (
                    <div className="text-center text-xs text-muted-foreground py-4">No results found</div>
                )}

                {Object.entries(groupedResults).map(([file, fileResults]) => (
                    <div key={file} className="mb-2">
                        <div className="flex items-center gap-2 px-2 py-1 bg-muted/30 rounded text-xs font-medium text-muted-foreground sticky top-0 backdrop-blur-sm">
                            <File size={12} />
                            <span className="truncate" title={file}>{file.split(/[/\\]/).pop()}</span>
                            <span className="opacity-50 text-[10px] ml-auto">{fileResults.length}</span>
                        </div>
                        <div>
                            {fileResults.map((result, idx) => (
                                <div
                                    key={`${file}-${result.line_number}-${idx}`}
                                    className="flex items-start gap-2 px-2 py-1 hover:bg-accent/50 cursor-pointer group text-xs font-mono"
                                    onClick={() => onFileSelect(result.file, result.line_number)}
                                >
                                    <span className="text-muted-foreground w-8 text-right shrink-0 select-none">{result.line_number}</span>
                                    <span className="truncate text-foreground/80 group-hover:text-foreground">
                                        {result.line_content}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
