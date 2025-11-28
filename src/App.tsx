import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from '@tauri-apps/plugin-dialog';
import "./App.css";
import {
  FilePlus,
  FolderOpen,
  Command,
  X
} from "lucide-react";
import { Editor } from "./components/Editor";
import { FileTree } from "./components/FileTree";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { TabBar } from "./components/TabBar";
import { Terminal } from "./components/Terminal";
import { SearchPanel } from "./components/SearchPanel";
import { SourceControlPanel } from "./components/SourceControlPanel";
import { OutlinePanel } from "./components/OutlinePanel";
import { RunDebugPanel } from "./components/RunDebugPanel";
import { PluginsPanel } from "./components/PluginsPanel";
import { AIChatPanel } from "./components/AIChatPanel";
import { StatusBar } from "./components/StatusBar";
import { ResourceCreationDialog } from "./components/ResourceCreationDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { CommandPalette } from "./components/CommandPalette";
import { ErrorContainer } from "./components/ErrorContainer";
import { GoToSymbolModal } from "./components/GoToSymbolModal";
import { DiagnosticsModal } from "./components/DiagnosticsModal";
import { useFileSystem } from "./hooks/useFileSystem";
import { useLspHandlers } from "./hooks/useLspHandlers";
import { useDiagnostics } from "./hooks/useDiagnostics";
import { usePlugins } from "./hooks/usePlugins";
import { useCommands } from "./hooks/useCommands";
import { useAISession } from "./hooks/useAISession";
import { useTerminalState } from "./hooks/useTerminalState";
import { getLspKey, getMonacoLanguage } from "./lib/languageConfig";
import { defaultSettings, loadWorkspaceSettings, saveWorkspaceSettings, WorkspaceSettings } from "./lib/workspaceSettings";
import { detectProjectType, getProjectTypeDisplayName } from "./lib/projectDetection";
import { useToast } from "./components/Toast";
import { GitStatus } from "./types/git";

import OfflineAlert from "./components/OfflineAlert";
import { Logger } from "./lib/Logger";



