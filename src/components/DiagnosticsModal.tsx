import { useState, useEffect } from 'react';
import { createEvidenceSuite, TestResult } from '../lib/testRunner';
import { X, Play, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface DiagnosticsModalProps {
    onClose: () => void;
}

export function DiagnosticsModal({ onClose }: DiagnosticsModalProps) {
    const [results, setResults] = useState<TestResult[]>([]);
    const [isRunning, setIsRunning] = useState(false);

    const runTests = async () => {
        setIsRunning(true);
        setResults([]);
        const suite = createEvidenceSuite();

        // Initialize results
        // We can't easily know all tests upfront unless we expose them, 
        // but for now we'll build the list as we go or modify TestSuite to expose names.
        // Let's just append results.

        await suite.run((result) => {
            setResults(prev => {
                const existing = prev.findIndex(r => r.name === result.name);
                if (existing !== -1) {
                    const newResults = [...prev];
                    newResults[existing] = result;
                    return newResults;
                }
                return [...prev, result];
            });
        });
        setIsRunning(false);
    };

    useEffect(() => {
        runTests();
    }, []);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-card text-card-foreground border border-border rounded-lg shadow-lg w-[600px] max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-primary" />
                        System Diagnostics
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-accent rounded">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {results.map((result, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-md border border-border">
                            <div className="flex items-center gap-3">
                                {result.status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                                {result.status === 'passed' && <CheckCircle className="w-4 h-4 text-green-500" />}
                                {result.status === 'failed' && <XCircle className="w-4 h-4 text-red-500" />}
                                <span className="font-medium">{result.name}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                                {result.duration !== undefined && (
                                    <span className="text-muted-foreground">{result.duration.toFixed(0)}ms</span>
                                )}
                                {result.message && (
                                    <span className="text-red-500 max-w-[200px] truncate" title={result.message}>
                                        {result.message}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-4 border-t border-border flex justify-end gap-2">
                    <button
                        onClick={runTests}
                        disabled={isRunning}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                    >
                        <Play size={16} />
                        Run Tests
                    </button>
                </div>
            </div>
        </div>
    );
}
