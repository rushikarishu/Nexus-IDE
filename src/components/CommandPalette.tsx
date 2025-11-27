import { useState, useEffect, useRef, useCallback } from 'react';
import { Command, Search, X } from 'lucide-react';
import { CommandPaletteItem } from '../types/commands';
import { cn } from '../lib/utils';

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    items: CommandPaletteItem[];
    onSelect: (id: string) => void;
}

export function CommandPalette({ isOpen, onClose, items, onSelect }: CommandPaletteProps) {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Filter items based on query
    const filteredItems = query.trim()
        ? items.filter(item => {
            const searchText = `${item.label} ${item.description || ''} ${item.category || ''}`.toLowerCase();
            const lowerQuery = query.toLowerCase();
            let queryIndex = 0;
            for (let i = 0; i < searchText.length && queryIndex < lowerQuery.length; i++) {
                if (searchText[i] === lowerQuery[queryIndex]) {
                    queryIndex++;
                }
            }
            return queryIndex === lowerQuery.length;
        })
        : items;

    // Reset selected index when filtered items change
    useEffect(() => {
        setSelectedIndex(0);
    }, [filteredItems.length]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            inputRef.current?.focus();
            setQuery('');
        }
    }, [isOpen]);

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current) {
            const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
            selectedElement?.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIndex]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 1, filteredItems.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredItems[selectedIndex]) {
                    onSelect(filteredItems[selectedIndex].id);
                    onClose();
                }
                break;
            case 'Escape':
                e.preventDefault();
                onClose();
                break;
        }
    }, [filteredItems, selectedIndex, onSelect, onClose]);

    const handleItemClick = useCallback((id: string) => {
        onSelect(id);
        onClose();
    }, [onSelect, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50"
            onClick={onClose}
        >
            <div
                className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Search Input */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                    <Search size={18} className="text-muted-foreground" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a command or search..."
                        className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                    />
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-accent rounded transition-colors"
                        title="Close (Esc)"
                    >
                        <X size={16} className="text-muted-foreground" />
                    </button>
                </div>

                {/* Command List */}
                <div
                    ref={listRef}
                    className="max-h-[60vh] overflow-y-auto"
                >
                    {filteredItems.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No commands found
                        </div>
                    ) : (
                        filteredItems.map((item, index) => (
                            <button
                                key={item.id}
                                onClick={() => handleItemClick(item.id)}
                                className={cn(
                                    "w-full flex items-center justify-between gap-4 px-4 py-2.5 text-left transition-colors",
                                    index === selectedIndex
                                        ? "bg-accent text-accent-foreground"
                                        : "hover:bg-accent/50"
                                )}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        {item.category && (
                                            <span className="text-xs text-muted-foreground font-mono">
                                                {item.category}
                                            </span>
                                        )}
                                        <span className="text-sm font-medium truncate">{item.label}</span>
                                    </div>
                                    {item.description && (
                                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                            {item.description}
                                        </div>
                                    )}
                                </div>
                                {item.keybinding && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                                        {item.keybinding.split('+').map((key, i) => (
                                            <span key={i}>
                                                {i > 0 && <span className="mx-0.5">+</span>}
                                                <kbd>{key}</kbd>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </button>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                            <Command size={12} /> to open
                        </span>
                        <span>↑↓ to navigate</span>
                        <span>↵ to select</span>
                    </div>
                    <span>esc to close</span>
                </div>
            </div>
        </div>
    );
}
