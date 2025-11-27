import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OutlinePanel } from './OutlinePanel';
import { getLspClient } from '../lib/lsp';

const sendRequestMock = vi.fn();

vi.mock('../lib/lsp', () => {
    return {
        getLspClient: vi.fn(() => ({
            initialize: vi.fn(),
            sendRequest: sendRequestMock,
            sendNotification: vi.fn(),
            onMessage: vi.fn(),
        })),
    };
});

const getLspClientMock = vi.mocked(getLspClient);

describe('OutlinePanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows message when no file is open', () => {
        render(<OutlinePanel filePath="" monacoLanguage="rust" lspKey={null} onSelect={vi.fn()} />);

        expect(screen.getByText('No file open')).toBeDefined();
    });

    it('fetches and renders symbols from LSP', async () => {
        const symbols = [
            {
                name: 'myFunction',
                kind: 11,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 10 },
                },
                selectionRange: {
                    start: { line: 4, character: 0 },
                    end: { line: 4, character: 10 },
                },
                children: [],
            },
        ];

        sendRequestMock.mockResolvedValueOnce(symbols);
        const onSelect = vi.fn();

        render(<OutlinePanel filePath="/test.rs" monacoLanguage="rust" lspKey="rust" onSelect={onSelect} />);

        await waitFor(() => {
            expect(screen.getByText('myFunction')).toBeDefined();
        });

        fireEvent.click(screen.getByText('myFunction'));

        expect(getLspClientMock).toHaveBeenCalledWith('rust');
        expect(sendRequestMock).toHaveBeenCalledWith('textDocument/documentSymbol', {
            textDocument: { uri: 'file:///test.rs' },
        });
        expect(onSelect).toHaveBeenCalledWith(5); // line is 0-based in LSP, OutlinePanel adds 1
    });

    it('shows fallback when no symbols are returned', async () => {
        sendRequestMock.mockResolvedValueOnce([]);

        render(<OutlinePanel filePath="/empty.rs" monacoLanguage="rust" lspKey="rust" onSelect={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('No symbols found')).toBeDefined();
        });
    });
});
