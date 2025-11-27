import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Copy, Check, ChevronDown, ChevronRight, Brain } from 'lucide-react';

interface MessageRendererProps {
    content: string;
}

export function MessageRenderer({ content }: MessageRendererProps) {
    // Function to extract and render thought blocks separately
    const renderContent = () => {
        const parts = [];
        let currentContent = content;
        let key = 0;

        while (true) {
            const thinkStart = currentContent.indexOf('<think>');
            const thinkEnd = currentContent.indexOf('</think>');

            if (thinkStart !== -1 && thinkEnd !== -1 && thinkEnd > thinkStart) {
                // Add content before thought
                if (thinkStart > 0) {
                    parts.push(
                        <MarkdownBlock key={`md-${key++}`} content={currentContent.substring(0, thinkStart)} />
                    );
                }

                // Add thought block
                const thoughtContent = currentContent.substring(thinkStart + 7, thinkEnd);
                parts.push(
                    <ThoughtBlock key={`thought-${key++}`} content={thoughtContent} />
                );

                // Advance
                currentContent = currentContent.substring(thinkEnd + 8);
            } else {
                // No more thoughts, add remaining content
                if (currentContent.length > 0) {
                    parts.push(
                        <MarkdownBlock key={`md-${key++}`} content={currentContent} />
                    );
                }
                break;
            }
        }

        return parts;
    };

    return <div className="space-y-2 text-sm leading-relaxed break-words overflow-wrap-anywhere">{renderContent()}</div>;
}

function ThoughtBlock({ content }: { content: string }) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="border border-border rounded-md bg-muted/30 overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            >
                <Brain size={14} />
                <span>Thinking Process</span>
                {isExpanded ? <ChevronDown size={14} className="ml-auto" /> : <ChevronRight size={14} className="ml-auto" />}
            </button>
            {isExpanded && (
                <div className="px-3 py-2 border-t border-border bg-muted/10 text-muted-foreground italic text-xs whitespace-pre-wrap break-words">
                    {content.trim()}
                </div>
            )}
        </div>
    );
}

function MarkdownBlock({ content }: { content: string }) {
    return (
        <div className="break-words overflow-wrap-anywhere" style={{ overflowWrap: 'break-word', wordWrap: 'break-word', wordBreak: 'break-word' }}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                    code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        const codeString = String(children).replace(/\n$/, '');

                        if (!inline && match) {
                            return (
                                <CodeBlock language={match[1]} value={codeString} />
                            );
                        }
                        return (
                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary break-all" {...props}>
                                {children}
                            </code>
                        );
                    },
                    p: ({ children }) => <p className="mb-2 last:mb-0 break-words" style={{ overflowWrap: 'break-word', wordWrap: 'break-word' }}>{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="mb-0.5 break-words">{children}</li>,
                    a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                            {children}
                        </a>
                    ),
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-primary/50 pl-4 italic text-muted-foreground my-2 break-words">
                            {children}
                        </blockquote>
                    ),
                    h1: ({ children }) => <h1 className="text-lg font-bold mt-4 mb-2 break-words">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2 break-words">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1 break-words">{children}</h3>,
                    table: ({ children }) => <div className="overflow-x-auto my-2"><table className="min-w-full divide-y divide-border border border-border rounded-md">{children}</table></div>,
                    thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
                    th: ({ children }) => <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{children}</th>,
                    td: ({ children }) => <td className="px-3 py-2 whitespace-nowrap text-sm border-t border-border">{children}</td>,
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

function CodeBlock({ language, value }: { language: string; value: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group my-3 rounded-md overflow-hidden border border-border max-w-full">
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/80 text-xs text-muted-foreground border-b border-border">
                <span className="font-mono">{language}</span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                    title="Copy code"
                >
                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
            </div>
            <div className="overflow-x-auto max-w-full">
                <SyntaxHighlighter
                    language={language}
                    style={vscDarkPlus}
                    customStyle={{ margin: 0, padding: '1rem', fontSize: '12px', maxWidth: '100%' }}
                    wrapLines={true}
                    wrapLongLines={true}
                >
                    {value}
                </SyntaxHighlighter>
            </div>
        </div>
    );
}
