export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    description?: string;
    main: string;
}

export interface PluginInfo {
    dir_name: string;
    manifest: PluginManifest;
}

export interface Command {
    id: string;
    title: string;
    action: () => void;
}

export interface Plugin {
    info: PluginInfo;
    isActive: boolean;
    error?: string;
}
