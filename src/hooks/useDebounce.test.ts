import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
    it('should execute the callback after the specified delay', () => {
        vi.useFakeTimers();
        const callback = vi.fn();
        const { result } = renderHook(() => useDebounce(callback, 500));

        act(() => {
            result.current('test');
        });

        expect(callback).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(callback).toHaveBeenCalledWith('test');
        vi.useRealTimers();
    });

    it('should reset the timer if called again before delay', () => {
        vi.useFakeTimers();
        const callback = vi.fn();
        const { result } = renderHook(() => useDebounce(callback, 500));

        act(() => {
            result.current('first');
        });

        act(() => {
            vi.advanceTimersByTime(200);
            result.current('second');
        });

        act(() => {
            vi.advanceTimersByTime(300); // Total 500ms from first call, but only 300ms from second
        });

        expect(callback).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(200); // Total 500ms from second call
        });

        expect(callback).toHaveBeenCalledWith('second');
        expect(callback).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});
