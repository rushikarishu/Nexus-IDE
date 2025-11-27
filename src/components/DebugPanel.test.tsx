import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DebugPanel } from "./DebugPanel";
import { mockIPC } from "@tauri-apps/api/mocks";

// Mock useToast
vi.mock("../hooks/useToast", () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
    }),
}));

describe("DebugPanel", () => {
    const mockOpenTerminal = vi.fn();
    const mockOnEditLaunchConfig = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockOpenTerminal.mockClear();
    });

    it("renders empty state when no configs found", async () => {
        mockIPC((cmd) => {
            if (cmd === "get_launch_configurations") {
                return [];
            }
        });

        render(
            <DebugPanel
                workspaceRoot="/test/root"
                terminalId="term-1"
                openTerminal={mockOpenTerminal}
                onEditLaunchConfig={mockOnEditLaunchConfig}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("No configurations found.")).toBeInTheDocument();
        });
    });

    it("renders launch configurations", async () => {
        const mockConfigs = [
            { name: "Launch App", type: "node", request: "launch", program: "app.js" },
            { name: "Debug Script", type: "python", request: "launch", program: "script.py" },
        ];

        mockIPC((cmd) => {
            if (cmd === "get_launch_configurations") {
                return mockConfigs;
            }
        });

        render(
            <DebugPanel
                workspaceRoot="/test/root"
                terminalId="term-1"
                openTerminal={mockOpenTerminal}
                onEditLaunchConfig={mockOnEditLaunchConfig}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Launch App (node)")).toBeInTheDocument();
            expect(screen.getByText("Debug Script (python)")).toBeInTheDocument();
        });
    });

    it("launches selected debug configuration", async () => {
        const mockConfigs = [
            { name: "Launch App", type: "node", request: "launch", program: "app.js" },
        ];

        let debugLaunchPayload: any = null;

        mockIPC((cmd, args) => {
            if (cmd === "get_launch_configurations") {
                return mockConfigs;
            }
            if (cmd === "dap_start_session") {
                debugLaunchPayload = args;
                return;
            }
        });

        render(
            <DebugPanel
                workspaceRoot="/test/root"
                terminalId="term-1"
                openTerminal={mockOpenTerminal}
                onEditLaunchConfig={mockOnEditLaunchConfig}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Launch App (node)")).toBeInTheDocument();
        });

        const runButton = screen.getByTitle("Start Debugging");
        fireEvent.click(runButton);

        await waitFor(() => {
            expect(mockOpenTerminal).toHaveBeenCalled();
        });
        await waitFor(() => {
            expect(debugLaunchPayload).toEqual(expect.objectContaining({
                config: expect.objectContaining(mockConfigs[0]),
            }));
        });
    });
});
