import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitBranches } from "./GitBranches";
import { mockIPC } from "@tauri-apps/api/mocks";

// Mock useToast
vi.mock("../hooks/useToast", () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
    }),
}));

describe("GitBranches", () => {
    const mockOnBranchChange = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockOnBranchChange.mockClear();
    });

    it("renders branches", async () => {
        const mockBranches = [
            { name: "main", active: true },
            { name: "feature", active: false },
        ];

        mockIPC((cmd) => {
            if (cmd === "git_get_branches") {
                return mockBranches;
            }
        });

        render(<GitBranches path="/test" onBranchChange={mockOnBranchChange} />);

        await waitFor(() => {
            expect(screen.getByText("main")).toBeInTheDocument();
            expect(screen.getByText("feature")).toBeInTheDocument();
        });
    });

    it("creates a branch", async () => {
        let createBranchPayload: any = null;

        mockIPC((cmd, args) => {
            if (cmd === "git_get_branches") return [];
            if (cmd === "git_create_branch") {
                createBranchPayload = args;
                return;
            }
        });

        render(<GitBranches path="/test" onBranchChange={mockOnBranchChange} />);

        const addButton = screen.getByTitle("New Branch");
        fireEvent.click(addButton);

        const input = screen.getByPlaceholderText("Branch name");
        fireEvent.change(input, { target: { value: "new-feature" } });

        // const confirmButton = screen.getByRole("button", { name: "" });
        fireEvent.keyDown(input, { key: "Enter" });

        await waitFor(() => {
            expect(createBranchPayload).toEqual({
                path: "/test",
                branchName: "new-feature"
            });
            expect(mockOnBranchChange).toHaveBeenCalled();
        });
    });
});
