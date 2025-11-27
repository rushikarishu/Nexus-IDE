
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, Mutex};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DapRequest {
    pub seq: i64,
    #[serde(rename = "type")]
    pub type_: String,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DapResponse {
    pub seq: i64,
    #[serde(rename = "type")]
    pub type_: String,
    #[serde(rename = "request_seq")]
    pub request_seq: i64,
    pub success: bool,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DapEvent {
    pub seq: i64,
    #[serde(rename = "type")]
    pub type_: String,
    pub event: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<Value>,
}

pub struct DapClient {
    child: Option<Child>,
    tx: mpsc::Sender<String>,
    seq: i64,
}

impl DapClient {
    pub async fn new(adapter_path: &str, args: &[String], app_handle: AppHandle) -> Result<Arc<Mutex<Self>>, String> {
        let mut child = Command::new(adapter_path)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn debug adapter: {}", e))?;

        let stdin = child.stdin.take().ok_or("Failed to open stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

        let (tx, mut rx) = mpsc::channel::<String>(32);

        // Writer task
        let mut stdin_writer = stdin;
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                let content_length = msg.len();
                let header = format!("Content-Length: {}\r\n\r\n", content_length);
                if let Err(e) = stdin_writer.write_all(header.as_bytes()).await {
                    eprintln!("Failed to write header: {}", e);
                    break;
                }
                if let Err(e) = stdin_writer.write_all(msg.as_bytes()).await {
                    eprintln!("Failed to write body: {}", e);
                    break;
                }
            }
        });

        // Reader task (stdout)
        let app_handle_clone = app_handle.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut header_line = String::new();
                if reader.read_line(&mut header_line).await.unwrap_or(0) == 0 {
                    break; // EOF
                }

                if header_line.starts_with("Content-Length: ") {
                    let len_str = header_line.trim().trim_start_matches("Content-Length: ");
                    if let Ok(len) = len_str.parse::<usize>() {
                        // Read empty line
                        let mut empty_line = String::new();
                        let _ = reader.read_line(&mut empty_line).await;

                        // Read body
                        let mut body_buf = vec![0; len];
                        if reader.read_exact(&mut body_buf).await.is_ok() {
                            if let Ok(body_str) = String::from_utf8(body_buf) {
                                // Try parsing as Event or Response
                                if let Ok(event) = serde_json::from_str::<DapEvent>(&body_str) {
                                    let _ = app_handle_clone.emit("dap://event", event);
                                } else if let Ok(response) = serde_json::from_str::<DapResponse>(&body_str) {
                                    // For now, just emit responses too so frontend can correlate
                                    let _ = app_handle_clone.emit("dap://response", response);
                                }
                            }
                        }
                    }
                }
            }
            let _ = app_handle_clone.emit("dap://terminated", ());
        });
        
        // Stderr reader (log to console)
        let app_handle_stderr = app_handle.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr);
            let mut line = String::new();
            while reader.read_line(&mut line).await.unwrap_or(0) > 0 {
                eprintln!("[DAP STDERR] {}", line);
                let _ = app_handle_stderr.emit("dap://output", serde_json::json!({
                    "category": "stderr",
                    "output": line
                }));
                line.clear();
            }
        });

        Ok(Arc::new(Mutex::new(Self {
            child: Some(child),
            tx,
            seq: 1,
        })))
    }

    pub async fn send_request(&mut self, command: &str, args: Option<Value>) -> Result<(), String> {
        let request = DapRequest {
            seq: self.seq,
            type_: "request".to_string(),
            command: command.to_string(),
            arguments: args,
        };
        self.seq += 1;

        let json = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        self.tx.send(json).await.map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill().await;
        }
    }
}

pub struct DapState {
    pub session: Mutex<Option<Arc<Mutex<DapClient>>>>,
}

impl DapState {
    pub fn new() -> Self {
        Self {
            session: Mutex::new(None),
        }
    }
}

