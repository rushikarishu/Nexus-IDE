import { Check, X, FileText, Terminal } from 'lucide-react';
import { Proposal } from '../types/ai';

interface ToolProposalListProps {
    proposals: Proposal[];
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    onViewDiff?: (proposal: Proposal) => void;
}

export function ToolProposalList({ proposals, onApprove, onReject, onViewDiff }: ToolProposalListProps) {
    if (proposals.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 p-4 bg-muted/30 border-b border-border">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Pending Actions
            </h3>
            {proposals.map((proposal) => (
                <div
                    key={proposal.id}
                    className="bg-card border border-border rounded-lg p-3 shadow-sm flex flex-col gap-2"
                >
                    <div className="flex items-center gap-2">
                        {proposal.tool_name === 'write_file' ? (
                            <FileText size={16} className="text-blue-500" />
                        ) : (
                            <Terminal size={16} className="text-orange-500" />
                        )}
                        <span className="font-medium text-sm">{proposal.tool_name}</span>
                    </div>

                    <div className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto">
                        {JSON.stringify(proposal.args, null, 2)}
                    </div>

                    <div className="flex gap-2 mt-1">
                        <button
                            onClick={() => onApprove(proposal.id)}
                            className="flex-1 flex items-center justify-center gap-1 bg-green-500/10 hover:bg-green-500/20 text-green-600 text-xs py-1.5 rounded transition-colors"
                        >
                            <Check size={14} />
                            Approve
                        </button>
                        <button
                            onClick={() => onReject(proposal.id)}
                            className="flex-1 flex items-center justify-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 text-xs py-1.5 rounded transition-colors"
                        >
                            <X size={14} />
                            Reject
                        </button>
                        {onViewDiff && proposal.tool_name === 'write_file' && (
                            <button
                                onClick={() => onViewDiff(proposal)}
                                className="flex-1 flex items-center justify-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 text-xs py-1.5 rounded transition-colors"
                            >
                                <FileText size={14} />
                                View diff
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
