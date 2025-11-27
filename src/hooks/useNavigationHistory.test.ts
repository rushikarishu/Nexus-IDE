import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useNavigationHistory } from './useNavigationHistory';

describe('useNavigationHistory', () => {
    it('should initialize with no history', () => {
        const { result } = renderHook(() => useNavigationHistory());

        expect(result.current.canGoBack).toBe(false);
        expect(result.current.canGoForward).toBe(false);
    });

    it('should record navigation and allow going back', () => {
        const { result } = renderHook(() => useNavigationHistory());

        act(() => {
            result.current.recordNavigation({ file: '/file1.rs', line: 10, column: 5 });
        });

        expect(result.current.canGoBack).toBe(false); // Only one entry

        act(() => {
            result.current.recordNavigation({ file: '/file2.rs', line: 20, column: 10 });
        });

        expect(result.current.canGoBack).toBe(true);
        expect(result.current.canGoForward).toBe(false);

        let previousLocation;
        act(() => {
            previousLocation = result.current.goBack();
        });

        expect(previousLocation).toEqual({ file: '/file1.rs', line: 10, column: 5 });
        expect(result.current.canGoBack).toBe(false);
        expect(result.current.canGoForward).toBe(true);
    });

    it('should allow going forward after going back', () => {
        const { result } = renderHook(() => useNavigationHistory());

        act(() => {
            result.current.recordNavigation({ file: '/file1.rs', line: 10, column: 5 });
            result.current.recordNavigation({ file: '/file2.rs', line: 20, column: 10 });
        });

        act(() => {
            result.current.goBack();
        });

        let nextLocation;
        act(() => {
            nextLocation = result.current.goForward();
        });

        expect(nextLocation).toEqual({ file: '/file2.rs', line: 20, column: 10 });
        expect(result.current.canGoForward).toBe(false);
    });

    it('should clear forward history when navigating to a new location', () => {
        const { result } = renderHook(() => useNavigationHistory());

        act(() => {
            result.current.recordNavigation({ file: '/file1.rs', line: 10, column: 5 });
            result.current.recordNavigation({ file: '/file2.rs', line: 20, column: 10 });
            result.current.recordNavigation({ file: '/file3.rs', line: 30, column: 15 });
        });

        act(() => {
            result.current.goBack();
            result.current.goBack();
        });

        expect(result.current.canGoForward).toBe(true);

        // Navigate to a new location
        act(() => {
            result.current.recordNavigation({ file: '/file4.rs', line: 40, column: 20 });
        });

        // Forward history should be cleared
        expect(result.current.canGoForward).toBe(false);
        expect(result.current.canGoBack).toBe(true);

        // Going back should go to file1, not file2 or file3
        let previousLocation;
        act(() => {
            previousLocation = result.current.goBack();
        });

        expect(previousLocation).toEqual({ file: '/file1.rs', line: 10, column: 5 });
    });

    it('should not record duplicate consecutive locations', () => {
        const { result } = renderHook(() => useNavigationHistory());

        act(() => {
            result.current.recordNavigation({ file: '/file1.rs', line: 10, column: 5 });
            result.current.recordNavigation({ file: '/file1.rs', line: 10, column: 5 });
            result.current.recordNavigation({ file: '/file1.rs', line: 10, column: 5 });
        });

        expect(result.current.canGoBack).toBe(false); // Still only one entry
    });

    it('should limit history to 50 entries', () => {
        const { result } = renderHook(() => useNavigationHistory());

        // Add 60 entries
        act(() => {
            for (let i = 0; i < 60; i++) {
                result.current.recordNavigation({ file: `/file${i}.rs`, line: i, column: 0 });
            }
        });

        // Count how many times we can go back
        let backCount = 0;

        while (result.current.canGoBack) {
            act(() => {
                result.current.goBack();
            });
            backCount++;
            if (backCount > 60) break; // Safety break
        }

        // Should be able to go back 49 times (50 total entries, starting at the last one)
        expect(backCount).toBe(49);
    });

    it('should return null when trying to go back with no history', () => {
        const { result } = renderHook(() => useNavigationHistory());

        let location;
        act(() => {
            location = result.current.goBack();
        });

        expect(location).toBeNull();
    });

    it('should return null when trying to go forward at the end', () => {
        const { result } = renderHook(() => useNavigationHistory());

        act(() => {
            result.current.recordNavigation({ file: '/file1.rs', line: 10, column: 5 });
        });

        let location;
        act(() => {
            location = result.current.goForward();
        });

        expect(location).toBeNull();
    });
});
