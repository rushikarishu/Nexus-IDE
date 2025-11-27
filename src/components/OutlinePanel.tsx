import { useState, useEffect } from "react";
import { getLspClient } from "../lib/lsp";
import { Box, Package, FunctionSquare, Type, Variable } from "lucide-react";

interface DocumentSymbol {
    name: string;
    kind: number;
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    selectionRange: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    children?: DocumentSymbol[];
}

interface OutlinePanelProps {
    filePath: string;
    monacoLanguage: string;
    lspKey: string | null;
    onSelect: (line: number) => void;
}

function getSymbolIcon(kind: number) {
    switch (kind) {
        case 1: return <File size={14} className="text-gray-400" />; // File
        case 2: return <Package size={14} className="text-blue-400" />; // Module
        case 3: return <Package size={14} className="text-blue-400" />; // Namespace
        case 4: return <Package size={14} className="text-blue-400" />; // Package
        case 5: return <Type size={14} className="text-green-400" />; // Class
        case 6: return <FunctionSquare size={14} className="text-purple-400" />; // Method
        case 11: return <FunctionSquare size={14} className="text-purple-400" />; // Function
        case 13: return <Variable size={14} className="text-blue-300" />; // Variable
        case 14: return <Variable size={14} className="text-blue-300" />; // Constant
        case 23: return <Type size={14} className="text-yellow-400" />; // Struct
        default: return <Box size={14} className="text-muted-foreground" />;
    }
}

import { File } from "lucide-react";

function SymbolNode({ symbol, onSelect, level = 0 }: { symbol: DocumentSymbol, onSelect: (line: number) => void, level?: number }) {
    return (
        <div>
            <div
                className="flex items-center gap-2 py-1 px-2 hover:bg-accent/50 cursor-pointer text-sm rounded-sm"
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                onClick={() => onSelect(symbol.selectionRange.start.line + 1)}
            >
                {getSymbolIcon(symbol.kind)}
                <span className="truncate">{symbol.name}</span>
            </div>
            {symbol.children?.map((child, i) => (
                <SymbolNode key={i} symbol={child} onSelect={onSelect} level={level + 1} />
            ))}
        </div>
    );
}

export function OutlinePanel({ filePath, lspKey, onSelect }: OutlinePanelProps) {
    const [symbols, setSymbols] = useState<DocumentSymbol[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!filePath || !lspKey) {
            setSymbols([]);
            return;
        }

        const fetchSymbols = async () => {
            setLoading(true);
            try {
                const client = getLspClient(lspKey);
                // Note: This assumes the LSP server is running and the file is open
                // In a real implementation, we might need to ensure the document is opened in LSP first
                const result = await client.sendRequest("textDocument/documentSymbol", {
                    textDocument: { uri: `file://${filePath}` }
                }) as DocumentSymbol[];

                if (Array.isArray(result)) {
                    setSymbols(result);
                } else {
                    setSymbols([]);
                }
            } catch (e) {
                console.error("Failed to fetch symbols:", e);
                setSymbols([]);
            }
            setLoading(false);
        };

        fetchSymbols();
    }, [filePath, lspKey]);

    if (!filePath) {
        return <div className="p-4 text-sm text-muted-foreground text-center">No file open</div>;
    }

    if (loading) {
        return <div className="p-4 text-sm text-muted-foreground text-center">Loading symbols...</div>;
    }

    if (symbols.length === 0) {
        return <div className="p-4 text-sm text-muted-foreground text-center">No symbols found</div>;
    }

    return (
        <div className="flex flex-col h-full overflow-y-auto py-2">
            {symbols.map((symbol, i) => (
                <SymbolNode key={i} symbol={symbol} onSelect={onSelect} />
            ))}
        </div>
    );
}
