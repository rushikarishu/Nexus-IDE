use std::fs::File;
use std::io::{BufRead, BufReader};
use std::sync::Arc;
use tauri::State;
use ai_core::manager::SessionManager;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct AuditEntry {
    pub id: String,
    pub timestamp: String,
    pub session_id: String,
    pub actor: String,
    pub action: String,
    pub details: serde_json::Value,
}

#[tauri::command]
pub async fn ai_get_audit_logs(
    session_id: Option<String>,
    _state: State<'_, Arc<SessionManager>>,
) -> Result<Vec<AuditEntry>, String> {
    // Read from .nexus/audit.jsonl
    let audit_path = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join(".nexus")
        .join("audit.jsonl");
    
    if !audit_path.exists() {
        return Ok(Vec::new());
    }

    let file = File::open(audit_path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    
    let mut entries = Vec::new();
    
    for line in reader.lines() {
        if let Ok(line_str) = line {
            if let Ok(entry) = serde_json::from_str::<AuditEntry>(&line_str) {
                // Filter by session_id if provided
                if let Some(ref sid) = session_id {
                    if &entry.session_id == sid {
                        entries.push(entry);
                    }
                } else {
                    entries.push(entry);
                }
            }
        }
    }
    
    Ok(entries)
}
