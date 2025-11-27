export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
    id?: string;
    role: Role;
    content: string;
    timestamp?: number;
    // tool_calls?: ToolCall[];
}

export interface SessionConfig {
    mode: "supadev" | "beastup";
    provider: "internal" | "openai" | "anthropic";
    model?: string;
    version?: string;
}

export interface AIError {
    Auth?: string;
    RateLimit?: null;
    Server?: string;
    Network?: string;
    Configuration?: string;
    NotImplemented?: string;
    Unknown?: string;
}

export type ProposalStatus = "pending" | "approved" | "rejected" | "executed" | "failed";

export interface Proposal {
    id: string;
    tool_name: string;
    args: Record<string, unknown>;
    status: ProposalStatus;
    diff?: string;
}
