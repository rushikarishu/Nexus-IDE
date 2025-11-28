use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::path::PathBuf;
use std::sync::mpsc;
use std::fs::{OpenOptions, File};
use std::io::Write;
use std::thread;
use std::os::unix::fs::OpenOptionsExt;
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLog {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub session_id: String,
    pub actor: String, // "user", "assistant", "system", "tool"
    pub action: String, // "message", "tool_call", "tool_result", "error"
    pub details: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
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
        
        // Get HMAC key from env or generate a random one (in production, must be persistent)
        let hmac_key = std::env::var("AUDIT_HMAC_KEY").unwrap_or_else(|_| "default-insecure-key-change-me".to_string());
        
        // Spawn background thread for file writes
        thread::spawn(move || {
            let current_path = file_path.clone();
            
            // Helper to open file in append mode with secure permissions
            let open_log = |path: &PathBuf| -> Option<File> {
                match OpenOptions::new()
                    .create(true)
                    .append(true)
                    .mode(0o600) // Read/write only for owner
                    .open(path) {
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

            while let Ok(mut entry) = rx.recv() {
                // Check file size and rotate if needed (threshold: 10MB)
                if let Ok(metadata) = file.metadata() {
                    if metadata.len() > 10 * 1024 * 1024 {
                        // Rotate
                        let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
                        let file_stem = current_path.file_stem().and_then(|s| s.to_str()).unwrap_or("audit");
                        let extension = current_path.extension().and_then(|s| s.to_str()).unwrap_or("jsonl");
                        let new_name = format!("{}-{}.{}", file_stem, timestamp, extension);
                        let new_path = current_path.with_file_name(new_name);

                        drop(file); // Close file

                        if let Err(e) = std::fs::rename(&current_path, &new_path) {
                            log::error!("Failed to rotate audit log: {}", e);
                        }

                        // Reopen original path (fresh file)
                        if let Some(f) = open_log(&current_path) {
                            file = f;
                        } else {
                            return; // Fatal error
                        }
                    }
                }

                // Sign the entry
                // We sign the JSON representation of the entry WITHOUT the signature field
                // Since signature is Option and skipped if None, we can just serialize it as is (it's None by default)
                // But to be deterministic, we should serialize specific fields or the whole struct with signature=None
                entry.signature = None;
                if let Ok(json_bytes) = serde_json::to_vec(&entry) {
                    let mut mac = HmacSha256::new_from_slice(hmac_key.as_bytes())
                        .expect("HMAC can take key of any size");
                    mac.update(&json_bytes);
                    let result = mac.finalize();
                    let signature = hex::encode(result.into_bytes());
                    entry.signature = Some(signature);
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
