
export interface Position {
    line: number;
    character: number;
}

export interface Range {
    start: Position;
    end: Position;
}

export interface TextEdit {
    range: Range;
    newText: string;
}

export function applyTextEdits(content: string, edits: TextEdit[]): string {
    if (edits.length === 0) return content;

    // Split content into lines
    const lines = content.split(/\r\n|\r|\n/);
    // Detect line ending
    const eol = content.includes('\r\n') ? '\r\n' : (content.includes('\r') ? '\r' : '\n');

    // Sort edits by start position descending
    const sortedEdits = [...edits].sort((a, b) => {
        if (a.range.start.line !== b.range.start.line) {
            return b.range.start.line - a.range.start.line;
        }
        return b.range.start.character - a.range.start.character;
    });

    // Apply edits
    // We need to be careful because edits are ranges.
    // Since we sorted descending, we can modify the lines array or rebuild the string.
    // However, multi-line edits are tricky if we just use lines array.
    // Better to convert to absolute offsets?
    // But converting to offsets requires iterating lines.

    // Let's use a simpler approach: Convert everything to a single string (we have it),
    // calculate offsets for all lines, then apply edits.

    const lineOffsets: number[] = [];
    let currentOffset = 0;
    for (const line of lines) {
        lineOffsets.push(currentOffset);
        currentOffset += line.length + eol.length; // Approximate, might be wrong if mixed line endings
    }
    // The last line doesn't have EOL usually? split keeps it?
    // split consumes the separator.
    // So if content is "a\nb", lines is ["a", "b"].
    // Offset of "a" is 0. Offset of "b" is 1 + 1 (len of a + len of \n) = 2.

    // Let's recalculate accurately.
    // We can't assume uniform EOL.
    // But usually editors normalize EOL.
    // Let's assume the input content is the source of truth.



    // Better approach:
    // 1. Iterate through the string to find line start offsets.
    const offsets: number[] = [0];
    for (let i = 0; i < content.length; i++) {
        if (content[i] === '\n') {
            offsets.push(i + 1);
        } else if (content[i] === '\r') {
            if (i + 1 < content.length && content[i + 1] === '\n') {
                i++;
            }
            offsets.push(i + 1);
        }
    }

    const getAbsOffset = (pos: Position): number => {
        if (pos.line >= offsets.length) return content.length;
        const lineStart = offsets[pos.line];
        return Math.min(lineStart + pos.character, content.length); // Clamp?
    };

    let result = content;

    for (const edit of sortedEdits) {
        const startOffset = getAbsOffset(edit.range.start);
        const endOffset = getAbsOffset(edit.range.end);

        result = result.substring(0, startOffset) + edit.newText + result.substring(endOffset);
    }

    return result;
}
