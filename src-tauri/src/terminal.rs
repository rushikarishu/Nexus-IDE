use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, MasterPty, Child};
use std::io::{Read, Write, BufRead};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{Emitter, Window, State};
use ide_core::{AppState, TerminalHandle};

// Wrapper to implement TerminalHandle for PtyMaster
struct PtyWrapper {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    _child: Arc<Mutex<Box<dyn Child + Send>>>,
}

impl Write for PtyWrapper {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let mut writer = self.writer.lock().map_err(|e| std::io::Error::other(e.to_string()))?;
        writer.write(buf)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        let mut writer = self.writer.lock().map_err(|e| std::io::Error::other(e.to_string()))?;
        writer.flush()
    }
}

impl TerminalHandle for PtyWrapper {
    fn resize(&mut self, rows: u16, cols: u16) -> Result<(), String> {
        let master = self.master.lock().map_err(|e| e.to_string())?;
        master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())
    }

    fn kill(&mut self) -> Result<(), String> {
        let mut child = self._child.lock().map_err(|e| e.to_string())?;
        child.kill().map_err(|e| e.to_string())?;
        let _ = child.wait().map_err(|e| e.to_string());
        Ok(())
    }
}

impl Drop for PtyWrapper {
    fn drop(&mut self) {
        let _ = self.kill();
    }
}

