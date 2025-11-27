// Diagnostics types and utilities for LSP integration

/**
 * LSP Diagnostic interface (subset of LSP spec)
 */
export interface Diagnostic {
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    severity?: number;  // 1=Error, 2=Warning, 3=Info, 4=Hint
    message: string;
    source?: string;  // e.g. "rust-analyzer", "eslint"
    code?: string | number;
}

/**
 * Diagnostics grouped by file
 */
export interface FileDiagnostics {
    uri: string;
    language: string;
    diagnostics: Diagnostic[];
}

/**
 * LSP severities
 */
export enum DiagnosticSeverity {
    Error = 1,
    Warning = 2,
    Info = 3,
    Hint = 4,
}

/**
 * Get human-readable label from LSP severity number
 */
export function getDiagnosticSeverityLabel(severity: number | undefined): string {
    switch (severity) {
        case DiagnosticSeverity.Error:
            return "Error";
        case DiagnosticSeverity.Warning:
            return "Warning";
        case DiagnosticSeverity.Info:
            return "Info";
        case DiagnosticSeverity.Hint:
            return "Hint";
        default:
            return "Unknown";
    }
}

/**
 * Get Tailwind color class from LSP severity
 */
export function getDiagnosticSeverityColor(severity: number | undefined): string {
    switch (severity) {
        case DiagnosticSeverity.Error:
            return "text-red-500";
        case DiagnosticSeverity.Warning:
            return "text-yellow-500";
        case DiagnosticSeverity.Info:
            return "text-blue-500";
        case DiagnosticSeverity.Hint:
            return "text-gray-500";
        default:
            return "text-gray-400";
    }
}

/**
 * Get icon for severity
 */
export function getDiagnosticSeverityIcon(severity: number | undefined): string {
    switch (severity) {
        case DiagnosticSeverity.Error:
            return "×";  // X mark
        case DiagnosticSeverity.Warning:
            return "⚠";  // Warning triangle
        case DiagnosticSeverity.Info:
            return "ℹ";  // Info  
        case DiagnosticSeverity.Hint:
            return "💡"; // Light bulb
        default:
            return "•";  // Bullet
    }
}

/**
 * Convert file:// URI to filesystem path
 * Example: "file:///home/user/project/src/main.rs" -> "/home/user/project/src/main.rs"
 */
export function uriToPath(uri: string): string {
    if (uri.startsWith("file://")) {
        // Decode URI components (handles %20 for spaces, etc.)
        let path = decodeURIComponent(uri.substring(7));

        // On Windows, handle drive letters: file:///C:/path -> C:/path
        if (path.match(/^\/[a-zA-Z]:\//)) {
            path = path.substring(1);
        }

        return path;
    }
    return uri;  // Return as-is if not a file:// URI
}

/**
 * Convert filesystem path to file:// URI
 * Example: "/home/user/project/src/main.rs" -> "file:///home/user/project/src/main.rs"
 */
export function pathToUri(path: string): string {
    // Normalize path separators for Windows
    const normalized = path.replace(/\\/g, "/");

    // Check if already a URI
    if (normalized.startsWith("file://")) {
        return normalized;
    }

    // Handle Windows drive letters: C:/path -> /C:/path  
    if (normalized.match(/^[a-zA-Z]:\//)) {
        return `file:///${normalized}`;
    }

    // Unix-style absolute path
    if (normalized.startsWith("/")) {
        return `file://${normalized}`;
    }

    // Relative path - prepend current working directory assumption
    return `file:///${normalized}`;
}

/**
 * Get relative path from workspace root for display
 */
export function getRelativePath(path: string, workspaceRoot: string): string {
    const normalized = path.replace(/\\/g, "/");
    const rootNormalized = workspaceRoot.replace(/\\/g, "/");

    if (normalized.startsWith(rootNormalized)) {
        return normalized.substring(rootNormalized.length).replace(/^\//, "");
    }

    return path;
}

/**
 * Get just the filename from a path
 */
export function getFileName(path: string): string {
    return path.split(/[/\\]/).pop() || path;
}
