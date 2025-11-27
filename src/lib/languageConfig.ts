// Language configuration for the frontend

export interface LanguageMapping {
    monacoId: string;      // Monaco editor language ID
    lspKey: string;        // Backend LSP server key
    displayName: string;   // Human-readable name
    extensions: string[];  // File extensions
}

export const LANGUAGE_MAPPINGS: LanguageMapping[] = [
    {
        monacoId: "rust",
        lspKey: "rust",
        displayName: "Rust",
        extensions: [".rs"]
    },
    {
        monacoId: "python",
        lspKey: "python",
        displayName: "Python",
        extensions: [".py"]
    },
    {
        monacoId: "typescript",
        lspKey: "typescript",
        displayName: "TypeScript",
        extensions: [".ts", ".tsx"]
    },
    {
        monacoId: "javascript",
        lspKey: "javascript",
        displayName: "JavaScript",
        extensions: [".js", ".jsx"]
    },
    {
        monacoId: "go",
        lspKey: "go",
        displayName: "Go",
        extensions: [".go"]
    },
    {
        monacoId: "java",
        lspKey: "java",
        displayName: "Java",
        extensions: [".java"]
    },
    {
        monacoId: "c",
        lspKey: "c",
        displayName: "C",
        extensions: [".c", ".h"]
    },
    {
        monacoId: "cpp",
        lspKey: "cpp",
        displayName: "C++",
        extensions: [".cpp", ".cc", ".cxx", ".hpp", ".h++", ".hxx"]
    },
    {
        monacoId: "csharp",
        lspKey: "csharp",
        displayName: "C#",
        extensions: [".cs"]
    },
    {
        monacoId: "php",
        lspKey: "php",
        displayName: "PHP",
        extensions: [".php"]
    },
    {
        monacoId: "ruby",
        lspKey: "ruby",
        displayName: "Ruby",
        extensions: [".rb"]
    },
    {
        monacoId: "shellscript",
        lspKey: "bash",
        displayName: "Bash",
        extensions: [".sh", ".bash"]
    },
    // Common additional languages without LSP (syntax highlighting only)
    {
        monacoId: "json",
        lspKey: "", // No LSP
        displayName: "JSON",
        extensions: [".json"]
    },
    {
        monacoId: "css",
        lspKey: "", // No LSP
        displayName: "CSS",
        extensions: [".css"]
    },
    {
        monacoId: "html",
        lspKey: "", // No LSP
        displayName: "HTML",
        extensions: [".html", ".htm"]
    },
    {
        monacoId: "markdown",
        lspKey: "", // No LSP
        displayName: "Markdown",
        extensions: [".md", ".markdown"]
    }
];

/**
 * Get language mapping from file path/name
 */
export function getLanguageFromExtension(filePath: string): LanguageMapping | null {
    if (!filePath) return null;

    for (const mapping of LANGUAGE_MAPPINGS) {
        for (const ext of mapping.extensions) {
            if (filePath.endsWith(ext)) {
                return mapping;
            }
        }
    }

    return null;
}

/**
 * Get Monaco editor language ID from file path
 */
export function getMonacoLanguage(filePath: string): string {
    const mapping = getLanguageFromExtension(filePath);
    return mapping?.monacoId || "plaintext";
}

/**
 * Get LSP key from file path (returns null if no LSP support)
 */
export function getLspKey(filePath: string): string | null {
    const mapping = getLanguageFromExtension(filePath);
    return mapping?.lspKey || null;
}

/**
 * Get display name for the language
 */
export function getDisplayName(filePath: string): string {
    const mapping = getLanguageFromExtension(filePath);
    return mapping?.displayName || "Plain Text";
}
