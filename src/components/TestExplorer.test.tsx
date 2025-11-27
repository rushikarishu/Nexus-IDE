import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TestExplorer } from "./TestExplorer";
import { mockIPC } from "@tauri-apps/api/mocks";

// Mock useToast
vi.mock("../hooks/useToast", () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
    }),
}));

describe("TestExplorer", () => {
    const mockOpenTerminal = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockOpenTerminal.mockClear();
    });

    it("renders empty state when no tests found", async () => {
        mockIPC((cmd) => {
            if (cmd === "discover_tests") {
                return [];
            }
        });

        render(
            <TestExplorer
                workspaceRoot="/test/root"
                terminalId="term-1"
                openTerminal={mockOpenTerminal}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("No tests found.")).toBeInTheDocument();
        });
    });

    it("renders discovered tests", async () => {
        const mockTests = [
            { path: "src/App.test.tsx", name: "App.test.tsx", suite: "frontend" },
            { path: "src/components/Button.test.tsx", name: "Button.test.tsx", suite: "frontend" },
        ];

        mockIPC((cmd) => {
            if (cmd === "discover_tests") {
                return mockTests;
            }
        });

        render(
            <TestExplorer
                workspaceRoot="/test/root"
                terminalId="term-1"
                openTerminal={mockOpenTerminal}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("App.test.tsx")).toBeInTheDocument();
            expect(screen.getByText("Button.test.tsx")).toBeInTheDocument();
        });
    });

    it("runs a specific test", async () => {
        const mockTests = [
            { path: "src/App.test.tsx", name: "App.test.tsx", suite: "frontend" },
        ];

        let runTaskPayload: any = null;

        mockIPC((cmd, args) => {
            if (cmd === "discover_tests") {
                return mockTests;
            }
            if (cmd === "run_task") {
                runTaskPayload = args;
                return;
            }
        });

        render(
            <TestExplorer
                workspaceRoot="/test/root"
                terminalId="term-1"
                openTerminal={mockOpenTerminal}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("App.test.tsx")).toBeInTheDocument();
        });

        const runButtons = screen.getAllByTitle("Run Test");
        fireEvent.click(runButtons[0]);

        expect(mockOpenTerminal).toHaveBeenCalled();
        await waitFor(() => {
            expect(runTaskPayload).toEqual({
                task: {
                    label: "Test App.test.tsx",
                    command: "npm",
                    args: ["test", "src/App.test.tsx"],
                    cwd: null,
                    env: null
                },
                terminalId: "term-1"
            });
        });
    });

    it("runs all tests", async () => {
        let runTaskPayload: any = null;

        mockIPC((cmd, args) => {
            if (cmd === "discover_tests") {
                return [];
            }
            if (cmd === "run_task") {
                runTaskPayload = args;
                return;
            }
        });

        render(
            <TestExplorer
                workspaceRoot="/test/root"
                terminalId="term-1"
                openTerminal={mockOpenTerminal}
            />
        );

        const runAllButton = screen.getByTitle("Run All Tests");
        fireEvent.click(runAllButton);

        expect(mockOpenTerminal).toHaveBeenCalled();
        await waitFor(() => {
            expect(runTaskPayload).toEqual({
                task: {
                    label: "Run All Tests",
                    command: "npm",
                    args: ["test"],
                    cwd: null,
                    env: null
                },
                terminalId: "term-1"
            });
        });
    });
});
