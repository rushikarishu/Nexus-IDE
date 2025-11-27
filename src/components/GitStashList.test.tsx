import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitStashList } from "./GitStashList";
import { mockIPC } from "@tauri-apps/api/mocks";

// Mock useToast
vi.mock("../hooks/useToast", () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
    }),
}));

describe("GitStashList", () => {
    const mockOnStashChange = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockOnStashChange.mockClear();
    });

    it("renders stashes", async () => {
        const mockStashes = [
            { index: 0, message: "WIP" },
        ];

        mockIPC((cmd) => {
            if (cmd === "git_stash_list") {
                return mockStashes;
            }
        });

        render(<GitStashList path="/test" onStashChange={mockOnStashChange} />);

        await waitFor(() => {
            expect(screen.getByText("WIP")).toBeInTheDocument();
        });
    });

    it("stashes changes", async () => {
        let stashPayload: any = null;

        mockIPC((cmd, args) => {
            if (cmd === "git_stash_list") return [];
            if (cmd === "git_stash_save") {
                stashPayload = args;
                return;
            }
        });

        render(<GitStashList path="/test" onStashChange={mockOnStashChange} />);

        const addButton = screen.getByTitle("Stash Changes");
        fireEvent.click(addButton);

        const input = screen.getByPlaceholderText("Message (optional)");
        fireEvent.change(input, { target: { value: "My Stash" } });
        fireEvent.keyDown(input, { key: "Enter" });

        await waitFor(() => {
            expect(stashPayload).toEqual({
                path: "/test",
                message: "My Stash"
            });
            expect(mockOnStashChange).toHaveBeenCalled();
        });
    });
});
