import React, { createContext, useState, useCallback, useContext } from "react";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "../lib/utils";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastContextType {
    toasts: Toast[];
    addToast: (message: string, type: ToastType, duration?: number) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const addToast = useCallback((message: string, type: ToastType, duration = 3000) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type, duration }]);

        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={cn(
                            "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border animate-in slide-in-from-right-full duration-300",
                            "min-w-[300px] max-w-[400px]",
                            toast.type === "success" && "bg-background border-green-500/50 text-foreground",
                            toast.type === "error" && "bg-background border-red-500/50 text-foreground",
                            toast.type === "warning" && "bg-background border-yellow-500/50 text-foreground",
                            toast.type === "info" && "bg-background border-blue-500/50 text-foreground"
                        )}
                    >
                        {toast.type === "success" && <CheckCircle size={20} className="text-green-500" />}
                        {toast.type === "error" && <AlertCircle size={20} className="text-red-500" />}
                        {toast.type === "warning" && <AlertTriangle size={20} className="text-yellow-500" />}
                        {toast.type === "info" && <Info size={20} className="text-blue-500" />}

                        <p className="text-sm font-medium flex-1">{toast.message}</p>

                        <button
                            onClick={() => removeToast(toast.id)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
