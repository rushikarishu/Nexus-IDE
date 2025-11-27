import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBar } from './StatusBar';

describe('StatusBar', () => {
    it('renders git branch, cursor position, language and diagnostics', () => {
        render(
            <StatusBar
                language="rust"
                cursorLine={3}
                cursorCol={5}
                lspStatus="running"
                gitBranch="feature-branch"
                isDirty={true}
                errorCount={2}
                warningCount={1}
            />
        );

        expect(screen.getByText('feature-branch')).toBeDefined();
        expect(screen.getByTitle('Uncommitted changes')).toBeDefined();
        expect(screen.getByText('Ready')).toBeDefined();
        expect(screen.getByText('Ln 3, Col 5')).toBeDefined();
        expect(screen.getByText('2')).toBeDefined();
        expect(screen.getByText('1')).toBeDefined();
        expect(screen.getByText('rust')).toBeDefined();
    });

    it('renders defaults when optional props are omitted', () => {
        render(<StatusBar language="ts" lspStatus="stopped" />);

        expect(screen.getByText('main')).toBeDefined();
        expect(screen.getByText('Initializing...')).toBeDefined();
        expect(screen.getByText('ts')).toBeDefined();
    });
});
