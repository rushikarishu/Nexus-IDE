// Workspace settings for Nexus IDE
import { invoke } from '@tauri-apps/api/core';

export interface WorkspaceSettings {
    // Editor settings
    editor: {
        fontSize: number;
        tabSize: number;
        insertSpaces: boolean;
        wordWrap: 'off' | 'on' | 'wordWrapColumn';
        minimap: boolean;
        lineNumbers: 'on' | 'off' | 'relative';
        renderWhitespace: 'none' | 'boundary' | 'selection' | 'all';
    };

    // Formatting settings
    formatting: {
        formatOnSave: boolean;
        formatOnType: boolean;
    };

    // Language-specific settings
    languages: {
        [language: string]: {
            tabSize?: number;
            insertSpaces?: boolean;
            formatter?: string;
        };
    };

    // Terminal settings
    terminal: {
        fontSize: number;
        fontFamily: string;
    };

    // Git settings
    git: {
        autoFetch: boolean;
        confirmSync: boolean;
    };
}

// Default settings
export const defaultSettings: WorkspaceSettings = {
    editor: {
        fontSize: 14,
        tabSize: 2,
        insertSpaces: true,
        wordWrap: 'off',
        minimap: true,
        lineNumbers: 'on',
        renderWhitespace: 'selection',
    },
    formatting: {
        formatOnSave: false,
        formatOnType: false,
    },
    languages: {
        javascript: { tabSize: 2, insertSpaces: true },
        typescript: { tabSize: 2, insertSpaces: true },
        rust: { tabSize: 4, insertSpaces: true },
        python: { tabSize: 4, insertSpaces: true },
        go: { tabSize: 4, insertSpaces: false },
    },
    terminal: {
        fontSize: 13,
        fontFamily: "'JetBrains Mono', monospace",
    },
    git: {
        autoFetch: false,
        confirmSync: true,
    },
};

/**
 * Load workspace settings from .nexus/settings.json
 */
export async function loadWorkspaceSettings(workspacePath: string): Promise<WorkspaceSettings> {
    try {
        const settingsPath = `${workspacePath}/.nexus/settings.json`;
        const content = await invoke<string>('read_file', { path: settingsPath });
        const parsed = JSON.parse(content) as Partial<WorkspaceSettings>;

        // Merge with defaults
        return mergeSettings(defaultSettings, parsed);
    } catch (e) {
        // Settings file doesn't exist or is invalid, return defaults
        console.log('Using default workspace settings (no .nexus/settings.json found)');
        return defaultSettings;
    }
}

/**
 * Save workspace settings to .nexus/settings.json
 */
export async function saveWorkspaceSettings(
    workspacePath: string,
    settings: WorkspaceSettings
): Promise<void> {
    try {
        const settingsPath = `${workspacePath}/.nexus/settings.json`;
        const nexusDir = `${workspacePath}/.nexus`;

        // Ensure .nexus directory exists
        try {
            await invoke('create_dir', { path: nexusDir });
        } catch {
            // Directory might already exist, ignore error
        }

        // Write settings
        const content = JSON.stringify(settings, null, 2);
        await invoke('save_file', { path: settingsPath, content: content });

        console.log('Workspace settings saved to .nexus/settings.json');
    } catch (e) {
        console.error('Failed to save workspace settings:', e);
        throw e;
    }
}

/**
 * Merge partial settings with defaults (deep merge)
 */
function mergeSettings(
    defaults: WorkspaceSettings,
    partial: Partial<WorkspaceSettings>
): WorkspaceSettings {
    return {
        editor: { ...defaults.editor, ...partial.editor },
        formatting: { ...defaults.formatting, ...partial.formatting },
        languages: { ...defaults.languages, ...partial.languages },
        terminal: { ...defaults.terminal, ...partial.terminal },
        git: { ...defaults.git, ...partial.git },
    };
}

/**
 * Get language-specific tab settings
 */
export function getLanguageTabSettings(
    settings: WorkspaceSettings,
    language: string
): { tabSize: number; insertSpaces: boolean } {
    const langSettings = settings.languages[language];
    return {
        tabSize: langSettings?.tabSize ?? settings.editor.tabSize,
        insertSpaces: langSettings?.insertSpaces ?? settings.editor.insertSpaces,
    };
}
