import { Dialog } from "./Dialog";
import { useTheme } from "../hooks/useTheme";
import { useState } from "react";
import type { WorkspaceSettings } from "../lib/workspaceSettings";

interface SettingsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    workspaceSettings?: WorkspaceSettings;
    onSaveWorkspaceSettings?: (settings: WorkspaceSettings) => void;
}

export function SettingsDialog({ isOpen, onClose, workspaceSettings, onSaveWorkspaceSettings }: SettingsDialogProps) {
    const { theme, setTheme } = useTheme();
    const [fontSize, setFontSize] = useState(() => {
        const saved = localStorage.getItem("editor-font-size");
        return saved ? parseInt(saved, 10) : 14;
    });

    const handleFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newSize = parseInt(e.target.value, 10);
        setFontSize(newSize);
        localStorage.setItem("editor-font-size", newSize.toString());
        window.dispatchEvent(new CustomEvent("font-size-changed", { detail: newSize }));
    };

    return (
        <Dialog isOpen={isOpen} onClose={onClose} title="Settings">
            <div className="space-y-6 py-4">
                <div className="space-y-2">
                    <h3 className="text-sm font-medium leading-none">Appearance</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            className={`flex flex-col items-center justify-center rounded-md border-2 p-4 hover:bg-accent hover:text-accent-foreground transition-colors ${theme === "light" ? "border-primary bg-accent" : "border-muted"}`}
                            onClick={() => setTheme("light")}
                        >
                            <div className="h-4 w-4 rounded-full bg-[#ffffff] border border-gray-400 mb-2" />
                            <span className="text-xs font-medium">Light</span>
                        </button>
                        <button
                            className={`flex flex-col items-center justify-center rounded-md border-2 p-4 hover:bg-accent hover:text-accent-foreground transition-colors ${theme === "dark" ? "border-primary bg-accent" : "border-muted"}`}
                            onClick={() => setTheme("dark")}
                        >
                            <div className="h-4 w-4 rounded-full bg-[#1e1e1e] border border-gray-600 mb-2" />
                            <span className="text-xs font-medium">Dark</span>
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between">
                        <label className="text-sm font-medium leading-none">Editor Font Size</label>
                        <span className="text-sm text-muted-foreground">{fontSize}px</span>
                    </div>
                    <input
                        type="range"
                        min="10"
                        max="24"
                        step="1"
                        value={fontSize}
                        onChange={handleFontSizeChange}
                        className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                </div>

                {workspaceSettings && onSaveWorkspaceSettings && (
                    <>
                        <div className="border-t border-border pt-4">
                            <h3 className="text-sm font-medium leading-none mb-3">Workspace Settings</h3>
                            <p className="text-xs text-muted-foreground mb-4">
                                These settings are saved to .nexus/settings.json in your workspace
                            </p>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm">Tab Size</label>
                                    <select
                                        value={workspaceSettings.editor.tabSize}
                                        onChange={(e) => onSaveWorkspaceSettings({
                                            ...workspaceSettings,
                                            editor: { ...workspaceSettings.editor, tabSize: parseInt(e.target.value) }
                                        })}
                                        className="px-2 py-1 rounded bg-input text-sm"
                                    >
                                        <option value="2">2 spaces</option>
                                        <option value="4">4 spaces</option>
                                        <option value="8">8 spaces</option>
                                    </select>
                                </div>

                                <div className="flex justify-between items-center">
                                    <label className="text-sm">Format on Save</label>
                                    <input
                                        type="checkbox"
                                        checked={workspaceSettings.formatting.formatOnSave}
                                        onChange={(e) => onSaveWorkspaceSettings({
                                            ...workspaceSettings,
                                            formatting: { ...workspaceSettings.formatting, formatOnSave: e.target.checked }
                                        })}
                                        className="w-4 h-4"
                                    />
                                </div>

                                <div className="flex justify-between items-center">
                                    <label className="text-sm">Word Wrap</label>
                                    <select
                                        value={workspaceSettings.editor.wordWrap}
                                        onChange={(e) => onSaveWorkspaceSettings({
                                            ...workspaceSettings,
                                            editor: { ...workspaceSettings.editor, wordWrap: e.target.value as 'off' | 'on' }
                                        })}
                                        className="px-2 py-1 rounded bg-input text-sm"
                                    >
                                        <option value="off">Off</option>
                                        <option value="on">On</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                <div className="space-y-2 border-t border-border pt-4">
                    <h3 className="text-sm font-medium leading-none">AI Provider Configuration</h3>
                    <p className="text-xs text-muted-foreground">
                        AI provider API keys are configured via environment variables (OPENAI_API_KEY, ANTHROPIC_API_KEY, CHUTES_API_TOKEN).
                        Set these in your shell environment before starting the IDE.
                    </p>
                </div>
            </div>
            <div className="flex justify-end mt-4">
                <button
                    onClick={onClose}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors text-sm font-medium"
                >
                    Close
                </button>
            </div>
        </Dialog>
    );
}