pub async fn start_session(
    config: crate::debug::LaunchConfig,
    state: tauri::State<'_, DapState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    tracing::info!(config_name = %config.name, "Starting DAP session");
    config.validate()?;
    let mut session_guard = state.session.lock().await;

    // Stop existing session if any
    if let Some(client) = session_guard.as_ref() {
        let mut client_locked = client.lock().await;
        client_locked.stop().await;
    }

    // Determine adapter executable and args
    let (adapter, args) = if let Some(exe) = config.adapter_executable {
        (exe, vec![])
    } else {
        match config.type_.as_str() {
            "node" | "pwa-node" => {
                // Default to looking for node-debug2-adapter in PATH or similar
                ("node-debug2-adapter".to_string(), vec![])
            }
            _ => return Err(format!("Unsupported debug type: {}", config.type_)),
        }
    };

    let client = DapClient::new(&adapter, &args, app_handle)
        .await
        .map_err(|e| format!("Failed to start debug adapter '{}': {}", adapter, e))?;

    *session_guard = Some(client);
    Ok(())
}

pub async fn stop_session(state: tauri::State<'_, DapState>) -> Result<(), String> {
    tracing::info!("Stopping DAP session");
    let mut session_guard = state.session.lock().await;
    if let Some(client) = session_guard.take() {
        let mut client_locked = client.lock().await;
        client_locked.stop().await;
    }
    Ok(())
}

pub async fn send_command(
    command: String,
    args: Option<Value>,
    state: tauri::State<'_, DapState>,
) -> Result<(), String> {
    // tracing::debug!(command = %command, "Sending DAP command");
    let session_guard = state.session.lock().await;
    if let Some(client) = session_guard.as_ref() {
        let mut client_locked = client.lock().await;
        client_locked.send_request(&command, args).await?;
        Ok(())
    } else {
        Err("No active debug session".to_string())
    }
}

// Helper wrappers for common commands
pub async fn continue_(state: tauri::State<'_, DapState>) -> Result<(), String> {
    send_command("continue".to_string(), Some(serde_json::json!({ "threadId": 1 })), state).await
}

pub async fn next(state: tauri::State<'_, DapState>) -> Result<(), String> {
    send_command("next".to_string(), Some(serde_json::json!({ "threadId": 1 })), state).await
}

pub async fn step_in(state: tauri::State<'_, DapState>) -> Result<(), String> {
    send_command("stepIn".to_string(), Some(serde_json::json!({ "threadId": 1 })), state).await
}

pub async fn step_out(state: tauri::State<'_, DapState>) -> Result<(), String> {
    send_command("stepOut".to_string(), Some(serde_json::json!({ "threadId": 1 })), state).await
}

pub async fn set_breakpoints(
    path: String,
    lines: Vec<u32>,
    state: tauri::State<'_, DapState>,
) -> Result<(), String> {
    let breakpoints: Vec<Value> = lines.iter().map(|line| {
        serde_json::json!({ "line": line })
    }).collect();

    let args = serde_json::json!({
        "source": { "path": path },
        "breakpoints": breakpoints
    });

    send_command("setBreakpoints".to_string(), Some(args), state).await
}

pub async fn threads(state: tauri::State<'_, DapState>) -> Result<(), String> {
    send_command("threads".to_string(), None, state).await
}

pub async fn stack_trace(thread_id: i64, state: tauri::State<'_, DapState>) -> Result<(), String> {
    send_command("stackTrace".to_string(), Some(serde_json::json!({ "threadId": thread_id })), state).await
}

pub async fn scopes(frame_id: i64, state: tauri::State<'_, DapState>) -> Result<(), String> {
    send_command("scopes".to_string(), Some(serde_json::json!({ "frameId": frame_id })), state).await
}

pub async fn variables(variables_reference: i64, state: tauri::State<'_, DapState>) -> Result<(), String> {
    send_command("variables".to_string(), Some(serde_json::json!({ "variablesReference": variables_reference })), state).await
}

pub async fn disconnect(state: tauri::State<'_, DapState>) -> Result<(), String> {
    send_command("disconnect".to_string(), Some(serde_json::json!({ "restart": false })), state).await
}
