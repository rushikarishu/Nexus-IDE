import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoToSymbolModal } from './GoToSymbolModal';
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

describe('GoToSymbolModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does not render when closed', () => {
        render(
            <GoToSymbolModal
                isOpen={false}
                onClose={vi.fn()}
                onSelect={vi.fn()}
                lspKey="rust"
            />
        );

        expect(screen.queryByPlaceholderText('Go to symbol...')).toBeNull();
    });

    it('fetches and displays workspace symbols based on query', async () => {
        const symbols = [
            {
                name: 'MySymbol',
                kind: 11,
                location: {
                    uri: 'file:///test.rs',
                    range: {
                        start: { line: 10, character: 0 },
                        end: { line: 10, character: 5 },
                    },
                },
                containerName: 'Container',
            },
        ];

        sendRequestMock.mockResolvedValueOnce(symbols);
        const onSelect = vi.fn();
        const onClose = vi.fn();

        render(
            <GoToSymbolModal
                isOpen={true}
                onClose={onClose}
                onSelect={onSelect}
                lspKey="rust"
            />
        );

        const input = screen.getByPlaceholderText('Go to symbol...');
        fireEvent.change(input, { target: { value: 'My' } });

        await waitFor(() => {
            expect(sendRequestMock).toHaveBeenCalledWith('workspace/symbol', { query: 'My' });
            expect(screen.getByText('MySymbol')).toBeDefined();
        });

        fireEvent.click(screen.getByText('MySymbol'));

        expect(getLspClientMock).toHaveBeenCalledWith('rust');
        expect(onSelect).toHaveBeenCalledWith('file:///test.rs', 11);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
