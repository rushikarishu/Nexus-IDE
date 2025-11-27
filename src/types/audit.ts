export interface AuditEntry {
    id: string;
    timestamp: string;
    session_id: string;
    actor: string;
    action: string;
    details: Record<string, unknown>;
}
