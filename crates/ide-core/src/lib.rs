use std::any::Any;
use std::sync::{Arc, RwLock};
use std::collections::HashMap;

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
