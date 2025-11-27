import { normalize, isAbsolute, relative } from 'path-browserify';

/**
 * Validates that a file path is within the workspace boundaries
 * Prevents path traversal attacks
 */
export function isPathWithinWorkspace(filePath: string, workspaceRoots: string[]): boolean {
    if (!filePath || workspaceRoots.length === 0) {
        return false;
    }

    // Normalize the file path to handle .. and . segments
    const normalizedPath = normalize(filePath);

    // Check if path is within any workspace root
    return workspaceRoots.some(root => {
        const normalizedRoot = normalize(root);

        // Both paths should be absolute for proper comparison
        if (!isAbsolute(normalizedPath) || !isAbsolute(normalizedRoot)) {
            return false;
        }

        // Get relative path from root to file
        const relativePath = relative(normalizedRoot, normalizedPath);

        // If relative path starts with '..' or is absolute, it's outside the root
        return relativePath &&
            !relativePath.startsWith('..') &&
            !isAbsolute(relativePath);
    });
}

/**
 * Validates a path and throws an error if it's outside workspace boundaries
 */
export function validatePath(filePath: string, workspaceRoots: string[]): void {
    if (!isPathWithinWorkspace(filePath, workspaceRoots)) {
        throw new Error(`Access denied: Path "${filePath}" is outside workspace boundaries`);
    }
}

/**
 * Validates multiple paths at once
 */
export function validatePaths(filePaths: string[], workspaceRoots: string[]): void {
    for (const path of filePaths) {
        validatePath(path, workspaceRoots);
    }
}
