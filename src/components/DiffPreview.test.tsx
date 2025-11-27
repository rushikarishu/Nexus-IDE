import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiffPreview } from './DiffPreview';

describe('DiffPreview - Per-Hunk Diff Acceptance', () => {
    const originalCode = `function test() {
  const x = 5;
  const y = 10;
  return x + y;
}`;

    const modifiedCode = `function test() {
  const x = 10;
  const y = 20;
  return x * y;
}`;

    it('renders diff preview with original and modified code', () => {
        const onAccept = vi.fn();
        const onReject = vi.fn();

        render(
            <DiffPreview
                original={originalCode}
                modified={modifiedCode}
                onAccept={onAccept}
                onReject={onReject}
            />
        );

        expect(screen.getByText('AI Suggested Changes')).toBeInTheDocument();
        expect(screen.getByText('Split View')).toBeInTheDocument();
        expect(screen.getByText('Unified View')).toBeInTheDocument();
    });

    it('parses diff into individual hunks', () => {
        const onAccept = vi.fn();
        const onReject = vi.fn();

        render(
            <DiffPreview
                original={originalCode}
                modified={modifiedCode}
                onAccept={onAccept}
                onReject={onReject}
            />
        );

        // Should have hunk headers
        const hunkHeaders = screen.getAllByText(/Hunk \d+ \(Line \d+\)/);
        expect(hunkHeaders.length).toBeGreaterThan(0);
    });

    it('shows accept and reject buttons for each hunk', () => {
        const onAccept = vi.fn();
        const onReject = vi.fn();

        render(
            <DiffPreview
                original={originalCode}
                modified={modifiedCode}
                onAccept={onAccept}
                onReject={onReject}
            />
        );

        const acceptButtons = screen.getAllByText('Accept');
        const rejectButtons = screen.getAllByText('Reject');

        expect(acceptButtons.length).toBeGreaterThan(0);
        expect(rejectButtons.length).toBeGreaterThan(0);
    });

    it('toggles hunk acceptance state when clicking accept button', () => {
        const onAccept = vi.fn();
        const onReject = vi.fn();

        render(
            <DiffPreview
                original={originalCode}
                modified={modifiedCode}
                onAccept={onAccept}
                onReject={onReject}
            />
        );

        const acceptButtons = screen.getAllByRole('button', { name: /Accept/i });
        const firstAcceptButton = acceptButtons[0];

        // Click accept
        fireEvent.click(firstAcceptButton);

        // Status should update
        expect(screen.getByText(/1 hunks accepted, 0 rejected/)).toBeInTheDocument();
    });

    it('toggles hunk rejection state when clicking reject button', () => {
        const onAccept = vi.fn();
        const onReject = vi.fn();

        render(
            <DiffPreview
                original={originalCode}
                modified={modifiedCode}
                onAccept={onAccept}
                onReject={onReject}
            />
        );

        const rejectButtons = screen.getAllByRole('button', { name: /Reject/i });
        const firstRejectButton = rejectButtons.filter(btn => btn.textContent?.includes('Reject') && !btn.textContent?.includes('Reject All'))[0];

        // Click reject
        fireEvent.click(firstRejectButton);

        // Status should update
        expect(screen.getByText(/0 hunks accepted, 1 rejected/)).toBeInTheDocument();
    });

    it('switches between split and unified views', () => {
        const onAccept = vi.fn();
        const onReject = vi.fn();

        render(
            <DiffPreview
                original={originalCode}
                modified={modifiedCode}
                onAccept={onAccept}
                onReject={onReject}
            />
        );

        const unifiedButton = screen.getByText('Unified View');
        fireEvent.click(unifiedButton);

        // Should show unified view (check for unified diff markers)
        const splits = screen.queryByText('Original');
        expect(splits).not.toBeInTheDocument();

        // Switch back
        const splitButton = screen.getByText('Split View');
        fireEvent.click(splitButton);

        expect(screen.getByText('Original')).toBeInTheDocument();
    });

    it('calls onAccept when clicking "Accept All" button', () => {
        const onAccept = vi.fn();
        const onReject = vi.fn();

        render(
            <DiffPreview
                original={originalCode}
                modified={modifiedCode}
                onAccept={onAccept}
                onReject={onReject}
            />
        );

        const acceptAllButton = screen.getByText('Accept All');
        fireEvent.click(acceptAllButton);

        expect(onAccept).toHaveBeenCalledTimes(1);
    });

    it('calls onReject when clicking "Reject All" button', () => {
        const onAccept = vi.fn();
        const onReject = vi.fn();

        render(
            <DiffPreview
                original={originalCode}
                modified={modifiedCode}
                onAccept={onAccept}
                onReject={onReject}
            />
        );

        const rejectAllButton = screen.getByText('Reject All');
        fireEvent.click(rejectAllButton);

        expect(onReject).toHaveBeenCalledTimes(1);
    });

    it('changes button text to "Apply Selected" when hunks are selected', () => {
        const onAccept = vi.fn();
        const onReject = vi.fn();

        render(
            <DiffPreview
                original={originalCode}
                modified={modifiedCode}
                onAccept={onAccept}
                onReject={onReject}
            />
        );

        // Initially shows "Accept All"
        expect(screen.getByText('Accept All')).toBeInTheDocument();

        // Accept one hunk
        const acceptButtons = screen.getAllByRole('button', { name: /Accept/i });
        fireEvent.click(acceptButtons[0]);

        // Should change to "Apply Selected"
        expect(screen.getByText('Apply Selected')).toBeInTheDocument();
    });

    it('handles empty diffs gracefully', () => {
        const onAccept = vi.fn();
        const onReject = vi.fn();

        render(
            <DiffPreview
                original=""
                modified=""
                onAccept={onAccept}
                onReject={onReject}
            />
        );

        // Should still render without crashing
        expect(screen.getByText('AI Suggested Changes')).toBeInTheDocument();
    });

    it('handles identical original and modified code', () => {
        const onAccept = vi.fn();
        const onReject = vi.fn();
        const sameCode = 'const x = 5;';

        render(
            <DiffPreview
                original={sameCode}
                modified={sameCode}
                onAccept={onAccept}
                onReject={onReject}
            />
        );

        // Should render but with no changes
        expect(screen.getByText('AI Suggested Changes')).toBeInTheDocument();
    });
});