function App() {
  const [lspStatus, setLspStatus] = useState<"stopped" | "running" | "error">("stopped");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('nexus-sidebar-width');
    return saved ? parseInt(saved, 10) : 250;
  });
  const [activeTab, setActiveTab] = useState<"explorer" | "search" | "git" | "ai" | "outline" | "run" | "plugins">("explorer");
  const [isCreateFileOpen, setIsCreateFileOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGoToSymbolOpen, setIsGoToSymbolOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const { addToast: toast } = useToast();

  // Terminal State
  const {
    isOpen: terminalOpen,
    setIsOpen: setTerminalOpen,
    terminalId,
    setTerminalId,
    runFile,
    toggleTerminal
  } = useTerminalState();

  const [bottomPanelHeight, setBottomPanelHeight] = useState(() => {
    const saved = localStorage.getItem('nexus-panel-height');
    return saved ? parseInt(saved, 10) : 200;
  });

  // Error Container State
  const [errorContainerVisible, setErrorContainerVisible] = useState(false);

  // Editor State
  const [jumpToLocation, setJumpToLocation] = useState<{ line: number; column: number } | null>(null);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({ line: 1, col: 1 });

  const handleCursorChange = useCallback((line: number, col: number) => {
    setCursorPos({ line, col });
  }, []);

  const handleJumpComplete = useCallback(() => {
    setJumpToLocation(null);
  }, []);

  // AI Session
  const aiSession = useAISession();

  // Command Palette
  const commands = useCommands();

  // Git State
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitBusy, setGitBusy] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const gitStatusRef = useRef<GitStatus | null>(null);

  useEffect(() => {
    gitStatusRef.current = gitStatus;
  }, [gitStatus]);

  // Offline Detection
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    Logger.info("Nexus IDE Frontend Started");
  }, []);

  // Workspace Settings
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>(defaultSettings);

  // Resizing State
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingBottom, setIsResizingBottom] = useState(false);

  const startResizingSidebar = useCallback(() => setIsResizingSidebar(true), []);
  const startResizingBottom = useCallback(() => setIsResizingBottom(true), []);
  const stopResizing = useCallback(() => {
    setIsResizingSidebar(false);
    setIsResizingBottom(false);
  }, []);

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizingSidebar) {
      const newWidth = mouseMoveEvent.clientX - 48; // Adjust for sidebar width (48px)
      if (newWidth > 150 && newWidth < 800) {
        setSidebarWidth(newWidth);
        localStorage.setItem('nexus-sidebar-width', newWidth.toString());
      }
    }
    if (isResizingBottom) {
      const newHeight = window.innerHeight - mouseMoveEvent.clientY;
      setBottomPanelHeight(newHeight);
      localStorage.setItem('nexus-panel-height', newHeight.toString());
    }
  }, [isResizingSidebar, isResizingBottom]);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  // Command Palette Shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'p') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const {
    openFiles,
    activeFile,
    fileStates,
    workspaceRoots,
    addWorkspaceRoot,
    replaceWorkspaceRoots,
    handleFileSelect: fsHandleFileSelect,
    handleTabClose: fsHandleTabClose,
    handleSave: fsHandleSave,
    handleCreateFile: fsHandleCreateFile,
    handleCreateFolder: fsHandleCreateFolder,
    updateFileState,
    triggerAutoSave
  } = useFileSystem(lspStatus, setLspStatus);

  // Register LSP handlers
  useLspHandlers(fileStates, updateFileState);

  // Get diagnostics
  const { getAllDiagnostics } = useDiagnostics();

  // Plugins
  const { plugins, isLoading: pluginsLoading, refreshPlugins } = usePlugins();

  // Derived current path (first root)
  const currentPath = workspaceRoots.length > 0 ? workspaceRoots[0] : null;

  useEffect(() => {
    invoke<string>("get_default_path")
      .then(async (path) => {
        // Initialize with default path if no roots exist
        if (workspaceRoots.length === 0) {
          replaceWorkspaceRoots([path]);
        }
      })
      .catch((err) => {
        console.error(err);
        toast("Failed to get default path", "error");
      });
  }, [toast, addWorkspaceRoot, replaceWorkspaceRoots, workspaceRoots.length]);

  // Detect project type when workspace changes
  useEffect(() => {
    if (!currentPath) return;

    void detectProjectType(currentPath).then(info => {
      if (info.type !== 'unknown') {
        console.log(`Detected ${getProjectTypeDisplayName(info.type)} project: ${info.name || info.configFile}`);
      }
    }).catch(err => {
      console.error('Project detection failed:', err);
    });
  }, [currentPath]);

  // Load workspace settings when workspace changes
  useEffect(() => {
    if (!currentPath) return;

    void loadWorkspaceSettings(currentPath).then(settings => {
      setWorkspaceSettings(settings);
      console.log('Loaded workspace settings:', settings);

      // Apply editor font size from settings
      if (settings.editor.fontSize) {
        localStorage.setItem('editor-font-size', settings.editor.fontSize.toString());
        window.dispatchEvent(new CustomEvent('font-size-changed', { detail: settings.editor.fontSize }));
      }
    }).catch(err => {
      console.error('Failed to load workspace settings:', err);
    });
  }, [currentPath]);

  // Save workspace settings function
  const handleSaveWorkspaceSettings = useCallback(async (newSettings: WorkspaceSettings) => {
    if (!currentPath) return;

    try {
      await saveWorkspaceSettings(currentPath, newSettings);
      setWorkspaceSettings(newSettings);
      toast('Workspace settings saved', "success");
    } catch (e) {
      toast('Failed to save workspace settings', "error");
    }
  }, [currentPath, toast]);

  // Global async error handling encapsulated in React effect
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Ignore manual cancellation errors
      if (event.reason && typeof event.reason === 'object') {
        const reason = event.reason as any;
        if (reason.type === 'cancelation' || reason.msg === 'operation is manually canceled') {
          event.preventDefault();
          return;
        }
      }

      console.error('Unhandled Promise Rejection:', event.reason);
      const message = event.reason instanceof Error
        ? event.reason.message
        : String(event.reason);
      toast(`Error: ${message}`, 'error');
      event.preventDefault();
    };

    const handleError = (event: ErrorEvent) => {
      console.error('Uncaught Error:', event.error);
      const message = event.error instanceof Error
        ? event.error.message
        : String(event.message);
      toast(`Error: ${message}`, 'error');
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, [toast]);

  // Git Polling with exponential backoff
  const fetchGitStatus = useCallback(async (): Promise<GitStatus | null> => {
    if (!currentPath || gitBusy) {
      return gitStatusRef.current;
    }

    try {
      const status = await invoke<GitStatus>("git_status", { path: currentPath });
      setGitStatus(status);
      gitStatusRef.current = status;
      return status;
    } catch (e) {
      const errStr = String(e);
      if (!errStr.includes("not a git repository")) {
        console.warn("Git status check failed:", e);
      }
      setGitStatus(null);
      gitStatusRef.current = null;
      return null;
    }
  }, [currentPath, gitBusy]);

  useEffect(() => {
    if (!currentPath) return;

    // Initial fetch
    void fetchGitStatus();

    // Listen for file changes
    const unlistenPromise = listen("file-change", (event) => {
      // Debounce or just trigger? Backend already debounces.
      // But multiple events might come in burst.
      // Let's just trigger refresh.
      console.log("File change detected:", event.payload);
      void fetchGitStatus();
      setRefreshTrigger(prev => prev + 1);
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, [currentPath, fetchGitStatus]);

  const handleOpenFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });

      if (selected) {
        const path = Array.isArray(selected) ? selected[0] : selected;
        if (path) {
          replaceWorkspaceRoots([path]);
        }
      }
    } catch (e) {
      console.error("Failed to open folder:", e);
      toast("Failed to open folder", "error");
    }
  };

  const handleAddFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });

      const path = Array.isArray(selected) ? selected[0] : selected;
      if (path) {
        await addWorkspaceRoot(path);
      }
    } catch (e) {
      console.error("Failed to add folder:", e);
      toast("Failed to add folder", "error");
    }
  }, [addWorkspaceRoot, toast]);

  const handleFileNavigation = async (path: string, line?: number, col?: number) => {
    try {
      await fsHandleFileSelect(path);
      if (line !== undefined) {
        // Small delay to ensure editor is ready
        setTimeout(() => {
          setJumpToLocation({ line, column: col || 1 });
        }, 50);
      }
    } catch (e) {
      console.error("Failed to navigate to file:", e);
      toast(`Failed to open file: ${String(e)}`, "error");
    }
  };

  const handleSave = useCallback(async () => {
    if (activeFile) {
      const content = fileStates.get(activeFile)?.content;
      try {
        await fsHandleSave(content);
      } catch (err) {
        console.error("Failed to save:", err);
        toast("Failed to save file", "error");
      }
    }
  }, [activeFile, fileStates, fsHandleSave, toast]);

  const handleRun = useCallback(async () => {
    if (activeFile) {
      const content = fileStates.get(activeFile)?.content;
      try {
        await runFile(activeFile, () => fsHandleSave(content));
      } catch (e) {
        console.error(e);
      }
    }
  }, [activeFile, fileStates, runFile, fsHandleSave]);

  // Register core commands
  useEffect(() => {
    // File operations
    commands.registerCommand({
      id: 'file.save',
      label: 'Save File',
      description: 'Save the current file',
      category: 'File',
      keybinding: 'Cmd+S',
      execute: () => handleSave(),
      when: () => !!activeFile,
    });

    commands.registerCommand({
      id: 'file.run',
      label: 'Run File',
      description: 'Run the current file',
      category: 'File',
      keybinding: 'Cmd+R',
      execute: () => handleRun(),
      when: () => !!activeFile,
    });

    commands.registerCommand({
      id: 'file.new',
      label: 'New File',
      description: 'Create a new file',
      category: 'File',
      execute: () => setIsCreateFileOpen(true),
    });

    commands.registerCommand({
      id: 'folder.open',
      label: 'Open Folder',
      description: 'Open a folder',
      category: 'File',
      execute: () => handleOpenFolder(),
    });

    // Panel toggles
    commands.registerCommand({
      id: 'panel.toggleSidebar',
      label: 'Toggle Sidebar',
      description: 'Show/hide the sidebar',
      category: 'View',
      keybinding: 'Cmd+B',
      execute: () => setSidebarOpen(prev => !prev),
    });

    commands.registerCommand({
      id: 'panel.toggleTerminal',
      label: 'Toggle Terminal',
      description: 'Show/hide the terminal',
      category: 'View',
      execute: toggleTerminal,
    });

    // Panel switching
    commands.registerCommand({
      id: 'panel.showExplorer',
      label: 'Show Explorer',
      description: 'Open the file explorer panel',
      category: 'View',
      execute: () => {
        setActiveTab('explorer');
        setSidebarOpen(true);
      },
    });

    commands.registerCommand({
      id: 'panel.showSearch',
      label: 'Show Search',
      description: 'Open the search panel',
      category: 'View',
      execute: () => {
        setActiveTab('search');
        setSidebarOpen(true);
      },
    });

    commands.registerCommand({
      id: 'panel.showGit',
      label: 'Show Source Control',
      description: 'Open the source control panel',
      category: 'View',
      execute: () => {
        setActiveTab('git');
        setSidebarOpen(true);
      },
    });

    commands.registerCommand({
      id: 'panel.showAI',
      label: 'Show AI Panel',
      description: 'Open the AI chat panel',
      category: 'View',
      execute: () => {
        setActiveTab('ai');
        setSidebarOpen(true);
      },
    });

    // AI actions
    commands.registerCommand({
      id: 'ai.explain',
      label: 'AI: Explain Code',
      description: 'Ask AI to explain selected code',
      category: 'AI',
      execute: () => {
        setActiveTab('ai');
        setSidebarOpen(true);
        void aiSession.sendPrompt('Explain the selected code');
      },
    });

    // Settings
    commands.registerCommand({
      id: 'settings.open',
      label: 'Open Settings',
      description: 'Open IDE settings',
      category: 'Settings',
      execute: () => setIsSettingsOpen(true),
    });

    // Diagnostics
    commands.registerCommand({
      id: 'workbench.action.diagnostics',
      label: 'Run Diagnostics',
      description: 'Run system diagnostics and tests',
      category: 'Help',
      execute: () => setIsDiagnosticsOpen(true),
    });

    return () => {
      commands.clearCommands();
    };
  }, [activeFile, handleSave, handleRun, handleOpenFolder, toggleTerminal, aiSession, commands]);

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      {isOffline && <OfflineAlert />}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        items={commands.getAvailableCommands()}
        onSelect={(id) => commands.executeCommand(id)}
      />

      <TitleBar
        isSidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        isPanelOpen={errorContainerVisible}
        onTogglePanel={() => setErrorContainerVisible(!errorContainerVisible)}
        onOpenAgentManager={() => { /* TODO */ }}
        onNewFile={() => setIsCreateFileOpen(true)}
        onNewFolder={() => setIsCreateFolderOpen(true)}
        onOpenFolder={() => void handleOpenFolder()}
        onSave={() => {
          if (activeFile) {
            const content = fileStates.get(activeFile)?.content;
            fsHandleSave(content).catch(err => {
              console.error("Failed to save:", err);
              toast("Failed to save file", "error");
            });
          }
        }}
        onCloseFile={() => activeFile && fsHandleTabClose(activeFile)}
        onSettings={() => setIsSettingsOpen(true)}
        onRun={() => {
          if (activeFile) {
            const content = fileStates.get(activeFile)?.content;
            runFile(activeFile, () => fsHandleSave(content)).catch(console.error);
          }
        }}
        onToggleTerminal={toggleTerminal}
        onSwitchToExplorer={() => setActiveTab("explorer")}
        onSwitchToSearch={() => setActiveTab("search")}
        onSwitchToAI={() => setActiveTab("ai")}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar (Sidebar) */}
        <Sidebar
          onOpenFolder={handleOpenFolder}
          onAddFolder={() => { void handleAddFolder(); }}
          onNewFile={() => setIsCreateFileOpen(true)}
          onNewFolder={() => setIsCreateFolderOpen(true)}
          onToggleTerminal={toggleTerminal}
          terminalOpen={terminalOpen}
          onToggleError={() => setErrorContainerVisible(!errorContainerVisible)}
          errorVisible={errorContainerVisible}
          onToggleFileTree={() => setSidebarOpen(!sidebarOpen)}
          onSettings={() => setIsSettingsOpen(true)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Side Panel (Resizable) */}
        {sidebarOpen && (
          <div style={{ width: sidebarWidth }} className="flex flex-col border-r border-border bg-muted/10 relative">
            {/* Resizer */}
            <div
              className="absolute top-0 bottom-0 right-0 w-1 cursor-col-resize hover:bg-primary/50 z-10"
              onMouseDown={startResizingSidebar}
            />

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === "explorer" && (
                <FileTree
                  workspaceRoots={workspaceRoots}
                  onFileSelect={(path) => fsHandleFileSelect(path).catch(console.error)}
                  refreshTrigger={refreshTrigger}
                />
              )}
              {activeTab === "search" && (
                <SearchPanel
                  path={workspaceRoots[0] || ""}
                  onFileSelect={(path, line) => void handleFileNavigation(path, line)}
                />
              )}
              {activeTab === "git" && (
                <SourceControlPanel
                  path={workspaceRoots[0] || ""}
                  gitStatus={gitStatus}
                  onRefresh={() => void fetchGitStatus()}
                  onBusyChange={setGitBusy}
                />
              )}
              {activeTab === "outline" && (
                <OutlinePanel
                  filePath={activeFile || ""}
                  monacoLanguage={activeFile ? getMonacoLanguage(activeFile) : "plaintext"}
                  lspKey={activeFile ? getLspKey(activeFile) : null}
                  onSelect={(line) => activeFile && handleFileNavigation(activeFile, line)}
                />
              )}
              {activeTab === "run" && (
                <RunDebugPanel
                  workspaceRoot={workspaceRoots[0] || ""}
                  onEditTasks={() => { }}
                  onEditLaunchConfig={() => { }}
                  terminalId={terminalId}
                  openTerminal={() => setTerminalOpen(true)}
                />
              )}
              {activeTab === "plugins" && (
                <Suspense fallback={<div className="p-4">Loading plugins...</div>}>
                  <PluginsPanel
                    plugins={plugins}
                    onRefresh={refreshPlugins}
                    isLoading={pluginsLoading}
                  />
                </Suspense>
              )}
              {activeTab === "ai" && (
                <AIChatPanel
                  session={aiSession}
                  onClose={() => setActiveTab("explorer")}
                />
              )}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          <TabBar
            openFiles={openFiles}
            activeFile={activeFile}
            onTabSelect={(path) => fsHandleFileSelect(path).catch(console.error)}
            onTabClose={fsHandleTabClose}
          />

          <div className="flex-1 relative">
            {activeFile ? (
              <Suspense fallback={<div className="flex items-center justify-center h-full">Loading Editor...</div>}>
                <Editor
                  path={activeFile}
                  value={fileStates.get(activeFile)?.content || ""}
                  language={getMonacoLanguage(activeFile)}
                  onChange={(value) => {
                    updateFileState(activeFile, { content: value, isDirty: true });
                    triggerAutoSave(activeFile, value || "");
                  }}
                  onCursorChange={handleCursorChange}
                  onJumpComplete={handleJumpComplete}
                  jumpTo={jumpToLocation}
                />
              </Suspense>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <div className="mb-4 p-4 bg-muted/20 rounded-full">
                  <Command size={48} className="opacity-20" />
                </div>
                <p className="text-lg font-medium mb-2">Welcome to Nexus IDE</p>
                <p className="text-sm opacity-60 max-w-md text-center">
                  Open a file to start editing, or use the command palette (Ctrl+Shift+P) to run commands.
                </p>
                <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
                  <button onClick={() => setIsCreateFileOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-muted/30 hover:bg-muted/50 rounded-md transition-colors">
                    <FilePlus size={16} /> New File
                  </button>
                  <button onClick={() => handleOpenFolder()} className="flex items-center gap-2 px-4 py-2 bg-muted/30 hover:bg-muted/50 rounded-md transition-colors">
                    <FolderOpen size={16} /> Open Folder
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Error Panel (Bottom) */}
          {errorContainerVisible && (
            <div className="border-t border-border h-48">
              <ErrorContainer
                activeFile={activeFile}
                workspaceRoot={workspaceRoots[0] || ""}
                diagnostics={getAllDiagnostics()}
                visible={true}
                onSelectLocation={(path, line, col) => void handleFileNavigation(path, line, col)}
                onClose={() => setErrorContainerVisible(false)}
              />
            </div>
          )}

          {/* Terminal Panel */}
          <div className={`border-t border-border bg-card transition-all duration-300 ease-in-out ${terminalOpen ? "" : "h-0 overflow-hidden"}`} style={{ height: terminalOpen ? bottomPanelHeight : 0 }}>
            <div className="h-full relative">
              {/* Resizer Handle */}
              <div
                className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-primary/50 z-10"
                onMouseDown={startResizingBottom}
              />
              <Terminal
                visible={terminalOpen}
                onTerminalReady={setTerminalId}
              />
              <button
                className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground bg-background/50 rounded z-20"
                onClick={() => setTerminalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        language={activeFile ? getMonacoLanguage(activeFile) : "plaintext"}
        cursorLine={cursorPos.line}
        cursorCol={cursorPos.col}
        lspStatus={lspStatus}
        gitBranch={gitStatus?.branch}
      />

      {/* Dialogs */}
      <ResourceCreationDialog
        key="create-file-dialog"
        isOpen={isCreateFileOpen}
        onClose={() => setIsCreateFileOpen(false)}
        title="Create New File"
        type="file"
        workspaceRoots={workspaceRoots}
        onConfirm={(path) => {
          void fsHandleCreateFile(path);
        }}
      />

      <ResourceCreationDialog
        key="create-folder-dialog"
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        title="Create New Folder"
        type="folder"
        workspaceRoots={workspaceRoots}
        onConfirm={(path) => {
          fsHandleCreateFolder(path)
            .then(() => {
              toast("Folder created successfully", "success");
              setIsCreateFolderOpen(false);
            })
            .catch((error: Error) => {
              toast(`Failed to create folder: ${error.message}`, "error");
            });
        }}
      />

      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        workspaceSettings={workspaceSettings}
        onSaveWorkspaceSettings={handleSaveWorkspaceSettings}
      />

      <GoToSymbolModal
        isOpen={isGoToSymbolOpen}
        onClose={() => setIsGoToSymbolOpen(false)}
        lspKey={activeFile ? getLspKey(activeFile) || "" : ""}
        onSelect={(uri, line) => {
          const path = uri.replace('file://', '');
          void handleFileNavigation(path, line);
        }}
      />

      {isDiagnosticsOpen && (
        <DiagnosticsModal onClose={() => setIsDiagnosticsOpen(false)} />
      )}
    </div>
  );
}

export default App;
