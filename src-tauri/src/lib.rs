// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

pub use ide_core::{AppState, AppError};
use std::sync::Arc;


use std::fs;
use std::path::Path;

#[derive(serde::Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[tauri::command]
fn set_workspace_roots(paths: Vec<String>, state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut abs_paths = Vec::new();
    
    for path in paths {
        // Ensure workspace root is absolute
        // For existing paths, canonicalize to resolve symlinks
        // For non-existent paths (edge case), use as-is if absolute
        let abs_path = if std::path::Path::new(&path).exists() {
            std::fs::canonicalize(&path)
                .map_err(|e| format!("Failed to canonicalize workspace root: {}", e))?
        } else {
            // Path doesn't exist yet - just ensure it's absolute
            let p = std::path::Path::new(&path);
            if !p.is_absolute() {
                return Err(format!("Workspace root must be an absolute path: {}", path));
            }
            p.to_path_buf()
        };
        abs_paths.push(abs_path.to_string_lossy().to_string());
    }
    
    let mut roots = state.workspace_roots.write().map_err(|e| e.to_string())?;
    *roots = abs_paths;
    Ok(())
}

/// Validates a path against the workspace roots.
/// 
/// This now uses the centralized implementation from ai_core::utils to ensure
/// consistent security behavior across all path operations.
pub fn validate_path(path: &str, state: &Arc<AppState>) -> Result<std::path::PathBuf, String> {
    let roots_guard = state.workspace_roots.read().map_err(|e| e.to_string())?;
    
    if roots_guard.is_empty() {
        return Err("No workspace roots set".to_string());
    }

    // Try to validate against each root. If any succeeds, return that result.
    // If all fail, return the error from the first root (or a generic one).
    
    let mut last_error = String::new();
    
    for root in roots_guard.iter() {
        match ai_core::utils::validate_path(root, path) {
            Ok(p) => return Ok(p),
            Err(e) => last_error = e,
        }
    }
    
    Err(format!("Path validation failed: {}", last_error))
}

pub fn read_dir_impl(path: &str, state: &Arc<AppState>) -> Result<Vec<FileEntry>, AppError> {
    tracing::info!(path = path, "Reading directory");
    let _ = validate_path(path, state).map_err(|e| AppError::new("VALIDATION_ERROR", &e))?;
    let entries = fs::read_dir(path).map_err(AppError::from)?;
    let mut result = Vec::new();

    for entry in entries {
        let entry = entry.map_err(AppError::from)?;
        let path = entry.path();
        let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let is_dir = path.is_dir();
        
        result.push(FileEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
        });
    }
    
    // Sort directories first, then files
    result.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.cmp(&b.name)
        } else if a.is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(result)
}

#[tauri::command]
fn read_dir(path: &str, state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<FileEntry>, AppError> {
    read_dir_impl(path, &state)
}

/// Maximum file size to read (10 MB)
const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024;

/// Check if a file appears to be binary
fn is_binary_file(path: &std::path::Path) -> bool {
    // Check by extension first
    let binary_extensions = [
        "exe", "dll", "so", "dylib", "bin", "o", "a", "lib",
        "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "svg",
        "mp3", "mp4", "avi", "mkv", "mov", "wav", "flac", "ogg",
        "zip", "tar", "gz", "bz2", "xz", "7z", "rar",
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
        "wasm", "pyc", "class", "jar",
    ];
    
    if let Some(ext) = path.extension() {
        let ext_lower = ext.to_string_lossy().to_lowercase();
        if binary_extensions.contains(&ext_lower.as_str()) {
            return true;
        }
    }
    
    // Check first few bytes for null characters (binary indicator)
    if let Ok(file) = std::fs::File::open(path) {
        use std::io::Read;
        let mut buffer = [0u8; 1024];
        let mut reader = std::io::BufReader::new(file);
        if let Ok(n) = reader.read(&mut buffer) {
            // Check for null bytes which typically indicate binary content
            if buffer[..n].contains(&0) {
                return true;
            }
        }
    }
    
    false
}

pub fn read_file_impl(path: &str, state: &Arc<AppState>) -> Result<String, AppError> {
    tracing::info!(path = path, "Reading file");
    let validated_path = validate_path(path, state).map_err(|e| AppError::new("VALIDATION_ERROR", &e))?;
    
    // Check file size
    let metadata = fs::metadata(&validated_path).map_err(AppError::from)?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(AppError::new("FILE_TOO_LARGE", &format!(
            "File too large ({} bytes). Maximum size is {} bytes.",
            metadata.len(),
            MAX_FILE_SIZE
        )));
    }
    
    // Check if binary
    if is_binary_file(&validated_path) {
        return Err(AppError::new("BINARY_FILE", &format!(
            "Cannot read binary file: {}. Use a hex viewer or download the file.",
            path
        )));
    }
    
    fs::read_to_string(&validated_path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::InvalidData {
            AppError::new("INVALID_UTF8", &format!("File appears to contain invalid UTF-8 data. It may be a binary file: {}", path))
        } else {
            AppError::from(e)
        }
    })
}

