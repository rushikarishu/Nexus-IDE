import { useCallback, useRef, useMemo } from 'react';
import { Command, CommandPaletteItem } from '../types/commands';

/**
 * Centralized command registry hook
 * Manages all IDE commands and provides fuzzy search functionality
 */
export function useCommands() {
    const commandsRef = useRef<Map<string, Command>>(new Map());

    // Register a new command (no state updates - uses ref only)
    const registerCommand = useCallback((command: Command) => {
        commandsRef.current.set(command.id, command);
    }, []);

    // Unregister a command
    const unregisterCommand = useCallback((id: string) => {
        commandsRef.current.delete(id);
    }, []);

    // Execute a command by ID
    const executeCommand = useCallback(async (id: string, ...args: unknown[]) => {
        const command = commandsRef.current.get(id);
        if (!command) {
            console.warn(`Command not found: ${id}`);
            return;
        }

        // Check if command is available (when condition)
        if (command.when && !command.when()) {
            console.warn(`Command not available: ${id}`);
            return;
        }

        try {
            await command.execute(...args);
        } catch (error) {
            console.error(`Error executing command ${id}:`, error);
            throw error;
        }
    }, []);

    // Get all available commands (filtered by when condition)
    const getAvailableCommands = useCallback((): CommandPaletteItem[] => {
        return Array.from(commandsRef.current.values())
            .filter(cmd => !cmd.when || cmd.when())
            .map(cmd => ({
                id: cmd.id,
                label: cmd.label,
                description: cmd.description,
                category: cmd.category,
                keybinding: cmd.keybinding,
            }));
    }, []);

    // Search commands with fuzzy matching
    const searchCommands = useCallback((query: string): CommandPaletteItem[] => {
        const available = Array.from(commandsRef.current.values())
            .filter(cmd => !cmd.when || cmd.when())
            .map(cmd => ({
                id: cmd.id,
                label: cmd.label,
                description: cmd.description,
                category: cmd.category,
                keybinding: cmd.keybinding,
            }));

        if (!query.trim()) {
            return available;
        }

        const lowerQuery = query.toLowerCase();

        // Simple fuzzy search: match if all query characters exist in order
        return available
            .filter(cmd => {
                const searchText = `${cmd.label} ${cmd.description || ''} ${cmd.category || ''}`.toLowerCase();
                let queryIndex = 0;
                for (let i = 0; i < searchText.length && queryIndex < lowerQuery.length; i++) {
                    if (searchText[i] === lowerQuery[queryIndex]) {
                        queryIndex++;
                    }
                }
                return queryIndex === lowerQuery.length;
            })
            .sort((a, b) => {
                // Prioritize matches in label over description
                const aLabelMatch = a.label.toLowerCase().includes(lowerQuery);
                const bLabelMatch = b.label.toLowerCase().includes(lowerQuery);
                if (aLabelMatch && !bLabelMatch) return -1;
                if (!aLabelMatch && bLabelMatch) return 1;
                return a.label.localeCompare(b.label);
            });
    }, []);

    // Clear all commands (for cleanup)
    const clearCommands = useCallback(() => {
        commandsRef.current.clear();
    }, []);

    // Memoize the returned object to prevent unnecessary re-renders
    return useMemo(() => ({
        registerCommand,
        unregisterCommand,
        executeCommand,
        getAvailableCommands,
        searchCommands,
        clearCommands,
    }), [registerCommand, unregisterCommand, executeCommand, getAvailableCommands, searchCommands, clearCommands]);
}
