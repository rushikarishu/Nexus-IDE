// Extract variable refactoring utilities for Nexus IDE
import * as monaco from 'monaco-editor';

export interface ExtractionResult {
    variableName: string;
    extractedText: string;
    insertionPoint: monaco.Position;
    replacementRange: monaco.Range;
}

/**
 * Extract selected expression into a variable
 */
export function extractVariable(
    model: monaco.editor.ITextModel,
    selection: monaco.Selection
): ExtractionResult | null {
    const selectedText = model.getValueInRange(selection);

    if (!selectedText.trim()) {
        return null;
    }

    // Generate a variable name based on the selected text
    const variableName = generateVariableName(selectedText);

    // Find the insertion point (beginning of the containing statement)
    const insertionPoint = findInsertionPoint(model, selection.startLineNumber);

    return {
        variableName,
        extractedText: selectedText,
        insertionPoint,
        replacementRange: selection,
    };
}

/**
 * Generate a meaningful variable name from selected text
 */
function generateVariableName(text: string): string {
    // Remove common operators and whitespace
    let cleaned = text
        .replace(/[(){}\[\];,<>]/g, '')
        .replace(/\s+/g, '_')
        .trim();

    // Handle method calls: foo.bar() -> bar
    const methodMatch = cleaned.match(/\.(\w+)\(/);
    if (methodMatch) {
        return methodMatch[1];
    }

    // Handle property access: foo.bar -> bar
    const propMatch = cleaned.match(/\.(\w+)$/);
    if (propMatch) {
        return propMatch[1];
    }

    // Handle simple expressions
    const wordMatch = cleaned.match(/^[a-zA-Z_]\w*/);
    if (wordMatch) {
        return wordMatch[0];
    }

    // Default fallback
    return 'extracted';
}

/**
 * Find the appropriate insertion point for the new variable declaration
 */
function findInsertionPoint(
    model: monaco.editor.ITextModel,
    lineNumber: number
): monaco.Position {
    // Simple strategy: insert at the beginning of the current line
    // In a more sophisticated implementation, we'd analyze the AST
    // to find the proper scope boundary

    const line = model.getLineContent(lineNumber);
    const indent = line.match(/^\s*/)?.[0] || '';

    return new monaco.Position(lineNumber, indent.length + 1);
}

/**
 * Apply the extraction to the editor
 */
export function applyExtraction(
    editor: monaco.editor.IStandaloneCodeEditor,
    model: monaco.editor.ITextModel,
    result: ExtractionResult,
    language: string
): boolean {
    try {
        const { variableName, extractedText, insertionPoint, replacementRange } = result;

        // Determine declaration keyword based on language
        const keyword = getDeclarationKeyword(language);

        // Get indentation
        const currentLine = model.getLineContent(insertionPoint.lineNumber);
        const indent = currentLine.match(/^\s*/)?.[0] || '';

        // Create the variable declaration
        const declaration = `${indent}${keyword} ${variableName} = ${extractedText};\n`;

        // Apply the edits as a single operation for undo/redo
        editor.executeEdits('extract-variable', [
            // Insert the variable declaration
            {
                range: new monaco.Range(
                    insertionPoint.lineNumber,
                    1,
                    insertionPoint.lineNumber,
                    1
                ),
                text: declaration,
            },
            // Replace the selected expression with the variable name
            {
                range: new monaco.Range(
                    replacementRange.startLineNumber + 1, // +1 because we inserted a line
                    replacementRange.startColumn,
                    replacementRange.endLineNumber + 1,
                    replacementRange.endColumn
                ),
                text: variableName,
            },
        ]);

        // Move cursor to the variable name for easy renaming
        const declarationLine = insertionPoint.lineNumber;
        const nameStartColumn = indent.length + keyword.length + 2; // +2 for space
        editor.setSelection(
            new monaco.Selection(
                declarationLine,
                nameStartColumn,
                declarationLine,
                nameStartColumn + variableName.length
            )
        );

        return true;
    } catch (e) {
        console.error('Failed to apply extraction:', e);
        return false;
    }
}

/**
 * Get the appropriate variable declaration keyword for the language
 */
function getDeclarationKeyword(language: string): string {
    switch (language) {
        case 'javascript':
        case 'typescript':
        case 'javascriptreact':
        case 'typescriptreact':
            return 'const';
        case 'python':
            return ''; // Python doesn't use keywords for variables
        case 'rust':
            return 'let';
        case 'go':
            return ''; // Go uses := for short declarations
        case 'java':
        case 'csharp':
            return 'var';
        default:
            return 'const';
    }
}

/**
 * Check if the current selection is suitable for extraction
 */
export function canExtractVariable(
    model: monaco.editor.ITextModel,
    selection: monaco.Selection
): boolean {
    const selectedText = model.getValueInRange(selection);

    // Must have non-empty selection
    if (!selectedText.trim()) {
        return false;
    }

    // Should not be multi-line for basic extraction
    // (could be enhanced to support multi-line expressions)
    if (selection.startLineNumber !== selection.endLineNumber) {
        return false;
    }

    // Should not be just whitespace or a single identifier
    const trimmed = selectedText.trim();
    if (/^\s*$/.test(trimmed) || /^[a-zA-Z_]\w*$/.test(trimmed)) {
        return false;
    }

    return true;
}

/**
 * Extract selected code into a function
 */
export function extractFunction(
    model: monaco.editor.ITextModel,
    selection: monaco.Selection
): ExtractionResult | null {
    const selectedText = model.getValueInRange(selection);

    if (!selectedText.trim()) {
        return null;
    }

    const functionName = 'extractedFunction';
    const insertionPoint = findFunctionInsertionPoint(model, selection.startLineNumber);

    return {
        variableName: functionName,
        extractedText: selectedText,
        insertionPoint,
        replacementRange: selection,
    };
}

/**
 * Find a suitable place to insert a new function (e.g., top level or class level)
 */
function findFunctionInsertionPoint(
    model: monaco.editor.ITextModel,
    lineNumber: number
): monaco.Position {
    // Simple strategy: Insert before the current function or at top level
    // For now, we'll just insert before the current block (checking indentation)
    // A real implementation needs AST parsing to find class/module scope.

    // Scan upwards for a line with less indentation than the start line
    const startLineContent = model.getLineContent(lineNumber);
    const startIndent = startLineContent.match(/^\s*/)?.[0].length || 0;

    for (let i = lineNumber - 1; i >= 1; i--) {
        const lineContent = model.getLineContent(i);
        const indent = lineContent.match(/^\s*/)?.[0].length || 0;
        if (indent < startIndent && lineContent.trim().length > 0) {
            // Found a parent block?
            // Actually, safer to insert *after* the current block or at the end of file?
            // Or just before the current line if we assume it's a statement list.
            break;
        }
    }

    // Fallback: Insert before the selection
    return new monaco.Position(lineNumber, 1);
}

export function applyFunctionExtraction(
    editor: monaco.editor.IStandaloneCodeEditor,
    model: monaco.editor.ITextModel,
    result: ExtractionResult,
    language: string
): boolean {
    try {
        const { variableName, extractedText, insertionPoint, replacementRange } = result;

        // Construct function definition
        let definition = "";
        const indent = model.getLineContent(insertionPoint.lineNumber).match(/^\s*/)?.[0] || '';

        // Indent the extracted body
        const body = extractedText.split('\n').map(line => `${indent}    ${line}`).join('\n');

        switch (language) {
            case 'javascript':
            case 'typescript':
            case 'javascriptreact':
            case 'typescriptreact':
                definition = `\n${indent}function ${variableName}() {\n${body}\n${indent}}\n`;
                break;
            case 'python':
                definition = `\n${indent}def ${variableName}():\n${body}\n`;
                break;
            case 'rust':
                definition = `\n${indent}fn ${variableName}() {\n${body}\n${indent}}\n`;
                break;
            case 'go':
                definition = `\n${indent}func ${variableName}() {\n${body}\n${indent}}\n`;
                break;
            case 'java':
            case 'csharp':
                definition = `\n${indent}private void ${variableName}() {\n${body}\n${indent}}\n`;
                break;
            default:
                definition = `\n${indent}function ${variableName}() {\n${body}\n${indent}}\n`;
        }

        // Apply edits
        editor.executeEdits('extract-function', [
            {
                range: new monaco.Range(insertionPoint.lineNumber, 1, insertionPoint.lineNumber, 1),
                text: definition
            },
            {
                range: replacementRange,
                text: `${variableName}()`
            }
        ]);

        return true;
    } catch (e) {
        console.error('Failed to apply function extraction:', e);
        return false;
    }
}

export function canExtractFunction(
    model: monaco.editor.ITextModel,
    selection: monaco.Selection
): boolean {
    const selectedText = model.getValueInRange(selection);
    return selectedText.trim().length > 0 && selection.startLineNumber !== selection.endLineNumber;
}
