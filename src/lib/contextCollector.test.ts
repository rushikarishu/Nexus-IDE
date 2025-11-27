import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectContext, formatContextForAI } from './contextCollector';
import type { ContextItem } from './contextCollector';

// Mock tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

// Mock LSP client
vi.mock('./lsp', () => ({
    getLspClient: vi.fn(() => ({
        sendRequest: vi.fn(),
    })),
}));

import { invoke } from '@tauri-apps/api/core';
import { getLspClient } from './lsp';

const invokeMock = vi.mocked(invoke);
const getLspClientMock = vi.mocked(getLspClient);

describe('contextCollector', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('collectContext', () => {
        it('collects selected code as primary context', async () => {
            const fileContent = `function test() {\n  const x = 5;\n  return x;\n}`;
            invokeMock.mockResolvedValueOnce(fileContent);

            const selection = {
                start: { line: 1, character: 2 },
                end: { line: 1, character: 13 },
            };

            const context = await collectContext('/test.ts', selection, null, 1000);

            expect(context.length).toBeGreaterThan(0);
            expect(context[0].type).toBe('selection');
            expect(context[0].relevance).toBe(100);
        });

        it('queries LSP for definitions when lspKey provided', async () => {
            const fileContent = `const result = processData(items);`;
            invokeMock.mockResolvedValueOnce(fileContent);

            const sendRequest = vi.fn().mockResolvedValueOnce([
                {
                    uri: 'file:///utils.ts',
                    range: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
                },
            ]);

            getLspClientMock.mockReturnValueOnce({ sendRequest } as any);

            const utilsContent = `export function processData(data: string[]) {\n  return data.map(x => x.toUpperCase());\n}`;
            invokeMock.mockResolvedValueOnce(utilsContent);

            const selection = {
                start: { line: 0, character: 15 },
                end: { line: 0, character: 35 },
            };

            const context = await collectContext('/main.ts', selection, 'typescript', 2000);

            expect(sendRequest).toHaveBeenCalledWith(
                'textDocument/definition',
                expect.objectContaining({
                    textDocument: expect.objectContaining({ uri: 'file:///main.ts' }),
                })
            );

            expect(context.some(item => item.type === 'definition')).toBe(true);
        });

        it('includes hover type information', async () => {
            const fileContent = `const x: number = 5;`;
            invokeMock.mockResolvedValueOnce(fileContent);

            const sendRequest = vi.fn()
                .mockResolvedValueOnce(null) // definition request
                .mockResolvedValueOnce({     // hover request
                    contents: { value: 'const x: number' },
                });

            getLspClientMock.mockReturnValueOnce({ sendRequest } as any);

            const selection = {
                start: { line: 0, character: 6 },
                end: { line: 0, character: 7 },
            };

            const context = await collectContext('/test.ts', selection, 'typescript', 1000);

            expect(sendRequest).toHaveBeenCalledWith(
                'textDocument/hover',
                expect.any(Object)
            );

            expect(context.some(item => item.type === 'type')).toBe(true);
        });

        it('sorts context items by relevance', async () => {
            const fileContent = `import { util } from './utils';\nconst x = util();`;
            invokeMock.mockResolvedValue(fileContent);

            const selection = {
                start: { line: 1, character: 10 },
                end: { line: 1, character: 17 },
            };

            const context = await collectContext('/test.ts', selection, null, 5000);

            // Selection should be first (highest relevance)
            expect(context[0].type).toBe('selection');
            expect(context[0].relevance).toBe(100);

            // Subsequent items should have lower relevance
            for (let i = 1; i < context.length; i++) {
                expect(context[i].relevance).toBeLessThan(context[i - 1].relevance);
            }
        });

        it('truncates context to fit token budget', async () => {
            const largeContent = 'x'.repeat(10000); // 10k characters
            invokeMock.mockResolvedValue(largeContent);

            const selection = {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 100 },
            };

            const maxTokens = 500; // ~2000 characters
            const context = await collectContext('/test.ts', selection, null, maxTokens);

            const totalChars = context.reduce((sum, item) => sum + item.content.length, 0);
            expect(totalChars).toBeLessThanOrEqual(maxTokens * 4 + 100); // Some tolerance
        });

        it('handles LSP errors gracefully', async () => {
            const fileContent = `const x = 5;`;
            invokeMock.mockResolvedValueOnce(fileContent);

            const sendRequest = vi.fn().mockRejectedValueOnce(new Error('LSP timeout'));
            getLspClientMock.mockReturnValueOnce({ sendRequest } as any);

            const selection = {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 10 },
            };

            // Should not throw
            const context = await collectContext('/test.ts', selection, 'typescript', 1000);

            // Should still have selection context
            expect(context.length).toBeGreaterThan(0);
            expect(context[0].type).toBe('selection');
        });

        it('handles missing files gracefully', async () => {
            invokeMock.mockRejectedValueOnce(new Error('File not found'));

            const selection = {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 10 },
            };

            const context = await collectContext('/nonexistent.ts', selection, null, 1000);

            // Should return empty or handle gracefully
            expect(Array.isArray(context)).toBe(true);
        });
    });

    describe('formatContextForAI', () => {
        it('formats context items into markdown sections', () => {
            const items: ContextItem[] = [
                {
                    file: '/test.ts',
                    content: 'const x = 5;',
                    relevance: 100,
                    type: 'selection',
                },
                {
                    file: '/test.ts',
                    content: 'const x: number',
                    relevance: 60,
                    type: 'type',
                },
            ];

            const formatted = formatContextForAI(items);

            expect(formatted).toContain('## Selected Code');
            expect(formatted).toContain('const x = 5;');
            expect(formatted).toContain('## Type Information');
            expect(formatted).toContain('const x: number');
        });

        it('groups context by type', () => {
            const items: ContextItem[] = [
                { file: '/a.ts', content: 'selection', relevance: 100, type: 'selection' },
                { file: '/b.ts', content: 'def1', relevance: 80, type: 'definition' },
                { file: '/c.ts', content: 'def2', relevance: 75, type: 'definition' },
            ];

            const formatted = formatContextForAI(items);

            expect(formatted).toContain('## Selected Code');
            expect(formatted).toContain('## Related Definitions');
            expect(formatted).toContain('def1');
            expect(formatted).toContain('def2');
        });

        it('includes file paths in formatted output', () => {
            const items: ContextItem[] = [
                {
                    file: '/src/utils.ts',
                    content: 'export function helper() {}',
                    relevance: 80,
                    type: 'definition',
                },
            ];

            const formatted = formatContextForAI(items);

            expect(formatted).toContain('/src/utils.ts');
        });

        it('handles empty context array', () => {
            const formatted = formatContextForAI([]);

            expect(formatted).toBe('');
        });

        it('formats code blocks with proper markdown syntax', () => {
            const items: ContextItem[] = [
                {
                    file: '/test.ts',
                    content: 'function test() { return 42; }',
                    relevance: 100,
                    type: 'selection',
                },
            ];

            const formatted = formatContextForAI(items);

            expect(formatted).toContain('```');
            expect(formatted).toContain('function test() { return 42; }');
        });
    });
});