#[tauri::command]
fn read_file(path: &str, state: tauri::State<'_, Arc<AppState>>) -> Result<String, AppError> {
    read_file_impl(path, &state)
}

pub fn save_file_impl(path: &str, content: &str, state: &Arc<AppState>) -> Result<(), AppError> {
    tracing::info!(path = path, size = content.len(), "Saving file");
    let _ = validate_path(path, state).map_err(|e| AppError::new("VALIDATION_ERROR", &e))?;
    fs::write(path, content).map_err(AppError::from)
}

#[tauri::command]
fn save_file(path: &str, content: &str, state: tauri::State<'_, Arc<AppState>>) -> Result<(), AppError> {
    save_file_impl(path, content, &state)
}

pub fn create_file_impl(path: &str, state: &Arc<AppState>) -> Result<(), String> {
    tracing::info!(path = path, "Creating file");
    let _ = validate_path(path, state)?;
    if Path::new(path).exists() {
        return Err("File already exists".to_string());
    }
    fs::write(path, "").map_err(|e| e.to_string())
}

#[tauri::command]
fn create_file(path: &str, state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    create_file_impl(path, &state)
}

pub fn create_dir_impl(path: &str, state: &Arc<AppState>) -> Result<(), String> {
    tracing::info!(path = path, "Creating directory");
    let _ = validate_path(path, state)?;
    if Path::new(path).exists() {
        return Err("Directory already exists".to_string());
    }
    fs::create_dir_all(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_dir(path: &str, state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    create_dir_impl(path, &state)
}

pub fn delete_file_impl(path: &str, state: &Arc<AppState>) -> Result<(), String> {
    tracing::info!(path = path, "Deleting file/directory");
    let p = validate_path(path, state)?;
    if p.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn delete_file(path: &str, state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    delete_file_impl(path, &state)
}

#[tauri::command]
fn rename_file(old_path: &str, new_path: &str, state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    let _ = validate_path(old_path, &state)?;
    let _ = validate_path(new_path, &state)?;
    fs::rename(old_path, new_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn search_files(query: &str, path: &str, state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<String>, String> {
    let _ = validate_path(path, &state)?;
    let mut results = Vec::new();
    
    // Case-insensitive search
    let query_lower = query.to_lowercase();
    
    for entry in walkdir::WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let path = entry.path();
            // Skip hidden directories and files by checking components
            let is_hidden = path.components().any(|c| {
                c.as_os_str().to_string_lossy().starts_with('.')
            });

            if is_hidden {
                continue;
            }
            
            // Optional: Skip common build/vendor directories for performance
            let path_str = path.to_string_lossy();
            if path_str.contains("/node_modules/") || path_str.contains("\\node_modules\\") ||
               path_str.contains("/target/") || path_str.contains("\\target\\") ||
               path_str.contains("/dist/") || path_str.contains("\\dist\\") {
                continue;
            }

            // First, match on file name so users can search by file name as well as content
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.to_lowercase().contains(&query_lower) {
                    results.push(path_str.to_string());
                    if results.len() >= 50 { break; }
                    continue;
                }
            }

            // Fallback to content search (case-insensitive)
            if let Ok(content) = fs::read_to_string(path) {
                if content.to_lowercase().contains(&query_lower) {
                    results.push(path_str.to_string());
                    if results.len() >= 50 { break; } // Limit results
                }
            }
        }
    }
    Ok(results)
}

mod terminal;
mod lsp;
mod language_config;
mod ai;
mod audit;
pub mod git;
mod search;
mod tasks;
mod plugins;
mod debug;
pub mod dap;
mod test_runner;
mod startup;
use terminal::run_file;
use ai_core::manager::SessionManager;
use dap::DapState;

/// Validates critical environment variables at startup and logs warnings for missing ones.
fn validate_environment() {
    let mut warnings = Vec::new();
    let mut info = Vec::new();
    
    // Check for AI provider token
    if std::env::var("CHUTES_API_TOKEN").is_err() && std::env::var("INTERNAL_LLM_TOKEN").is_err() {
        warnings.push("CHUTES_API_TOKEN not set. AI features will not work. See .env.example for configuration.".to_string());
    } else {
        info.push("AI provider token configured.".to_string());
    }
    
    // Check for Qdrant (optional but recommended for Compass agent)
    match std::env::var("QDRANT_URL") {
        Ok(url) => {
            info.push(format!("Qdrant URL configured: {}", url));
            if std::env::var("QDRANT_COLLECTION").is_err() {
                warnings.push("QDRANT_COLLECTION not set. Using default collection name.".to_string());
            }
        }
        Err(_) => {
            info.push("QDRANT_URL not set. Compass agent RAG features will be disabled.".to_string());
        }
    }
    
    // Log info messages
    for msg in info {
        log::info!("[Environment] {}", msg);
    }
    
    // Log all warnings
    for warning in warnings {
        log::warn!("[Environment] {}", warning);
    }
}

#[tauri::command]
fn log_event(level: String, message: String, context: Option<serde_json::Value>) {
    match level.as_str() {
        "info" => tracing::info!(context = ?context, "{}", message),
        "warn" => tracing::warn!(context = ?context, "{}", message),
        "error" => tracing::error!(context = ?context, "{}", message),
        "debug" => tracing::debug!(context = ?context, "{}", message),
        _ => tracing::info!(context = ?context, "[{}] {}", level, message),
    }
}

fn init_logging() {
    let file_appender = tracing_appender::rolling::never(".", "nexus-ide.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);
    
    // We need to keep _guard alive, but for a Tauri app, leaking it is acceptable 
    // or we can store it in AppState if strictly necessary. 
    // For simplicity in this task, we'll leak it to ensure logs are flushed on exit.
    Box::leak(Box::new(_guard));

    tracing_subscriber::fmt()
        .with_writer(non_blocking)
        .with_ansi(false)
        .with_target(false)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .init();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenv::dotenv().ok();
    // env_logger::init(); // Replaced by tracing
    init_logging();
    
    tracing::info!("Nexus IDE Backend Started");

    // Validate critical environment variables at startup
    validate_environment();
    
    // Initialize dependencies (Qdrant, LLM health check, etc.) in background
    tauri::async_runtime::spawn(async {
        let status = startup::initialize_dependencies().await;
        log::info!(
            "Dependency initialization complete - Qdrant: {}, LLM: {}",
            status.qdrant_running,
            status.llm_available
        );
    });
    
    let app_state = Arc::new(AppState::new());
    
    // Initialize audit logger (now uses std::sync::mpsc, doesn't need Tokio runtime)
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let nexus_dir = cwd.join(".nexus");
    
    // Ensure .nexus directory exists
    if !nexus_dir.exists() {
        let _ = std::fs::create_dir_all(&nexus_dir);
    }

    let audit_path = nexus_dir.join("audit.jsonl");
    
    let audit_logger: Arc<dyn ai_core::audit::AuditLogger> = 
        ai_core::audit::AsyncAuditLogger::new(audit_path)
            .map(|logger| Arc::new(logger) as Arc<dyn ai_core::audit::AuditLogger>)
            .unwrap_or_else(|e| {
                log::warn!("Failed to initialize audit logger: {}. Using no-op logger.", e);
                Arc::new(ai_core::audit::NoOpLogger) as Arc<dyn ai_core::audit::AuditLogger>
            });
    
    let session_manager = Arc::new(SessionManager::new(audit_logger));
    let dap_state = DapState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .manage(session_manager)
        .manage(dap_state)
        .invoke_handler(tauri::generate_handler![
            greet, 
            log_event, // Added log_event
            read_dir, 
            read_file, 
            save_file, 
            create_file,
            create_dir,
            delete_file,
            rename_file,
            terminal::create_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::destroy_terminal,
            lsp::start_lsp,
            lsp::send_lsp_request,
            lsp::shutdown_lsp,
            get_default_path,
            join_path,
            get_parent_path,
            get_parent_path,
            search_files,
            set_workspace_roots,
            run_file,
            ai::ai_create_session,
            ai::ai_send_prompt,
            ai::ai_send_prompt_streaming,
            ai::ai_list_proposals,
            ai::ai_approve_tool,
            ai::ai_reject_tool,
            ai::ai_compass_run,
            ai::ai_compass_run_streaming,
            ai::get_rag_status,
            audit::ai_get_audit_logs,
            git::git_status,
            git::git_add,
            git::git_reset,
            git::git_commit,
            git::git_diff,
            git::git_get_branches,
            git::git_checkout_branch,
            git::git_create_branch,
            git::git_delete_branch,
            git::git_log,
            git::git_blame,
            git::git_stash_save,
            git::git_stash_list,
            git::git_stash_apply,
            git::git_stash_drop,
            search::search_text,
            search::replace_text,
            tasks::get_tasks,
            tasks::run_task,
            plugins::get_plugins,
            plugins::load_plugin_script,
            debug::get_launch_configurations,
            debug::debug_launch,
            dap_start_session,
            dap_stop_session,
            dap_send_command,
            dap_continue,
            dap_next,
            dap_step_in,
            dap_step_out,
            dap_set_breakpoints,
            dap_threads,
            dap_stack_trace,
            dap_scopes,
            dap_variables,
            dap_disconnect,
            test_runner::discover_tests,
            startup::restart_qdrant
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                use tauri::Manager;
                let state = app_handle.state::<DapState>();
                let _ = tauri::async_runtime::block_on(dap::stop_session(state));
            }
        });
}

#[tauri::command]
async fn dap_start_session(
    config: debug::LaunchConfig,
    state: tauri::State<'_, DapState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    dap::start_session(config, state, app_handle).await
}

#[tauri::command]
async fn dap_stop_session(state: tauri::State<'_, DapState>) -> Result<(), String> {
    dap::stop_session(state).await
}

#[tauri::command]
async fn dap_send_command(
    command: String,
    args: Option<serde_json::Value>,
    state: tauri::State<'_, DapState>,
) -> Result<(), String> {
    dap::send_command(command, args, state).await
}

#[tauri::command]
async fn dap_continue(state: tauri::State<'_, DapState>) -> Result<(), String> {
    dap::continue_(state).await
}

#[tauri::command]
async fn dap_next(state: tauri::State<'_, DapState>) -> Result<(), String> {
    dap::next(state).await
}

#[tauri::command]
async fn dap_step_in(state: tauri::State<'_, DapState>) -> Result<(), String> {
    dap::step_in(state).await
}

#[tauri::command]
async fn dap_step_out(state: tauri::State<'_, DapState>) -> Result<(), String> {
    dap::step_out(state).await
}

#[tauri::command]
async fn dap_set_breakpoints(
    path: String,
    lines: Vec<u32>,
    state: tauri::State<'_, DapState>,
) -> Result<(), String> {
    dap::set_breakpoints(path, lines, state).await
}

#[tauri::command]
async fn dap_threads(state: tauri::State<'_, DapState>) -> Result<(), String> {
    dap::threads(state).await
}

#[tauri::command]
async fn dap_stack_trace(thread_id: i64, state: tauri::State<'_, DapState>) -> Result<(), String> {
    dap::stack_trace(thread_id, state).await
}

#[tauri::command]
async fn dap_scopes(frame_id: i64, state: tauri::State<'_, DapState>) -> Result<(), String> {
    dap::scopes(frame_id, state).await
}

#[tauri::command]
async fn dap_variables(variables_reference: i64, state: tauri::State<'_, DapState>) -> Result<(), String> {
    dap::variables(variables_reference, state).await
}

#[tauri::command]
async fn dap_disconnect(state: tauri::State<'_, DapState>) -> Result<(), String> {
    dap::disconnect(state).await
}

#[tauri::command]
fn get_default_path() -> String {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string())
}

#[tauri::command]
fn join_path(parent: String, child: String) -> String {
    std::path::Path::new(&parent).join(&child).to_string_lossy().to_string()
}

#[tauri::command]
fn get_parent_path(path: String) -> String {
    std::path::Path::new(&path).parent().map(|p| p.to_string_lossy().to_string()).unwrap_or(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_path_valid() {
        let state = Arc::new(AppState::new());
        {
            let mut roots = state.workspace_roots.write().unwrap();
            roots.push("/home/user".to_string());
        }
        assert!(validate_path("/home/user/file.txt", &state).is_ok());
        assert!(validate_path("src/main.rs", &state).is_ok());
    }

    #[test]
    fn test_validate_path_traversal() {
        let state = Arc::new(AppState::new());
        {
            let mut roots = state.workspace_roots.write().unwrap();
            roots.push("/home/user".to_string());
        }
        assert!(validate_path("../secret", &state).is_err());
        assert!(validate_path("/home/user/../../etc/passwd", &state).is_err());
        assert!(validate_path("folder/../file", &state).is_err());
    }

    #[test]
    fn test_validate_path_empty() {
        let state = Arc::new(AppState::new());
        {
            let mut roots = state.workspace_roots.write().unwrap();
            roots.push("/home/user".to_string());
        }
        // Empty path is technically valid as current dir (i.e. workspace root), but let's check behavior
        assert!(validate_path("", &state).is_ok());
    }
    
    #[test]
    fn test_validate_path_workspace_root() {
        let state = Arc::new(AppState::new());
        {
            let mut roots = state.workspace_roots.write().unwrap();
            roots.push("/home/user/project".to_string());
        }
        
        // Should pass if inside root
        assert!(validate_path("/home/user/project/src/main.rs", &state).is_ok());
        
        // Should fail if outside root
        assert!(validate_path("/home/user/other/file.txt", &state).is_err());
        
        // Should fail if traversal attempts to escape
        assert!(validate_path("/home/user/project/../secret.txt", &state).is_err());
    }

    #[test]
    fn test_validate_path_multi_root() {
        let state = Arc::new(AppState::new());
        {
            let mut roots = state.workspace_roots.write().unwrap();
            roots.push("/home/user/project1".to_string());
            roots.push("/home/user/project2".to_string());
        }

        // Should pass if inside root 1
        assert!(validate_path("/home/user/project1/src/main.rs", &state).is_ok());
        
        // Should pass if inside root 2
        assert!(validate_path("/home/user/project2/src/lib.rs", &state).is_ok());
        
        // Should fail if outside both
        assert!(validate_path("/home/user/project3/file.txt", &state).is_err());
    }
}
