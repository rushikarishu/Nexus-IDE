import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchPanel } from './SearchPanel';
import { invoke } from '@tauri-apps/api/core';

// Mocks
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe('SearchPanel', () => {
    const mockOnFileSelect = vi.fn();
    const mockOnClose = vi.fn();
    const mockProps = {
        path: '/test/workspace',
        onFileSelect: mockOnFileSelect,
        onClose: mockOnClose,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render search input', () => {
        render(<SearchPanel {...mockProps} />);

        const searchInput = screen.getByPlaceholderText('Search...');
        expect(searchInput).toBeDefined();
    });

    it('should show replace input when replace button clicked', () => {
        render(<SearchPanel {...mockProps} />);

        const replaceButton = screen.getByTitle('Toggle Replace');
        fireEvent.click(replaceButton);

        const replaceInput = screen.getByPlaceholderText('Replace with...');
        expect(replaceInput).toBeDefined();
    });

    it('should debounce search requests', async () => {
        invokeMock.mockResolvedValue([]);

        render(<SearchPanel {...mockProps} />);

        const searchInput = screen.getByPlaceholderText('Search...');

        // Type quickly
        fireEvent.change(searchInput, { target: { value: 't' } });
        fireEvent.change(searchInput, { target: { value: 'te' } });
        fireEvent.change(searchInput, { target: { value: 'test' } });

        // Should not call immediately
        expect(invokeMock).not.toHaveBeenCalled();

        // Wait for debounce (250ms)
        await waitFor(() => {
            expect(invokeMock).toHaveBeenCalledWith('search_text', {
                query: 'test',
                path: '/test/workspace',
                caseSensitive: false
            });
        }, { timeout: 500 });
    });

    it('should display search results', async () => {
        const mockResults = [
            { file: '/test/file1.txt', line_number: 1, line_content: 'test content' },
            { file: '/test/file1.txt', line_number: 5, line_content: 'another test' },
        ];
        invokeMock.mockResolvedValue(mockResults);

        render(<SearchPanel {...mockProps} />);

        const searchInput = screen.getByPlaceholderText('Search...');
        fireEvent.change(searchInput, { target: { value: 'test' } });

        await waitFor(() => {
            expect(screen.getByText('2 results')).toBeDefined();
            expect(screen.getByText('test content')).toBeDefined();
            expect(screen.getByText('another test')).toBeDefined();
        });
    });

    it('should call onFileSelect when result clicked', async () => {
        const mockResults = [
            { file: '/test/file1.txt', line_number: 1, line_content: 'test content' },
        ];
        invokeMock.mockResolvedValue(mockResults);

        render(<SearchPanel {...mockProps} />);

        const searchInput = screen.getByPlaceholderText('Search...');
        fireEvent.change(searchInput, { target: { value: 'test' } });

        await waitFor(() => {
            const result = screen.getByText('test content');
            fireEvent.click(result);
        });

        expect(mockOnFileSelect).toHaveBeenCalledWith('/test/file1.txt', 1);
    });

    it('should handle empty query', async () => {
        render(<SearchPanel {...mockProps} />);

        const searchInput = screen.getByPlaceholderText('Search...');
        fireEvent.change(searchInput, { target: { value: '   ' } });

        await waitFor(() => {
            expect(invokeMock).not.toHaveBeenCalled();
        }, { timeout: 300 });
    });

    it('should show error message on search failure', async () => {
        invokeMock.mockRejectedValue('Search failed');

        render(<SearchPanel {...mockProps} />);

        const searchInput = screen.getByPlaceholderText('Search...');
        fireEvent.change(searchInput, { target: { value: 'test' } });

        await waitFor(() => {
            expect(screen.getByText(/Error: Search failed/)).toBeDefined();
        });
    });

    it('should handle case sensitive search', async () => {
        invokeMock.mockResolvedValue([]);

        render(<SearchPanel {...mockProps} />);

        const caseSensitiveCheckbox = screen.getByLabelText('Case Sensitive');
        fireEvent.click(caseSensitiveCheckbox);

        const searchInput = screen.getByPlaceholderText('Search...');
        fireEvent.change(searchInput, { target: { value: 'Test' } });

        await waitFor(() => {
            expect(invokeMock).toHaveBeenCalledWith('search_text', {
                query: 'Test',
                path: '/test/workspace',
                caseSensitive: true
            });
        });
    });

    it('should handle replace all', async () => {
        global.confirm = vi.fn(() => true);
        global.alert = vi.fn();

        const mockResults = [
            { file: '/test/file1.txt', line_number: 1, line_content: 'old text' },
            { file: '/test/file2.txt', line_number: 2, line_content: 'old text' },
        ];
        invokeMock.mockResolvedValueOnce(mockResults).mockResolvedValueOnce(2).mockResolvedValueOnce([]);

        render(<SearchPanel {...mockProps} />);

        // Enter search query
        const searchInput = screen.getByPlaceholderText('Search...');
        fireEvent.change(searchInput, { target: { value: 'old' } });

        await waitFor(() => {
            expect(screen.getByText('2 results')).toBeDefined();
        });

        // Show replace
        const replaceButton = screen.getByTitle('Toggle Replace');
        fireEvent.click(replaceButton);

        // Enter replacement text
        const replaceInput = screen.getByPlaceholderText('Replace with...');
        fireEvent.change(replaceInput, { target: { value: 'new' } });

        // Click replace all
        const replaceAllButton = screen.getByText('Replace All');
        fireEvent.click(replaceAllButton);

        await waitFor(() => {
            expect(invokeMock).toHaveBeenCalledWith('replace_text', {
                files: ['/test/file1.txt', '/test/file2.txt'],
                query: 'old',
                replacement: 'new',
                caseSensitive: false
            });
        });
    });

    it('should call onClose when close button clicked', () => {
        render(<SearchPanel {...mockProps} />);

        const closeButton = screen.getByTitle('Collapse Sidebar');
        fireEvent.click(closeButton);

        expect(mockOnClose).toHaveBeenCalled();
    });
});
