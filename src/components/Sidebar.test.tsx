import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
    const mockProps = {
        onOpenFolder: vi.fn(),
        onAddFolder: vi.fn(),
        onNewFile: vi.fn(),
        onNewFolder: vi.fn(),
        onToggleFileTree: vi.fn(),
        onToggleTerminal: vi.fn(),
        terminalOpen: false,
        onToggleError: vi.fn(),
        errorVisible: false,
        onSettings: vi.fn(),
        activeTab: 'explorer' as const,
        onTabChange: vi.fn(),
    };

    it('should render all tab buttons', () => {
        render(<Sidebar {...mockProps} />);

        expect(screen.getByTitle('Explorer')).toBeDefined();
        expect(screen.getByTitle('Search')).toBeDefined();
        expect(screen.getByTitle('Source Control')).toBeDefined();
        expect(screen.getByTitle('Run & Test')).toBeDefined();
        expect(screen.getByTitle('Plugins')).toBeDefined();
        expect(screen.getByTitle('Outline')).toBeDefined();
        expect(screen.getByTitle('AI Assistant')).toBeDefined();
    });

    it('should highlight active tab', () => {
        render(<Sidebar {...mockProps} activeTab="search" />);

        const searchButton = screen.getByTitle('Search');
        expect(searchButton.className).toContain('bg-primary');
    });

    it('should call onTabChange when tab clicked', () => {
        render(<Sidebar {...mockProps} />);

        const searchButton = screen.getByTitle('Search');
        fireEvent.click(searchButton);

        expect(mockProps.onTabChange).toHaveBeenCalledWith('search');
    });

    it('should render action buttons', () => {
        render(<Sidebar {...mockProps} />);

        expect(screen.getByTitle('Open Folder')).toBeDefined();
        expect(screen.getByTitle('New File')).toBeDefined();
        expect(screen.getByTitle('New Folder')).toBeDefined();
    });

    it('should call onOpenFolder when open folder clicked', () => {
        render(<Sidebar {...mockProps} />);

        const openButton = screen.getByTitle('Open Folder');
        fireEvent.click(openButton);

        expect(mockProps.onOpenFolder).toHaveBeenCalled();
    });

    it('should call onAddFolder when add folder clicked', () => {
        render(<Sidebar {...mockProps} />);

        const addFolderButton = screen.getByTitle('Add Folder to Workspace');
        fireEvent.click(addFolderButton);

        expect(mockProps.onAddFolder).toHaveBeenCalled();
    });

    it('should call onNewFile when new file clicked', () => {
        render(<Sidebar {...mockProps} />);

        const newFileButton = screen.getByTitle('New File');
        fireEvent.click(newFileButton);

        expect(mockProps.onNewFile).toHaveBeenCalled();
    });

    it('should call onNewFolder when new folder clicked', () => {
        render(<Sidebar {...mockProps} />);

        const newFolderButton = screen.getByTitle('New Folder');
        fireEvent.click(newFolderButton);

        expect(mockProps.onNewFolder).toHaveBeenCalled();
    });

    it('should render bottom action buttons', () => {
        render(<Sidebar {...mockProps} />);

        expect(screen.getByTitle('Problems')).toBeDefined();
        expect(screen.getByTitle('Terminal')).toBeDefined();
        expect(screen.getByTitle('Settings')).toBeDefined();
    });

    it('should call onToggleError when problems clicked', () => {
        render(<Sidebar {...mockProps} />);

        const errorButton = screen.getByTitle('Problems');
        fireEvent.click(errorButton);

        expect(mockProps.onToggleError).toHaveBeenCalled();
    });

    it('should call onToggleTerminal when terminal clicked', () => {
        render(<Sidebar {...mockProps} />);

        const terminalButton = screen.getByTitle('Terminal');
        fireEvent.click(terminalButton);

        expect(mockProps.onToggleTerminal).toHaveBeenCalled();
    });

    it('should call onSettings when settings clicked', () => {
        render(<Sidebar {...mockProps} />);

        const settingsButton = screen.getByTitle('Settings');
        fireEvent.click(settingsButton);

        expect(mockProps.onSettings).toHaveBeenCalled();
    });

    it('should highlight terminal when open', () => {
        render(<Sidebar {...mockProps} terminalOpen={true} />);

        const terminalButton = screen.getByTitle('Terminal');
        expect(terminalButton.className).toContain('bg-accent');
    });

    it('should highlight problems when visible', () => {
        render(<Sidebar {...mockProps} errorVisible={true} />);

        const errorButton = screen.getByTitle('Problems');
        expect(errorButton.className).toContain('bg-accent');
    });

    it('should handle all tab changes', () => {
        const { rerender } = render(<Sidebar {...mockProps} />);

        const tabs = ['explorer', 'search', 'git', 'run', 'plugins', 'outline', 'ai'] as const;

        tabs.forEach(tab => {
            const button = screen.getByTitle(
                tab === 'explorer' ? 'Explorer' :
                    tab === 'search' ? 'Search' :
                        tab === 'git' ? 'Source Control' :
                            tab === 'run' ? 'Run & Test' :
                                tab === 'plugins' ? 'Plugins' :
                                    tab === 'outline' ? 'Outline' :
                                        'AI Assistant'
            );

            fireEvent.click(button);
            expect(mockProps.onTabChange).toHaveBeenCalledWith(tab);

            // Rerender with new active tab
            rerender(<Sidebar {...mockProps} activeTab={tab} />);
            expect(button.className).toContain('bg-primary');
        });
    });
});
