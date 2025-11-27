import { GitBranch, Check, AlertCircle } from "lucide-react";

interface StatusBarProps {
    language: string;
    cursorLine?: number;
    cursorCol?: number;
    lspStatus: "stopped" | "running" | "error";
    gitBranch?: string;
    isDirty?: boolean;
    errorCount?: number;
    warningCount?: number;
}

export function StatusBar({ language, cursorLine = 1, cursorCol = 1, lspStatus, gitBranch, isDirty, errorCount = 0, warningCount = 0 }: StatusBarProps) {
    return (
        <div className="h-6 bg-primary text-primary-foreground flex items-center justify-between px-3 text-xs select-none">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 hover:bg-primary-foreground/10 px-1 rounded cursor-pointer">
                    <GitBranch size={10} />
                    <span>{gitBranch || "main"}</span>
                    {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 ml-1" title="Uncommitted changes" />}
                </div>
                <div className="flex items-center gap-1">
                    {lspStatus === "running" && <Check size={10} className="text-green-400" />}
                    {lspStatus === "error" && <AlertCircle size={10} className="text-red-400" />}
                    <span>{lspStatus === "running" ? "Ready" : lspStatus === "error" ? "Error" : "Initializing..."}</span>
                </div>
                {(errorCount > 0 || warningCount > 0) && (
                    <div className="flex items-center gap-2 ml-2">
                        {errorCount > 0 && (
                            <div className="flex items-center gap-1 text-red-400">
                                <AlertCircle size={10} />
                                <span>{errorCount}</span>
                            </div>
                        )}
                        {warningCount > 0 && (
                            <div className="flex items-center gap-1 text-yellow-400">
                                <AlertCircle size={10} />
                                <span>{warningCount}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex items-center gap-4">
                <div className="hover:bg-primary-foreground/10 px-1 rounded cursor-pointer">
                    Ln {cursorLine}, Col {cursorCol}
                </div>
                <div className="hover:bg-primary-foreground/10 px-1 rounded cursor-pointer">
                    UTF-8
                </div>
                <div className="hover:bg-primary-foreground/10 px-1 rounded cursor-pointer font-medium uppercase">
                    {language}
                </div>
            </div>
        </div>
    );
}
