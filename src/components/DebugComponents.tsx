import { useState } from 'react';
import { ChevronRight, ChevronDown, Eye, EyeOff, Plus, X } from 'lucide-react';

interface Variable {
    name: string;
    value: string;
    type?: string;
    variablesReference?: number;
}

interface VariableViewerProps {
    variables: Variable[];
    onExpand?: (variablesRef: number) => void;
}

export function VariableViewer({ variables, onExpand }: VariableViewerProps) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const toggleExpand = (name: string, variablesRef?: number) => {
        const newExpanded = new Set(expanded);
        if (expanded.has(name)) {
            newExpanded.delete(name);
        } else {
            newExpanded.add(name);
            if (variablesRef && variablesRef > 0 && onExpand) {
                onExpand(variablesRef);
            }
        }
        setExpanded(newExpanded);
    };

    if (variables.length === 0) {
        return (
            <div className="text-xs text-muted-foreground italic p-2">
                No variables in current scope
            </div>
        );
    }

    return (
        <div className="flex flex-col">
            {variables.map((variable, index) => (
                <VariableItem
                    key={`${variable.name}-${index}`}
                    variable={variable}
                    isExpanded={expanded.has(variable.name)}
                    onToggle={() => toggleExpand(variable.name, variable.variablesReference)}
                />
            ))}
        </div>
    );
}

interface VariableItemProps {
    variable: Variable;
    isExpanded: boolean;
    onToggle: () => void;
    level?: number;
}

function VariableItem({ variable, isExpanded, onToggle, level = 0 }: VariableItemProps) {
    const hasChildren = variable.variablesReference && variable.variablesReference > 0;
    const indent = level * 12;

    return (
        <div className="hover:bg-accent/50 transition-colors">
            <div
                className="flex items-center gap-1 px-2 py-1 cursor-pointer"
                style={{ paddingLeft: `${indent + 8}px` }}
                onClick={hasChildren ? onToggle : undefined}
            >
                {hasChildren ? (
                    <div className="w-4 h-4 flex items-center justify-center">
                        {isExpanded ? (
                            <ChevronDown size={12} className="text-muted-foreground" />
                        ) : (
                            <ChevronRight size={12} className="text-muted-foreground" />
                        )}
                    </div>
                ) : (
                    <div className="w-4" />
                )}
                <span className="text-xs font-mono text-blue-400 font-medium">
                    {variable.name}
                </span>
                <span className="text-xs text-muted-foreground">:</span>
                <span className="text-xs font-mono text-orange-300">
                    {variable.value}
                </span>
                {variable.type && (
                    <span className="text-xs text-muted-foreground italic ml-1">
                        ({variable.type})
                    </span>
                )}
            </div>
        </div>
    );
}

interface WatchExpression {
    id: string;
    expression: string;
    value?: string;
    error?: string;
}

interface WatchPanelProps {
    watches: WatchExpression[];
    onAdd: (expression: string) => void;
    onRemove: (id: string) => void;
    onEvaluate: (expression: string) => Promise<string>;
}

export function WatchPanel({ watches, onAdd, onRemove }: WatchPanelProps) {
    const [newExpression, setNewExpression] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const handleAdd = () => {
        if (newExpression.trim()) {
            onAdd(newExpression.trim());
            setNewExpression('');
            setIsAdding(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-2 border-b border-border">
                <h3 className="text-xs font-semibold text-muted-foreground">Watch</h3>
                <button
                    onClick={() => setIsAdding(true)}
                    className="p-1 hover:bg-accent rounded transition-colors"
                    title="Add expression"
                >
                    <Plus size={14} />
                </button>
            </div>

            <div className="flex-1 overflow-auto">
                {isAdding && (
                    <div className="flex items-center gap-1 p-2 bg-accent/20 border-b border-border">
                        <input
                            type="text"
                            value={newExpression}
                            onChange={(e) => setNewExpression(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAdd();
                                if (e.key === 'Escape') {
                                    setIsAdding(false);
                                    setNewExpression('');
                                }
                            }}
                            placeholder="Expression to watch"
                            className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                            autoFocus
                        />
                        <button
                            onClick={handleAdd}
                            className="p-1 hover:bg-accent rounded text-green-500"
                            title="Add"
                        >
                            <Eye size={14} />
                        </button>
                        <button
                            onClick={() => {
                                setIsAdding(false);
                                setNewExpression('');
                            }}
                            className="p-1 hover:bg-accent rounded text-red-500"
                            title="Cancel"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}

                {watches.length === 0 && !isAdding ? (
                    <div className="text-xs text-muted-foreground italic p-2">
                        No watch expressions. Click + to add.
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {watches.map((watch) => (
                            <div
                                key={watch.id}
                                className="flex items-center gap-2 px-2 py-1 hover:bg-accent/50 border-b border-border/50 group"
                            >
                                <span className="text-xs font-mono text-blue-400 flex-1 truncate">
                                    {watch.expression}
                                </span>
                                <span className="text-xs text-muted-foreground">:</span>
                                {watch.error ? (
                                    <span className="text-xs text-red-400 italic">
                                        {watch.error}
                                    </span>
                                ) : (
                                    <span className="text-xs font-mono text-orange-300">
                                        {watch.value || '...'}
                                    </span>
                                )}
                                <button
                                    onClick={() => onRemove(watch.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded transition-opacity"
                                    title="Remove"
                                >
                                    <EyeOff size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

interface StackFrameItemProps {
    frame: {
        id: number;
        name: string;
        source?: { path?: string };
        line: number;
        column: number;
    };
    isActive: boolean;
    onClick: () => void;
    onNavigate?: (path: string, line: number, column: number) => void;
}

export function StackFrameItem({ frame, isActive, onClick, onNavigate }: StackFrameItemProps) {
    const handleDoubleClick = () => {
        if (frame.source?.path && onNavigate) {
            onNavigate(frame.source.path, frame.line, frame.column);
        }
    };

    return (
        <div
            className={`px-2 py-1 text-xs font-mono cursor-pointer transition-colors ${isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent/50'
                }`}
            onClick={onClick}
            onDoubleClick={handleDoubleClick}
            title={frame.source?.path || frame.name}
        >
            <div className="font-medium truncate">{frame.name}</div>
            <div className="text-muted-foreground text-[10px] truncate">
                {frame.source?.path ? (
                    <>
                        {frame.source.path.split('/').pop()} :{frame.line}:{frame.column}
                    </>
                ) : (
                    `Line ${frame.line}:${frame.column}`
                )}
            </div>
        </div>
    );
}
