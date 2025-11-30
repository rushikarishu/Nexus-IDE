use std::any::Any;
use std::sync::{Arc, RwLock};
use std::collections::HashMap;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
}

impl AppError {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.to_string(),
            message: message.to_string(),
            details: None,
        }
    }

    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = Some(details);
        self
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl From<String> for AppError {
    fn from(error: String) -> Self {
        Self::new("UNKNOWN_ERROR", &error)
    }
}

impl From<&str> for AppError {
    fn from(error: &str) -> Self {
        Self::new("UNKNOWN_ERROR", error)
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        let code = match error.kind() {
            std::io::ErrorKind::NotFound => "FILE_NOT_FOUND",
            std::io::ErrorKind::PermissionDenied => "PERMISSION_DENIED",
            std::io::ErrorKind::AlreadyExists => "ALREADY_EXISTS",
            _ => "IO_ERROR",
        };
        Self::new(code, &error.to_string())
    }
}

pub trait IdePlugin: Any + Send + Sync {
    fn name(&self) -> &str;
    fn on_init(&self, app_state: &Arc<AppState>) -> Result<(), String> {
        let _ = app_state;
        Ok(())
    }
    fn on_shutdown(&self) {}
}

pub trait TerminalHandle: std::io::Write + Send + Sync {
    fn resize(&mut self, rows: u16, cols: u16) -> Result<(), String>;
    fn kill(&mut self) -> Result<(), String>;
}

#[derive(Default)]
pub struct AppState {
    pub plugins: RwLock<HashMap<String, Box<dyn IdePlugin>>>,
    pub terminals: RwLock<HashMap<String, Arc<std::sync::Mutex<Box<dyn TerminalHandle>>>>>,
    pub lsp_processes: RwLock<HashMap<String, Arc<std::sync::Mutex<std::process::Child>>>>,
    pub workspace_roots: RwLock<Vec<String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            plugins: RwLock::new(HashMap::new()),
            terminals: RwLock::new(HashMap::new()),
            lsp_processes: RwLock::new(HashMap::new()),
            workspace_roots: RwLock::new(Vec::new()),
        }
    }

    pub fn register_plugin(&self, plugin: Box<dyn IdePlugin>) -> Result<(), String> {
        let name = plugin.name().to_string();
        let mut plugins = self.plugins.write().map_err(|e| e.to_string())?;
        plugins.insert(name, plugin);
        Ok(())
    }
}
