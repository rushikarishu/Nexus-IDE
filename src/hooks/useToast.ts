import { useMemo } from "react";
import { useToast as useToastContext } from "../components/Toast";

export function useToast() {
    const { addToast } = useToastContext();

    return useMemo(() => ({
        success: (message: string, duration?: number) => addToast(message, "success", duration),
        error: (message: string, duration?: number) => addToast(message, "error", duration),
        warning: (message: string, duration?: number) => addToast(message, "warning", duration),
        info: (message: string, duration?: number) => addToast(message, "info", duration),
    }), [addToast]);
}
