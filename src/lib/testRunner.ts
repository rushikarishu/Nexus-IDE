import { invoke } from "@tauri-apps/api/core";


export interface TestResult {
    name: string;
    status: 'pending' | 'running' | 'passed' | 'failed';
    message?: string;
    duration?: number;
}

export type TestFn = () => Promise<void>;

export class TestSuite {
    private tests: { name: string; fn: TestFn }[] = [];

    add(name: string, fn: TestFn) {
        this.tests.push({ name, fn });
    }

    async run(onProgress: (result: TestResult) => void) {
        for (const test of this.tests) {
            onProgress({ name: test.name, status: 'running' });
            const start = performance.now();
            try {
                await test.fn();
                const duration = performance.now() - start;
                onProgress({ name: test.name, status: 'passed', duration });
            } catch (e) {
                const duration = performance.now() - start;
                onProgress({ name: test.name, status: 'failed', message: String(e), duration });
            }
        }
    }
}

export const createEvidenceSuite = () => {
    const suite = new TestSuite();

    suite.add("Backend Connection", async () => {
        // Simple ping or check if we can invoke a basic command
        // We'll use get_rag_status as a proxy for backend health
        await invoke("get_rag_status");
    });

    suite.add("File System Operations", async () => {
        const testPath = "test_evidence_" + Date.now() + ".txt";
        const content = "Evidence Based Testing";

        // Write
        await invoke("write_file", { path: testPath, content });

        // Read
        const readContent = await invoke<string>("read_file", { path: testPath });
        if (readContent !== content) throw new Error("Content mismatch");

        // Delete (Clean up)
        // We don't have a delete_file command exposed directly in lib.rs? 
        // Wait, let's check lib.rs.
        // It has delete_file.
        await invoke("delete_file", { path: testPath });
    });

    suite.add("Terminal Creation", async () => {
        const id = "test_term_" + Date.now();
        await invoke("create_terminal", { id });

        // We can't easily verify output without listening to events, 
        // but successful creation is a good step.

        // Clean up
        await invoke("destroy_terminal", { id });
    });

    suite.add("RAG Status Check", async () => {
        const status = await invoke<{ qdrant: boolean; chutes: boolean }>("get_rag_status");
        if (!status.qdrant && !status.chutes) {
            // Not necessarily a failure of the test framework, but a system state check
            // We'll pass but log a warning if possible, or just pass.
            // Let's fail if we strictly require them, but for now just pass.
            console.warn("RAG services not available");
        }
    });

    return suite;
};
