import { Check, X, FileText, Terminal } from 'lucide-react';

export interface ToolCall {
    id: string;
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

interface ToolProposalCardProps {
    toolCall: ToolCall;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
}

export function ToolProposalCard({ toolCall, onApprove, onReject }: ToolProposalCardProps) {
    const parsed = JSON.parse(toolCall.function.arguments) as unknown;
    const args = parsed as { path?: string };
    const name = toolCall.function.name;

    let icon = <Terminal className="w-4 h-4" />;
    let summary = "Run command";

    if (name === "write_file") {
        icon = <FileText className="w-4 h-4" />;
        summary = `Edit ${args.path ?? ''}`;
    } else if (name === "read_file") {
        icon = <FileText className="w-4 h-4" />;
        summary = `Read ${args.path ?? ''}`;
    }

    return (
        <div className="border border-border rounded-lg bg-card p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
                {icon}
                <span>{summary}</span>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded font-mono overflow-x-auto">
                {JSON.stringify(args, null, 2)}
            </div>

            <div className="flex gap-2 justify-end">
                <button
                    onClick={() => onReject(toolCall.id)}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-red-500/20 text-red-500 hover:bg-red-500/10"
                >
                    <X size={12} />
                    Reject
                </button>
                <button
                    onClick={() => onApprove(toolCall.id)}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
                >
                    <Check size={12} />
                    Approve
                </button>
            </div>
        </div>
    );
}
