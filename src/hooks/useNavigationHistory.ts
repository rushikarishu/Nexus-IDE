import { useState, useCallback, useRef } from 'react';

export interface NavigationLocation {
    file: string;
    line: number;
    column: number;
}

const MAX_HISTORY_SIZE = 50;

export function useNavigationHistory() {
    const [history, setHistory] = useState<NavigationLocation[]>([]);
    const currentIndexRef = useRef(-1);
    const [, forceUpdate] = useState({});

    const recordNavigation = useCallback((location: NavigationLocation) => {
        setHistory(prev => {
            // Remove forward history when navigating to a new location
            const newHistory = prev.slice(0, currentIndexRef.current + 1);

            // Don't record if it's the same as the current location
            if (newHistory.length > 0) {
                const current = newHistory[newHistory.length - 1];
                if (current.file === location.file &&
                    current.line === location.line &&
                    current.column === location.column) {
                    return prev;
                }
            }

            // Add new location
            newHistory.push(location);

            // Limit size by removing oldest entries
            while (newHistory.length > MAX_HISTORY_SIZE) {
                newHistory.shift();
            }

            // Update current index
            currentIndexRef.current = newHistory.length - 1;
            forceUpdate({});

            return newHistory;
        });
    }, []);

    const canGoBack = currentIndexRef.current > 0;
    const canGoForward = currentIndexRef.current < history.length - 1;

    const goBack = useCallback((): NavigationLocation | null => {
        if (!canGoBack) return null;

        currentIndexRef.current--;
        forceUpdate({});
        return history[currentIndexRef.current];
    }, [canGoBack, history]);

    const goForward = useCallback((): NavigationLocation | null => {
        if (!canGoForward) return null;

        currentIndexRef.current++;
        forceUpdate({});
        return history[currentIndexRef.current];
    }, [canGoForward, history]);

    return {
        recordNavigation,
        canGoBack,
        canGoForward,
        goBack,
        goForward,
    };
}
