import { useState, useEffect, useRef } from "react";
import { getLspClient } from "../lib/lsp";
import { Box, Package, FunctionSquare, Type, Variable, File } from "lucide-react";
import { cn } from "../lib/utils";

interface SymbolInformation {
    name: string;
    kind: number;
    location: {
        uri: string;
        range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
    };
    containerName?: string;
}

interface GoToSymbolModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (uri: string, line: number) => void;
    lspKey: string; // Current language key (LSP ID) to query symbols for
}

function getSymbolIcon(kind: number) {
    switch (kind) {
        case 1: return <File size={14} className="text-gray-400" />;
        case 2: return <Package size={14} className="text-blue-400" />;
        case 5: return <Type size={14} className="text-green-400" />;
        case 6: return <FunctionSquare size={14} className="text-purple-400" />;
        case 11: return <FunctionSquare size={14} className="text-purple-400" />;
        case 13: return <Variable size={14} className="text-blue-300" />;
        default: return <Box size={14} className="text-muted-foreground" />;
    }
}

export function GoToSymbolModal({ isOpen, onClose, onSelect, lspKey }: GoToSymbolModalProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SymbolInformation[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setQuery("");
            setResults([]);
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    useEffect(() => {
        const fetchSymbols = async () => {
            if (!query.trim() || !lspKey) {
                setResults([]);
                return;
            }

            try {
                const client = getLspClient(lspKey);
                const symbols = await client.sendRequest("workspace/symbol", { query }) as SymbolInformation[];
                if (Array.isArray(symbols)) {
                    setResults(symbols.slice(0, 20)); // Limit results
                }
            } catch (e) {
                console.error("Failed to fetch workspace symbols:", e);
            }
        };

        const handle = setTimeout(fetchSymbols, 300);
        return () => clearTimeout(handle);
    }, [query, lspKey]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (results[selectedIndex]) {
                const sym = results[selectedIndex];
                onSelect(sym.location.uri, sym.location.range.start.line + 1);
                onClose();
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-[500px] bg-popover border border-border rounded-lg shadow-xl flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-3 border-b border-border">
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Go to symbol..."
                        className="w-full bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
                    />
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                    {results.length === 0 && query && (
                        <div className="p-4 text-center text-xs text-muted-foreground">No symbols found</div>
                    )}
                    {results.map((sym, i) => (
                        <div
                            key={i}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 text-sm cursor-pointer",
                                i === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                            )}
                            onClick={() => {
                                onSelect(sym.location.uri, sym.location.range.start.line + 1);
                                onClose();
                            }}
                        >
                            {getSymbolIcon(sym.kind)}
                            <div className="flex flex-col min-w-0 flex-1">
                                <span className="truncate font-medium">{sym.name}</span>
                                {sym.containerName && (
                                    <span className="text-xs text-muted-foreground truncate">{sym.containerName}</span>
                                )}
                            </div>
                            <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                                {sym.location.uri.split('/').pop()}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
