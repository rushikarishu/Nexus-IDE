use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::io::{BufRead, BufReader, Read, Write};
use std::thread;
use tauri::{Emitter, Window, State};
use ide_core::AppState;
use crate::language_config;

#[tauri::command]
pub fn start_lsp(window: Window, state: State<'_, Arc<AppState>>, language: String) -> Result<(), String> {
    tracing::info!(language = %language, "Starting LSP");
    // Get language configuration
    let lsp_config = language_config::get_lsp_config(&language)
        .ok_or_else(|| format!("LSP not configured for language: {}", language))?;

    // Check if LSP for this language is already running
    {
        let processes = state.lsp_processes.read().map_err(|e| e.to_string())?;
        if processes.contains_key(&language) {
            return Ok(()); // Already running
        }
    }

    // Try to start the LSP server
    let mut child = Command::new(lsp_config.command)
        .args(lsp_config.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            let error_msg = format!(
                "Failed to start {} LSP server. Please ensure '{}' is installed and in your PATH: {}",
                language, lsp_config.command, e
            );
            // Emit user-friendly error event
            let _ = window.emit("lsp-error", serde_json::json!({
                "language": &language,
                "command": lsp_config.command,
                "error": error_msg.clone()
            }));
            error_msg
        })?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    // Store child process (and kill old one if exists, though we checked above)
    {
        let mut processes = state.lsp_processes.write().map_err(|e| e.to_string())?;
        if let Some(old_child) = processes.get(&language) {
            let mut old_child = old_child.lock().map_err(|e| e.to_string())?;
            let _ = old_child.kill();
        }
        processes.insert(language.clone(), Arc::new(Mutex::new(child)));
    }

    // Read stdout (JSON-RPC)
    let window_clone = window.clone();
    let language_clone = language.clone();
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut buffer = String::new();
        
        loop {
            buffer.clear();
            match reader.read_line(&mut buffer) {
                Ok(0) => break,
                Ok(_) => {
                     if buffer.starts_with("Content-Length: ") {
                         if let Some(rest) = buffer.trim().strip_prefix("Content-Length: ") {
                             if let Ok(len) = rest.parse::<usize>() {
                                 let _ = reader.read_line(&mut buffer); // Skip empty line
                                 
                                 let mut body_buf = vec![0; len];
                                 if reader.read_exact(&mut body_buf).is_ok() {
                                     let body = String::from_utf8_lossy(&body_buf).to_string();
                                     
                                     // Emit namespaced lsp-message event
                                     let _ = window_clone.emit(&format!("lsp-message-{}", language_clone), body.clone());
                                     
                                     // Check if this is a publishDiagnostics notification
                                     if let Ok(message) = serde_json::from_str::<serde_json::Value>(&body) {
                                         if let Some(method) = message.get("method").and_then(|m| m.as_str()) {
                                             if method == "textDocument/publishDiagnostics" {
                                                 if let Some(params) = message.get("params") {
                                                     // Emit specific namespaced diagnostics event
                                                     let _ = window_clone.emit(&format!("lsp-diagnostics-{}", language_clone), serde_json::json!({
                                                         "language": &language_clone,
                                                         "uri": params.get("uri"),
                                                         "diagnostics": params.get("diagnostics")
                                                     }));
                                                 }
                                             }
                                         }
                                     }
                                 }
                             }
                         }
                     }
                }
                Err(_) => break,
            }
        }
    });

    // Read stderr
    let lang_name = language.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for l in reader.lines().map_while(Result::ok) {
            tracing::warn!(language = %lang_name, "LSP Stderr: {}", l);
        }
    });

    // Emit success event
    let _ = window.emit("lsp-started", serde_json::json!({
        "language": &language,
        "command": lsp_config.command
    }));

    Ok(())
}

#[tauri::command]
pub fn send_lsp_request(language: String, msg: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    // tracing::debug!(language = %language, msg_len = msg.len(), "Sending LSP request");
    let processes = state.lsp_processes.read().map_err(|e| e.to_string())?;
    if let Some(child) = processes.get(&language) {
        let mut child = child.lock().map_err(|e| e.to_string())?;
        if let Some(stdin) = child.stdin.as_mut() {
            let content_length = msg.len();
            let full_msg = format!("Content-Length: {}\r\n\r\n{}", content_length, msg);
            stdin.write_all(full_msg.as_bytes()).map_err(|e| e.to_string())?;
        } else {
            return Err("LSP process has no stdin".to_string());
        }
    } else {
        return Err(format!("No LSP running for {}", language));
    }
    Ok(())
}

#[tauri::command]
pub fn shutdown_lsp(language: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    tracing::info!(language = %language, "Shutting down LSP");
    let mut processes = state.lsp_processes.write().map_err(|e| e.to_string())?;
    if let Some(child) = processes.remove(&language) {
        let mut child = child.lock().map_err(|e| e.to_string())?;
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}
