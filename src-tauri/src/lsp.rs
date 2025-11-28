use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::io::{BufRead, BufReader, Read, Write};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Window, State};
use ide_core::AppState;
use crate::language_config;

/// LSP startup timeout in seconds
const LSP_STARTUP_TIMEOUT_SECS: u64 = 10;

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

    // Try to start the LSP server with timeout
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

    // Give the LSP server a moment to start
    thread::sleep(Duration::from_millis(500));
    
    // Check if process is still running after startup delay
    match child.try_wait() {
        Ok(Some(status)) => {
            return Err(format!(
                "LSP server '{}' exited immediately with status: {:?}",
                lsp_config.command, status
            ));
        }
        Ok(None) => {
            // Process is running - good!
        }
        Err(e) => {
            return Err(format!("Failed to check LSP server status: {}", e));
        }
    }

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
    
    if let Some(child_arc) = processes.get(&language) {
        let mut child = child_arc.lock().map_err(|e| e.to_string())?;
        
        // Try graceful shutdown first
        if let Some(stdin) = child.stdin.as_mut() {
            // Send LSP shutdown request (JSON-RPC)
            let shutdown_request = serde_json::json!({
                "jsonrpc": "2.0",
                "id": 999,
                "method": "shutdown",
                "params": null
            });
            let shutdown_msg = serde_json::to_string(&shutdown_request).unwrap();
            let full_msg = format!("Content-Length: {}\r\n\r\n{}", shutdown_msg.len(), shutdown_msg);
            
            if stdin.write_all(full_msg.as_bytes()).is_ok() {
                // Wait a bit for shutdown response
                thread::sleep(Duration::from_millis(500));
                
                // Send exit notification
                let exit_notification = serde_json::json!({
                    "jsonrpc": "2.0",
                    "method": "exit",
                    "params": null
                });
                let exit_msg = serde_json::to_string(&exit_notification).unwrap();
                let full_exit = format!("Content-Length: {}\r\n\r\n{}", exit_msg.len(), exit_msg);
                let _ = stdin.write_all(full_exit.as_bytes());
                
                // Wait for graceful exit
                thread::sleep(Duration::from_millis(500));
            }
        }
        
        // If still running, kill it
        match child.try_wait() {
            Ok(Some(_)) => {
                // Process already exited gracefully
                tracing::info!(language = %language, "LSP server exited gracefully");
            }
            Ok(None) | Err(_) => {
                // Still running or error checking - force kill
                tracing::warn!(language = %language, "LSP server did not exit gracefully, forcing kill");
                child.kill().map_err(|e| e.to_string())?;
            }
        }
    }
    
    processes.remove(&language);
    Ok(())
}
