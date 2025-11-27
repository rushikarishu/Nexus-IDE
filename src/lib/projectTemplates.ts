// Project configuration templates for Nexus IDE
import { ProjectType } from './projectDetection';
import { invoke } from '@tauri-apps/api/core';

export interface TaskConfig {
    label: string;
    command: string;
    args?: string[];
    cwd?: string;
    group?: 'build' | 'test' | 'run';
}

export interface LaunchConfig {
    name: string;
    type: string;
    request: 'launch' | 'attach';
    program?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    adapterExecutable?: string;
}

/**
 * Generate tasks.json template for a project type
 */
export function generateTasksTemplate(projectType: ProjectType, projectName?: string): TaskConfig[] {
    switch (projectType) {
        case 'nodejs':
            return [
                {
                    label: 'npm: install',
                    command: 'npm',
                    args: ['install'],
                    group: 'build',
                },
                {
                    label: 'npm: build',
                    command: 'npm',
                    args: ['run', 'build'],
                    group: 'build',
                },
                {
                    label: 'npm: test',
                    command: 'npm',
                    args: ['test'],
                    group: 'test',
                },
                {
                    label: 'npm: start',
                    command: 'npm',
                    args: ['start'],
                    group: 'run',
                },
                {
                    label: 'npm: dev',
                    command: 'npm',
                    args: ['run', 'dev'],
                    group: 'run',
                },
            ];

        case 'rust':
            return [
                {
                    label: 'cargo: build',
                    command: 'cargo',
                    args: ['build'],
                    group: 'build',
                },
                {
                    label: 'cargo: build (release)',
                    command: 'cargo',
                    args: ['build', '--release'],
                    group: 'build',
                },
                {
                    label: 'cargo: test',
                    command: 'cargo',
                    args: ['test'],
                    group: 'test',
                },
                {
                    label: 'cargo: run',
                    command: 'cargo',
                    args: ['run'],
                    group: 'run',
                },
                {
                    label: 'cargo: check',
                    command: 'cargo',
                    args: ['check'],
                    group: 'build',
                },
            ];

        case 'python':
            return [
                {
                    label: 'pip: install',
                    command: 'pip',
                    args: ['install', '-e', '.'],
                    group: 'build',
                },
                {
                    label: 'pytest: run tests',
                    command: 'pytest',
                    group: 'test',
                },
                {
                    label: 'python: run',
                    command: 'python',
                    args: [projectName ? `${projectName}.py` : 'main.py'],
                    group: 'run',
                },
                {
                    label: 'pylint: check',
                    command: 'pylint',
                    args: ['.'],
                    group: 'build',
                },
            ];

        default:
            return [];
    }
}

/**
 * Generate launch.json template for a project type
 */
export function generateLaunchTemplate(projectType: ProjectType, projectName?: string): LaunchConfig[] {
    switch (projectType) {
        case 'nodejs':
            return [
                {
                    name: 'Launch Program',
                    type: 'node',
                    request: 'launch',
                    program: '${workspaceFolder}/index.js',
                    args: [],
                },
                {
                    name: 'Attach to Process',
                    type: 'node',
                    request: 'attach',
                },
            ];

        case 'rust':
            return [
                {
                    name: 'Debug Rust Program',
                    type: 'lldb',
                    request: 'launch',
                    program: `\${workspaceFolder}/target/debug/${projectName || 'app'}`,
                    args: [],
                },
            ];

        case 'python':
            return [
                {
                    name: 'Python: Current File',
                    type: 'python',
                    request: 'launch',
                    program: '${file}',
                    args: [],
                },
                {
                    name: 'Python: Module',
                    type: 'python',
                    request: 'launch',
                    program: '${workspaceFolder}/main.py',
                    args: [],
                },
            ];

        default:
            return [];
    }
}

/**
 * Write tasks configuration to .nexus/tasks.json
 */
export async function writeTasksConfig(
    workspacePath: string,
    tasks: TaskConfig[]
): Promise<boolean> {
    try {
        const nexusDir = `${workspacePath}/.nexus`;
        const tasksPath = `${nexusDir}/tasks.json`;

        // Ensure .nexus directory exists
        try {
            await invoke('create_folder', { path: nexusDir });
        } catch {
            // Directory might already exist
        }

        // Write tasks
        const config = {
            version: '1.0',
            tasks,
        };

        await invoke('write_file', {
            path: tasksPath,
            contents: JSON.stringify(config, null, 2),
        });


        return true;
    } catch (e) {
        console.error('Failed to write tasks configuration:', e);
        return false;
    }
}

/**
 * Write launch configuration to .nexus/launch.json
 */
export async function writeLaunchConfig(
    workspacePath: string,
    configurations: LaunchConfig[]
): Promise<boolean> {
    try {
        const nexusDir = `${workspacePath}/.nexus`;
        const launchPath = `${nexusDir}/launch.json`;

        // Ensure .nexus directory exists
        try {
            await invoke('create_folder', { path: nexusDir });
        } catch {
            // Directory might already exist
        }

        // Write launch config
        const config = {
            version: '1.0',
            configurations,
        };

        await invoke('write_file', {
            path: launchPath,
            contents: JSON.stringify(config, null, 2),
        });


        return true;
    } catch (e) {
        console.error('Failed to write launch configuration:', e);
        return false;
    }
}

/**
 * Check if configuration files already exist
 */
export async function configFilesExist(workspacePath: string): Promise<{
    tasks: boolean;
    launch: boolean;
}> {
    try {
        let tasksExists = false;
        let launchExists = false;

        try {
            await invoke('read_file', { path: `${workspacePath}/.nexus/tasks.json` });
            tasksExists = true;
        } catch {
            // File doesn't exist
        }

        try {
            await invoke('read_file', { path: `${workspacePath}/.nexus/launch.json` });
            launchExists = true;
        } catch {
            // File doesn't exist
        }

        return { tasks: tasksExists, launch: launchExists };
    } catch (e) {
        console.error('Failed to check config files:', e);
        return { tasks: false, launch: false };
    }
}

/**
 * Generate and write all project templates
 */
export async function generateProjectTemplates(
    workspacePath: string,
    projectType: ProjectType,
    projectName?: string,
    force = false
): Promise<{ tasks: boolean; launch: boolean }> {
    if (projectType === 'unknown') {
        return { tasks: false, launch: false };
    }

    // Check if files exist (unless force is true)
    if (!force) {
        const existing = await configFilesExist(workspacePath);
        if (existing.tasks && existing.launch) {

            return { tasks: false, launch: false };
        }
    }

    const tasks = generateTasksTemplate(projectType, projectName);
    const launch = generateLaunchTemplate(projectType, projectName);

    const tasksWritten = await writeTasksConfig(workspacePath, tasks);
    const launchWritten = await writeLaunchConfig(workspacePath, launch);

    return { tasks: tasksWritten, launch: launchWritten };
}
