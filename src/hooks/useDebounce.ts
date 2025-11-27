import { useEffect, useRef } from "react";

export function useDebounce<TArgs extends unknown[]>(
    callback: (...args: TArgs) => void,
    delay: number,
): (...args: TArgs) => void {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return (...args: TArgs) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            callback(...args);
        }, delay);
    };
}
