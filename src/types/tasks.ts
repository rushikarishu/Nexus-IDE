export interface TaskDefinition {
    label: string;
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
}
