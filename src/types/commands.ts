export interface Command {
    id: string;
    label: string;
    description?: string;
    category?: string;
    keybinding?: string;
    execute: (...args: unknown[]) => void | Promise<void>;
    when?: () => boolean; // Condition to show/enable command
}

export interface CommandPaletteItem {
    id: string;
    label: string;
    description?: string;
    category?: string;
    keybinding?: string;
}