#[tauri::command]
pub fn create_terminal(id: String, window: Window, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    tracing::info!(id = %id, "Creating terminal");
    let pty_system = NativePtySystem::default();

    let pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| e.to_string())?;

    let cmd = CommandBuilder::new("bash");
    let child = match pair.slave.spawn_command(cmd) {
        Ok(child) => child,
        Err(_) => {
            // Fallback to sh if bash fails
            let cmd = CommandBuilder::new("sh");
            pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?
        }
    };

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    
    let terminal_id = id.clone();
    let terminal_id_clone = terminal_id.clone();

    // Capture AppState for cleanup in case of reader thread panic
    let app_state = state.inner().clone();

    let pty_wrapper = PtyWrapper {
        master: Arc::new(Mutex::new(pair.master)),
        writer: Arc::new(Mutex::new(writer)),
        _child: Arc::new(Mutex::new(child)),
    };

    // Store wrapper
    {
        let mut terminals = state.terminals.write().map_err(|e| e.to_string())?;
        terminals.insert(terminal_id.clone(), Arc::new(Mutex::new(Box::new(pty_wrapper))));
    }

    thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut buffer = [0u8; 1024];
            loop {
                match reader.read(&mut buffer) {
                    Ok(n) if n > 0 => {
                        let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                        let _ = window.emit(&format!("terminal-data-{}", terminal_id_clone), data);
                    }
                    // EOF or read error – just stop normally
                    _ => break,
                }
            }
        }));

        if result.is_err() {
            // Best-effort cleanup on panic: kill PTY and remove handle
            let _ = window.emit(
                &format!("terminal-error-{}", terminal_id),
            "Terminal backend crashed. The session will be closed.".to_string(),
            );

            if let Ok(mut terminals) = app_state.terminals.write() {
                if let Some(handle) = terminals.remove(&terminal_id) {
                    if let Ok(mut handle) = handle.lock() {
                        let _ = handle.kill();
                    }
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn write_terminal(id: &str, data: &str, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    // tracing::debug!(id = %id, data_len = data.len(), "Writing to terminal"); // Debug level to avoid spam
    let terminals = state.terminals.read().map_err(|e| e.to_string())?;
    if let Some(handle) = terminals.get(id) {
        let mut handle = handle.lock().map_err(|e| e.to_string())?;
        write!(handle, "{}", data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn resize_terminal(id: &str, rows: u16, cols: u16, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    tracing::info!(id = %id, rows = rows, cols = cols, "Resizing terminal");
    let terminals = state.terminals.read().map_err(|e| e.to_string())?;
    if let Some(handle) = terminals.get(id) {
        let mut handle = handle.lock().map_err(|e| e.to_string())?;
        handle.resize(rows, cols)?;
    }
    Ok(())
}

#[tauri::command]
pub fn destroy_terminal(id: &str, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    tracing::info!(id = %id, "Destroying terminal");
    let mut terminals = state.terminals.write().map_err(|e| e.to_string())?;
    if let Some(handle) = terminals.remove(id) {
        let mut handle = handle.lock().map_err(|e| e.to_string())?;
        handle.kill()?;
    }
    Ok(())
}

use crate::language_config;

// Type alias to simplify function signature
type CommandResult = Result<(String, Vec<String>, bool, Option<(String, Vec<String>)>), String>;

fn get_command_for_file(path: &str) -> CommandResult {
    // Returns: (command, args, needs_compilation, compile_command_if_needed)
    let language = language_config::get_language_from_extension(path)
        .ok_or_else(|| "Unsupported file type".to_string())?;
    
    let run_config = language_config::get_run_config(&language)
        .ok_or_else(|| format!("Run not configured for language: {}", language))?;
    
    let mut args = Vec::new();
    let mut command = run_config.command.to_string();
    
    let file_path = std::path::Path::new(path);
    let file_stem = file_path.file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Invalid file name")?;
    let parent = file_path.parent().unwrap_or_else(|| std::path::Path::new("."));
    let class_dir = parent.to_string_lossy().to_string();
    
    // Process args template
    for arg in run_config.args_template {
        let processed_arg = arg
            .replace("{file}", path)
            .replace("{class_dir}", &class_dir)
            .replace("{main_class}", file_stem);
        args.push(processed_arg);
    }
    
    // Handle compilation if needed
    let compile_cmd = if run_config.requires_compilation {
        if let Some(compile_config) = run_config.compile_command {
            let output_path = parent.join(format!("{}{}", file_stem, compile_config.output_extension));
            let output_str = output_path.to_string_lossy().to_string();
            
            let mut compile_args = Vec::new();
            for arg in compile_config.args_template {
                let processed = arg.replace("{file}", path).replace("{output}", &output_str);
                compile_args.push(processed);
            }
            
            // Update run command to use compiled output
            if command == "{output}" {
                command = output_str.clone();
            }
            
            Some((compile_config.command.to_string(), compile_args))
        } else {
            return Err("Compilation required but no compile config".to_string());
        }
    } else {
        None
    };
    
    Ok((command, args, run_config.requires_compilation, compile_cmd))
}

#[tauri::command]
pub fn run_file(path: String, terminal_id: String, state: State<'_, Arc<AppState>>, window: Window) -> Result<(), String> {
    tracing::info!(path = %path, terminal_id = %terminal_id, "Running file");
    let (run_cmd, run_args, needs_compilation, compile_cmd) = get_command_for_file(&path)?;
    
    // Validate path against workspace root
    let _ = crate::validate_path(&path, &state)?;

    let file_path = std::path::Path::new(&path);
    let parent_dir = file_path.parent().unwrap_or_else(|| std::path::Path::new("."));

    // Special handling for Rust: find Cargo.toml
    if path.ends_with(".rs") {
        let mut current = parent_dir;
        loop {
            if current.join("Cargo.toml").exists() {
                // Run from cargo project root
                let mut command = std::process::Command::new(&run_cmd);
                command.args(&run_args);
                command.current_dir(current);
                command.stdout(std::process::Stdio::piped());
                command.stderr(std::process::Stdio::piped());
                
                return execute_command(command, terminal_id, window);
            }
            match current.parent() {
                Some(p) => current = p,
                None => break,
            }
        }
    }

    // Compilation step if needed
    // Compilation step if needed
    if needs_compilation {
        if let Some((compile_command, compile_args)) = &compile_cmd {
            let window_clone = window.clone();
            let tid_clone = terminal_id.clone();
            
            // Emit compilation start message
            let _ = window_clone.emit(
                &format!("terminal-data-{}", tid_clone),
                format!("Compiling: {} {}\\r\\n", compile_command, compile_args.join(" "))
            );
            
            let mut cmd = std::process::Command::new(compile_command);
            cmd.args(compile_args);
            cmd.current_dir(parent_dir);
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());
            
            let mut child = cmd.spawn().map_err(|e| {
                let err_msg = format!(
                    "Failed to start compiler '{}'. Please ensure it is installed: {}",
                    compile_command, e
                );
                let _ = window_clone.emit(
                    &format!("terminal-data-{}", tid_clone),
                    format!("{}\\r\\n", err_msg)
                );
                err_msg
            })?;
            
            // Stream compilation output
            if let Some(stdout) = child.stdout.take() {
                let window_clone2 = window_clone.clone();
                let tid_clone2 = tid_clone.clone();
                thread::spawn(move || {
                    let reader = std::io::BufReader::new(stdout);
                    for l in reader.lines().map_while(Result::ok) {
                        let _ = window_clone2.emit(&format!("terminal-data-{}", tid_clone2), format!("{}\\r\\n", l));
                    }
                });
            }
            
            if let Some(stderr) = child.stderr.take() {
                let window_clone2 = window_clone.clone();
                let tid_clone2 = tid_clone.clone();
                thread::spawn(move || {
                    let reader = std::io::BufReader::new(stderr);
                    for l in reader.lines().map_while(Result::ok) {
                        let _ = window_clone2.emit(&format!("terminal-data-{}", tid_clone2), format!("{}\\r\\n", l));
                    }
                });
            }
            
            // Wait for compilation
            let status = child.wait().map_err(|e| format!("Compilation failed: {}", e))?;
            
            if !status.success() {
                let err_msg = format!("Compilation failed with exit code: {:?}\\r\\n", status.code());
                let _ = window_clone.emit(&format!("terminal-data-{}", tid_clone), err_msg.clone());
                return Err(err_msg);
            }
            
            let _ = window_clone.emit(
                &format!("terminal-data-{}", tid_clone),
                "Compilation successful. Running...\\r\\n".to_string()
            );
        }
    }

    // Construct the command string
    let mut full_command = String::new();
    
    // Handle compilation if needed
    if needs_compilation {
        if let Some((compile_command, compile_args)) = &compile_cmd {
            full_command.push_str(compile_command);
            for arg in compile_args {
                full_command.push(' ');
                full_command.push_str(&shell_escape::escape(std::borrow::Cow::from(arg.as_str())));
            }
            full_command.push_str(" && ");
        }
    }

    full_command.push_str(&run_cmd);
    for arg in run_args {
        full_command.push(' ');
        full_command.push_str(&shell_escape::escape(std::borrow::Cow::from(arg)));
    }
    full_command.push('\r');

    // Write to the terminal PTY
    let terminals = state.terminals.read().map_err(|e| e.to_string())?;
    if let Some(handle) = terminals.get(&terminal_id) {
        let mut handle = handle.lock().map_err(|e| e.to_string())?;
        write!(handle, "{}", full_command).map_err(|e| e.to_string())?;
    } else {
        return Err(format!("Terminal {} not found. Please open a terminal first.", terminal_id));
    }

    Ok(())
}

// Helper function to execute a command and stream output
pub fn execute_command(mut command: std::process::Command, terminal_id: String, window: Window) -> Result<(), String> {
    let mut child = command.spawn().map_err(|e| {
        let err_msg = format!("Failed to execute command: {}", e);
        let _ = window.emit(&format!("terminal-data-{}", terminal_id), format!("{}\\r\\n", err_msg));
        err_msg
    })?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    let window_clone = window.clone();
    let tid = terminal_id.clone();
    
    // Stream stdout
    thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        for l in reader.lines().map_while(Result::ok) {
            let _ = window_clone.emit(&format!("terminal-data-{}", tid), format!("{}\\r\\n", l));
        }
    });

    let window_clone2 = window.clone();
    let tid2 = terminal_id.clone();
    
    // Stream stderr
    thread::spawn(move || {
        let reader = std::io::BufReader::new(stderr);
        for l in reader.lines().map_while(Result::ok) {
            let _ = window_clone2.emit(&format!("terminal-data-{}", tid2), format!("{}\\r\\n", l));
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_command_for_rs() {
        let (cmd, args, _, _) = get_command_for_file("/path/to/main.rs").unwrap();
        assert_eq!(cmd, "cargo");
        assert_eq!(args, vec!["run"]);
    }

    #[test]
    fn test_get_command_for_js() {
        let (cmd, args, needs_compile, _) = get_command_for_file("/path/to/script.js").unwrap();
        assert_eq!(cmd, "node");
        assert_eq!(args, vec!["/path/to/script.js"]);
        assert!(!needs_compile);
    }

    #[test]
    fn test_get_command_for_ts() {
        let (cmd, args, _, _) = get_command_for_file("/path/to/script.ts").unwrap();
        assert_eq!(cmd, "ts-node");
        assert_eq!(args, vec!["/path/to/script.ts"]);
    }

    #[test]
    fn test_get_command_for_py() {
        let (cmd, args, _, _) = get_command_for_file("/path/to/script.py").unwrap();
        // Platform-specific, but should have python or python3
        assert!(cmd.contains("python"));
        assert_eq!(args, vec!["/path/to/script.py"]);
    }

    #[test]
    fn test_get_command_for_go() {
        let (cmd, args, _, _) = get_command_for_file("/path/to/main.go").unwrap();
        assert_eq!(cmd, "go");
        assert_eq!(args, vec!["run", "/path/to/main.go"]);
    }

    #[test]
    fn test_get_command_for_c_requires_compilation() {
        let (_, _, needs_compile, compile_cmd) = get_command_for_file("/path/to/program.c").unwrap();
        assert!(needs_compile);
        assert!(compile_cmd.is_some());
    }

    #[test]
    fn test_get_command_for_cpp_requires_compilation() {
        let (_, _, needs_compile, compile_cmd) = get_command_for_file("/path/to/program.cpp").unwrap();
        assert!(needs_compile);
        assert!(compile_cmd.is_some());
    }

    #[test]
    fn test_unsupported_file() {
        let result = get_command_for_file("/path/to/image.png");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Unsupported file type");
    }
}
