import { useState, useCallback } from "react";

export interface EditorState {
    code: string;
    cursorPos: { line: number; col: number };
    jumpToLocation: { line: number; column: number } | null;
}

export function useEditorState() {
    const [code, setCode] = useState("");
    const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
    const [jumpToLocation, setJumpToLocation] = useState<{ line: number; column: number } | null>(null);

    const handleCursorChange = useCallback((line: number, col: number) => {
        setCursorPos({ line, col });
    }, []);

    const handleJumpComplete = useCallback(() => {
        setJumpToLocation(null);
    }, []);

    return {
        code,
        setCode,
        cursorPos,
        setCursorPos, // Exposed if needed elsewhere
        handleCursorChange,
        jumpToLocation,
        setJumpToLocation,
        handleJumpComplete,
    };
}
