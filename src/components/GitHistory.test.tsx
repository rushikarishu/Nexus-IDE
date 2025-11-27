import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitHistory } from "./GitHistory";
import { mockIPC } from "@tauri-apps/api/mocks";

describe("GitHistory", () => {
    it("renders commit history", async () => {
        const mockCommits = [
            { hash: "1234567890", author: "User", date: "2023-01-01", message: "Initial commit" },
        ];

        mockIPC((cmd) => {
            if (cmd === "git_log") {
                return mockCommits;
            }
        });

        render(<GitHistory path="/test" />);

        await waitFor(() => {
            expect(screen.getByText("Initial commit")).toBeInTheDocument();
            expect(screen.getByText("1234567")).toBeInTheDocument();
        });
    });
});
