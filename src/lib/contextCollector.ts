import { invoke } from "@tauri-apps/api/core";
import { getLspClient } from "./lsp";

export interface Position {
    line: number;
    character: number;
}

export interface Range {
    start: Position;
    end: Position;
}

export interface ContextItem {
    file: string;
    content: string;
    relevance: number;
    type: 'definition' | 'reference' | 'import' | 'type' | 'selection';
    startLine?: number;
    endLine?: number;
}

export interface SymbolInfo {
    name: string;
    kind: number;
    location: {
        uri: string;
        range: Range;
    };
}

/**
 * Collect relevant context from multiple files for AI operations
 */
export async function collectContext(
    filePath: string,
    selection: Range,
    lspKey: string | null,
    maxTokens: number = 2000
): Promise<ContextItem[]> {
    const contextItems: ContextItem[] = [];

    try {
        // 1. Get the selected code as primary context
        const selectedContent = await getFileContent(filePath, selection.start.line, selection.end.line);
        if (selectedContent) {
            contextItems.push({
                file: filePath,
                content: selectedContent,
                relevance: 100, // Highest relevance
                type: 'selection',
                startLine: selection.start.line,
                endLine: selection.end.line
            });
        }

        // 2. If LSP is available, gather related symbols
        if (lspKey) {
            const lspClient = getLspClient(lspKey);

            // Get symbols at cursor position (middle of selection)
            const midLine = Math.floor((selection.start.line + selection.end.line) / 2);
            const midChar = Math.floor((selection.start.character + selection.end.character) / 2);

            // Find definitions of symbols in selection
            try {
                const definitions = await lspClient.sendRequest("textDocument/definition", {
                    textDocument: { uri: `file://${filePath}` },
                    position: { line: midLine, character: midChar },
                }) as Array<{ uri: string; range: Range }> | null;

                if (definitions && Array.isArray(definitions)) {
                    for (const def of definitions.slice(0, 3)) { // Limit to 3 definitions
                        const defPath = def.uri.replace('file://', '');
                        if (defPath !== filePath) {
                            const defContent = await getFileContent(
                                defPath,
                                def.range.start.line,
                                def.range.end.line + 10 // Include some context
                            );
                            if (defContent) {
                                contextItems.push({
                                    file: defPath,
                                    content: defContent,
                                    relevance: 80,
                                    type: 'definition',
                                    startLine: def.range.start.line,
                                    endLine: def.range.end.line + 10
                                });
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn("Failed to get definitions:", e);
            }

            // Get type information via hover
            try {
                const hover = await lspClient.sendRequest("textDocument/hover", {
                    textDocument: { uri: `file://${filePath}` },
                    position: { line: midLine, character: midChar },
                }) as { contents: any } | null;

                if (hover && hover.contents) {
                    const hoverText = typeof hover.contents === 'string'
                        ? hover.contents
                        : hover.contents.value || JSON.stringify(hover.contents);

                    contextItems.push({
                        file: filePath,
                        content: `Type information:\n${hoverText}`,
                        relevance: 60,
                        type: 'type'
                    });
                }
            } catch (e) {
                console.warn("Failed to get hover info:", e);
            }
        }

        // 3. Get imports from current file
        const imports = await extractImports(filePath);
        for (const importPath of imports.slice(0, 5)) { // Limit to 5 imports
            try {
                const importContent = await getFileContent(importPath, 0, 50); // First 50 lines
                if (importContent) {
                    contextItems.push({
                        file: importPath,
                        content: importContent,
                        relevance: 40,
                        type: 'import'
                    });
                }
            } catch (e) {
                console.warn(`Failed to read import ${importPath}:`, e);
            }
        }

        // 4. Score and sort by relevance
        contextItems.sort((a, b) => b.relevance - a.relevance);

        // 5. Truncate to fit token budget
        const optimized = optimizeContextForTokens(contextItems, maxTokens);

        return optimized;
    } catch (e) {
        console.error("Failed to collect context:", e);
        return contextItems; // Return what we have
    }
}

/**
 * Get file content for a specific line range
 */
async function getFileContent(
    filePath: string,
    startLine?: number,
    endLine?: number
): Promise<string | null> {
    try {
        const fullContent = await invoke<string>("read_file", { path: filePath });

        if (startLine === undefined || endLine === undefined) {
            return fullContent;
        }

        const lines = fullContent.split('\n');
        const selectedLines = lines.slice(startLine, endLine + 1);
        return selectedLines.join('\n');
    } catch (e) {
        console.error(`Failed to read file ${filePath}:`, e);
        return null;
    }
}

/**
 * Extract import paths from a file
 */
async function extractImports(filePath: string): Promise<string[]> {
    try {
        const content = await invoke<string>("read_file", { path: filePath });
        const imports: string[] = [];

        // Simple regex-based import extraction
        // Matches: import ... from 'path' or import ... from "path"
        const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
        let match;

        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];

            // Resolve relative imports
            if (importPath.startsWith('.')) {
                const dir = filePath.substring(0, filePath.lastIndexOf('/'));
                const resolved = resolvePath(dir, importPath);

                // Try common extensions
                for (const ext of ['.ts', '.tsx', '.js', '.jsx', '']) {
                    const fullPath = resolved + ext;
                    try {
                        await invoke("read_file", { path: fullPath });
                        imports.push(fullPath);
                        break;
                    } catch {
                        // Try next extension
                    }
                }
            }
        }

        return imports;
    } catch (e) {
        console.error("Failed to extract imports:", e);
        return [];
    }
}

/**
 * Resolve a relative path
 */
function resolvePath(dir: string, relative: string): string {
    const parts = dir.split('/');
    const relativeParts = relative.split('/');

    for (const part of relativeParts) {
        if (part === '..') {
            parts.pop();
        } else if (part !== '.') {
            parts.push(part);
        }
    }

    return parts.join('/');
}

/**
 * Optimize context to fit within token budget
 * Rough estimation: 1 token ≈ 4 characters
 */
function optimizeContextForTokens(items: ContextItem[], maxTokens: number): ContextItem[] {
    const maxChars = maxTokens * 4;
    let totalChars = 0;
    const result: ContextItem[] = [];

    for (const item of items) {
        const itemChars = item.content.length;

        if (totalChars + itemChars <= maxChars) {
            result.push(item);
            totalChars += itemChars;
        } else {
            // Truncate this item to fit
            const remainingChars = maxChars - totalChars;
            if (remainingChars > 100) { // Only include if we can fit meaningful content
                result.push({
                    ...item,
                    content: item.content.substring(0, remainingChars) + '\n// ... (truncated)'
                });
            }
            break;
        }
    }

    return result;
}

/**
 * Format context items into a string for AI prompts
 */
export function formatContextForAI(items: ContextItem[]): string {
    if (items.length === 0) return '';

    const sections: string[] = [];

    // Group by type
    const byType = items.reduce((acc, item) => {
        if (!acc[item.type]) acc[item.type] = [];
        acc[item.type].push(item);
        return acc;
    }, {} as Record<string, ContextItem[]>);

    // Format each type
    if (byType.selection) {
        sections.push('## Selected Code\n```\n' + byType.selection[0].content + '\n```');
    }

    if (byType.type) {
        sections.push('## Type Information\n' + byType.type.map(t => t.content).join('\n'));
    }

    if (byType.definition) {
        sections.push('## Related Definitions\n' +
            byType.definition.map(d =>
                `From ${d.file}:\n\`\`\`\n${d.content}\n\`\`\``
            ).join('\n\n')
        );
    }

    if (byType.import) {
        sections.push('## Related Imports\n' +
            byType.import.map(i =>
                `From ${i.file}:\n\`\`\`\n${i.content}\n\`\`\``
            ).join('\n\n')
        );
    }

    return sections.join('\n\n');
}
