import { useEffect, useState, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
    Minus,
    Square,
    X,
    PanelLeft,
    PanelBottom,
    Bot
} from "lucide-react";

import { MenuDropdown, MenuItem } from "./MenuDropdown";

interface TitleBarProps {
    isSidebarOpen: boolean;
    onToggleSidebar: () => void;
    isPanelOpen: boolean;
    onTogglePanel: () => void;
    onOpenAgentManager: () => void;
    onNewFile: () => void;
    onNewFolder: () => void;
    onOpenFolder: () => void;
    onSave: () => void;
    onCloseFile: () => void;
    onSettings: () => void;
    onRun: () => void;
    onToggleTerminal: () => void;
    onSwitchToExplorer: () => void;
    onSwitchToSearch: () => void;
    onSwitchToAI: () => void;
}

export function TitleBar({
    isSidebarOpen,
    onToggleSidebar,
    isPanelOpen,
    onTogglePanel,
    onOpenAgentManager,
    onNewFile,
    onNewFolder,
    onOpenFolder,
    onSave,
    onCloseFile,
    onSettings,
    onRun,
    onToggleTerminal,
    onSwitchToExplorer,
    onSwitchToSearch,
    onSwitchToAI
}: TitleBarProps) {
    const [isMaximized, setIsMaximized] = useState(false);
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const appWindow = useMemo(() => getCurrentWindow(), []);

    useEffect(() => {
        let unlisten: (() => void) | undefined;

        const checkMaximized = async () => {
            try {
                const maximized = await appWindow.isMaximized();
                setIsMaximized(maximized);
            } catch (error) {
                console.error("Failed to check maximized state:", error);
            }
        };

        const setupListeners = async () => {
            try {
                await checkMaximized();
                unlisten = await appWindow.onResized(checkMaximized);
            } catch (error) {
                console.error("Failed to setup window listeners:", error);
            }
        };

        setupListeners();

        return () => {
            if (unlisten) {
                unlisten();
            }
        };
    }, [appWindow]);



    const minimize = async () => {
        if (process.env.NODE_ENV !== 'production') {

        }
        try {
            if (process.env.NODE_ENV !== 'production') {

            }
            await appWindow.minimize();
            if (process.env.NODE_ENV !== 'production') {

            }
        } catch (error) {
            console.error("Failed to minimize window:", error);
        }
    };

    const toggleMaximize = async () => {
        if (process.env.NODE_ENV !== 'production') {

        }
        try {
            if (process.env.NODE_ENV !== 'production') {

            }
            await appWindow.toggleMaximize();
            setIsMaximized(await appWindow.isMaximized());
            if (process.env.NODE_ENV !== 'production') {

            }
        } catch (error) {
            console.error("Failed to toggle maximize:", error);
        }
    };

    const close = async () => {
        if (process.env.NODE_ENV !== 'production') {

        }
        try {
            if (process.env.NODE_ENV !== 'production') {

            }
            await appWindow.close();
            if (process.env.NODE_ENV !== 'production') {

            }
        } catch (error) {
            console.error("Failed to close window:", error);
        }
    };


    // Menu definitions
    const fileMenu: MenuItem[] = [
        { label: "New File", shortcut: "Ctrl+N", onClick: onNewFile },
        { label: "New Folder", onClick: onNewFolder },
        { separator: true },
        { label: "Open Folder", shortcut: "Ctrl+O", onClick: onOpenFolder },
        { separator: true },
        { label: "Save", shortcut: "Ctrl+S", onClick: onSave },
        { label: "Close File", shortcut: "Ctrl+W", onClick: onCloseFile },
    ];

    const editMenu: MenuItem[] = [
        { label: "Find", shortcut: "Ctrl+F", disabled: true },
        { label: "Replace", shortcut: "Ctrl+H", disabled: true },
        { separator: true },
        { label: "Settings", shortcut: "Ctrl+,", onClick: onSettings },
    ];

    const viewMenu: MenuItem[] = [
        { label: "Toggle Sidebar", shortcut: "Ctrl+B", onClick: onToggleSidebar },
        { label: "Toggle Panel", shortcut: "Ctrl+J", onClick: onTogglePanel },
        { separator: true },
        { label: "Explorer", onClick: onSwitchToExplorer },
        { label: "Search", onClick: onSwitchToSearch },
        { label: "AI Assistant", onClick: onSwitchToAI },
    ];

    const runMenu: MenuItem[] = [
        { label: "Run File", shortcut: "Ctrl+R", onClick: onRun },
    ];

    const terminalMenu: MenuItem[] = [
        { label: "Toggle Terminal", onClick: onToggleTerminal },
    ];

    const menuMap: Record<string, MenuItem[]> = {
        File: fileMenu,
        Edit: editMenu,
        View: viewMenu,
        Run: runMenu,
        Terminal: terminalMenu,
    };

    return (
        <div className="h-8 bg-muted flex items-center justify-between select-none text-muted-foreground text-xs border-b border-border z-50 relative">
            {/* Left Section: Icon & Menus */}
            <div className="flex items-center h-full">
                <div className="px-3 flex items-center justify-center h-full" data-tauri-drag-region>
                    <img src="/vite.svg" alt="Logo" className="w-4 h-4" />
                </div>

                <div className="flex items-center h-full">
                    {["File", "Edit", "View", "Run", "Terminal"].map((menu) => (
                        <MenuDropdown
                            key={menu}
                            trigger={
                                <div className={`px-3 h-8 flex items-center hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors ${openMenu === menu ? "bg-accent text-accent-foreground" : ""}`}>
                                    {menu}
                                </div>
                            }
                            items={menuMap[menu] || []}
                            isOpen={openMenu === menu}
                            onOpenChange={(open) => setOpenMenu(open ? menu : null)}
                        />
                    ))}
                </div>
            </div>

            {/* Center Section: Title - Draggable */}
            <div className="flex-1 text-center font-medium opacity-80" data-tauri-drag-region>
                nexus-ide
            </div>

            {/* Right Section: Actions & Window Controls */}
            <div className="flex items-center h-full">
                {/* Layout Controls */}
                <div className="flex items-center px-2 gap-1 border-r border-border h-full mr-2">
                    <button
                        onClick={onToggleSidebar}
                        className={`p-1 hover:bg-accent hover:text-accent-foreground rounded transition-colors ${isSidebarOpen ? "text-foreground" : ""}`}
                        title="Toggle Sidebar"
                    >
                        <PanelLeft size={14} />
                    </button>
                    <button
                        onClick={onTogglePanel}
                        className={`p-1 hover:bg-accent hover:text-accent-foreground rounded transition-colors ${isPanelOpen ? "text-foreground" : ""}`}
                        title="Toggle Panel"
                    >
                        <PanelBottom size={14} />
                    </button>
                    <button
                        onClick={onOpenAgentManager}
                        className="p-1 hover:bg-accent hover:text-accent-foreground rounded transition-colors"
                        title="Open Agent Manager"
                    >
                        <Bot size={14} />
                    </button>
                </div>

                {/* Window Controls */}
                <div className="flex items-center h-full">
                    <button
                        onClick={() => void minimize()}
                        className="h-full w-10 flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                        <Minus size={14} />
                    </button>
                    <button
                        onClick={() => void toggleMaximize()}
                        className="h-full w-10 flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                        <Square size={12} className={isMaximized ? "fill-current" : ""} />
                    </button>
                    <button
                        onClick={() => void close()}
                        className="h-full w-10 flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}
