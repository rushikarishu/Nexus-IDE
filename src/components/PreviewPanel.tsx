import { useState, useRef } from 'react';
import { RefreshCw, ExternalLink, X } from 'lucide-react';

interface PreviewPanelProps {
    url?: string;
    onClose?: () => void;
}

export function PreviewPanel({ url = "http://localhost:3000", onClose }: PreviewPanelProps) {
    const [currentUrl, setCurrentUrl] = useState(url);
    const [key, setKey] = useState(0); // To force iframe reload
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const handleRefresh = () => {
        setKey(prev => prev + 1);
    };

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCurrentUrl(e.target.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleRefresh();
        }
    };

    return (
        <div className="flex flex-col h-full bg-card border-l border-border">
            <div className="h-12 border-b border-border flex items-center px-4 justify-between shrink-0 bg-muted/30">
                <div className="flex items-center gap-2 flex-1 mr-4">
                    <span className="text-sm font-medium text-muted-foreground">Preview</span>
                    <div className="flex-1 max-w-md relative">
                        <input
                            type="text"
                            value={currentUrl}
                            onChange={handleUrlChange}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-background border border-input rounded-md px-3 py-1 text-xs h-8 focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <button
                        onClick={handleRefresh}
                        className="p-1.5 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <a
                        href={currentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors"
                        title="Open in Browser"
                    >
                        <ExternalLink size={14} />
                    </a>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>
            <div className="flex-1 bg-white relative">
                <iframe
                    key={key}
                    ref={iframeRef}
                    src={currentUrl}
                    className="absolute inset-0 w-full h-full border-0"
                    title="Preview"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                />
            </div>
        </div>
    );
}
