import React, { useEffect, useRef } from "react";
import { cn } from "../lib/utils";

interface DialogProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

export function Dialog({ isOpen, onClose, title, children, footer }: DialogProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) {
            window.addEventListener("keydown", handleEscape);
        }
        return () => window.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div
                ref={ref}
                className="w-full max-w-md bg-popover border border-border rounded-lg shadow-lg animate-in fade-in zoom-in-95 duration-200"
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        ×
                    </button>
                </div>
                <div className="p-4 text-foreground text-sm">
                    {children}
                </div>
                {footer && (
                    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/20 rounded-b-lg">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

interface PromptDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (value: string) => void;
    title: string;
    initialValue?: string;
    placeholder?: string;
    confirmText?: string;
}

export function PromptDialog({ isOpen, onClose, onConfirm, title, initialValue = "", placeholder, confirmText = "OK" }: PromptDialogProps) {
    const [value, setValue] = React.useState(initialValue);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen, initialValue]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm(value);
        onClose();
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="prompt-form"
                        className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                    >
                        {confirmText}
                    </button>
                </>
            }
        >
            <form id="prompt-form" onSubmit={handleSubmit}>
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                />
            </form>
        </Dialog>
    );
}

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    destructive?: boolean;
}

export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", destructive = false }: ConfirmDialogProps) {
    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            footer={
                <>
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => { onConfirm(); onClose(); }}
                        className={cn(
                            "px-3 py-1.5 text-sm rounded transition-colors text-white",
                            destructive ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary/90"
                        )}
                    >
                        {confirmText}
                    </button>
                </>
            }
        >
            <p className="text-muted-foreground">{message}</p>
        </Dialog>
    );
}
