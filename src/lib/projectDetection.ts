// Project type detection for Nexus IDE
import { invoke } from '@tauri-apps/api/core';

export type ProjectType = 'nodejs' | 'rust' | 'python' | 'unknown';

export interface ProjectInfo {
    type: ProjectType;
    rootPath: string;
    configFile: string;
    name?: string;
}

/**
 * Detect project type based on configuration files in the workspace
 */
export async function detectProjectType(workspacePath: string): Promise<ProjectInfo> {
    try {
        // Check for Node.js project
        const hasPackageJson = await fileExists(`${workspacePath}/package.json`);
        if (hasPackageJson) {
            const name = await getProjectName(`${workspacePath}/package.json`, 'json');
            return {
                type: 'nodejs',
                rootPath: workspacePath,
                configFile: 'package.json',
                name,
            };
        }

        // Check for Rust project
        const hasCargoToml = await fileExists(`${workspacePath}/Cargo.toml`);
        if (hasCargoToml) {
            const name = await getProjectName(`${workspacePath}/Cargo.toml`, 'toml');
            return {
                type: 'rust',
                rootPath: workspacePath,
                configFile: 'Cargo.toml',
                name,
            };
        }

        // Check for Python project (pyproject.toml takes precedence)
        const hasPyprojectToml = await fileExists(`${workspacePath}/pyproject.toml`);
        if (hasPyprojectToml) {
            const name = await getProjectName(`${workspacePath}/pyproject.toml`, 'toml');
            return {
                type: 'python',
                rootPath: workspacePath,
                configFile: 'pyproject.toml',
                name,
            };
        }

        // Check for setup.py as fallback
        const hasSetupPy = await fileExists(`${workspacePath}/setup.py`);
        if (hasSetupPy) {
            return {
                type: 'python',
                rootPath: workspacePath,
                configFile: 'setup.py',
            };
        }

        // No recognized project type
        return {
            type: 'unknown',
            rootPath: workspacePath,
            configFile: '',
        };
    } catch (e) {
        console.error('Failed to detect project type:', e);
        return {
            type: 'unknown',
            rootPath: workspacePath,
            configFile: '',
        };
    }
}

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
    try {
        await invoke('read_file', { path });
        return true;
    } catch {
        return false;
    }
}

/**
 * Extract project name from config file
 */
async function getProjectName(configPath: string, format: 'json' | 'toml'): Promise<string | undefined> {
    try {
        const content = await invoke<string>('read_file', { path: configPath });

        if (format === 'json') {
            const parsed = JSON.parse(content);
            return parsed.name;
        } else if (format === 'toml') {
            // Simple TOML parsing for name field
            const match = content.match(/(?:^|\n)\s*name\s*=\s*"([^"]+)"/);
            return match ? match[1] : undefined;
        }
    } catch (e) {
        console.error(`Failed to parse project name from ${configPath}:`, e);
    }
    return undefined;
}

/**
 * Get project type icon
 */
export function getProjectTypeIcon(type: ProjectType): string {
    switch (type) {
        case 'nodejs':
            return '⬢'; // Node.js hexagon
        case 'rust':
            return '🦀'; // Rust crab
        case 'python':
            return '🐍'; // Python snake
        default:
            return '📁'; // Generic folder
    }
}

/**
 * Get project type color
 */
export function getProjectTypeColor(type: ProjectType): string {
    switch (type) {
        case 'nodejs':
            return '#68a063'; // Node green
        case 'rust':
            return '#ce422b'; // Rust orange
        case 'python':
            return '#3776ab'; // Python blue
        default:
            return '#64748b'; // Gray
    }
}

/**
 * Get project type display name
 */
export function getProjectTypeDisplayName(type: ProjectType): string {
    switch (type) {
        case 'nodejs':
            return 'Node.js';
        case 'rust':
            return 'Rust';
        case 'python':
            return 'Python';
        default:
            return 'Unknown';
    }
}
