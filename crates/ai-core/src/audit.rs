use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::path::PathBuf;
use std::sync::mpsc;
use std::fs::{OpenOptions};
use std::io::Write;
use std::thread;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLog {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub session_id: String,
    pub actor: String, // "user", "assistant", "system", "tool"
    pub action: String, // "message", "tool_call", "tool_result", "error"
    pub details: serde_json::Value,
}

pub trait AuditLogger: Send + Sync {
    fn log(&self, entry: AuditLog);
}

/// Async audit logger that uses a channel to avoid blocking on I/O.
/// Messages are sent to a background thread that handles file writes.
pub struct AsyncAuditLogger {
    tx: mpsc::Sender<AuditLog>,
}

impl AsyncAuditLogger {
    pub fn new(file_path: PathBuf) -> Result<Self, std::io::Error> {
        let (tx, rx) = mpsc::channel::<AuditLog>();
        
        // Spawn background thread for file writes
        thread::spawn(move || {
            let current_path = file_path.clone();
            
            // Helper to open file in append mode
            let open_log = |path: &PathBuf| -> Option<std::fs::File> {
                match OpenOptions::new().create(true).append(true).open(path) {
                    Ok(f) => Some(f),
                    Err(e) => {
                        log::error!("Failed to open audit log file: {}", e);
                        None
                    }
                }
            };

            let mut file = match open_log(&current_path) {
                Some(f) => f,
                None => return,
            };

            while let Ok(entry) = rx.recv() {
                // Check file size and rotate if needed (threshold: 10MB)
                if let Ok(metadata) = file.metadata() {
                    if metadata.len() > 10 * 1024 * 1024 {
                        // Rotate
                        let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
                        let file_stem = current_path.file_stem().and_then(|s| s.to_str()).unwrap_or("audit");
                        let extension = current_path.extension().and_then(|s| s.to_str()).unwrap_or("jsonl");
                        let new_name = format!("{}-{}.{}", file_stem, timestamp, extension);
                        let new_path = current_path.with_file_name(new_name);

                        // Close current file (implicitly by dropping or reopening)
                        // Actually, we need to rename the *current* file to the rotated name, 
                        // and then open a fresh file at the original path.
                        // OR we can just close the current one, rename it, and open a new one.
                        // Renaming an open file works on POSIX but might be tricky on Windows.
                        // Safer to close, rename, reopen.
                        drop(file); // Close file

                        if let Err(e) = std::fs::rename(&current_path, &new_path) {
                            log::error!("Failed to rotate audit log: {}", e);
                            // Try to reopen original path anyway
                        }

                        // Reopen original path (fresh file)
                        if let Some(f) = open_log(&current_path) {
                            file = f;
                        } else {
                            return; // Fatal error
                        }
                    }
                }

                if let Ok(json) = serde_json::to_string(&entry) {
                    if let Err(e) = writeln!(file, "{}", json) {
                        log::error!("Failed to write audit log: {}", e);
                    }
                }
            }
        });

        Ok(Self { tx })
    }
}

impl AuditLogger for AsyncAuditLogger {
    fn log(&self, entry: AuditLog) {
        // Non-blocking send; if receiver is dropped, this fails silently
        let _ = self.tx.send(entry);
    }
}

// No-op logger for testing or when logging is disabled
pub struct NoOpLogger;
impl AuditLogger for NoOpLogger {
    fn log(&self, _entry: AuditLog) {}
}
