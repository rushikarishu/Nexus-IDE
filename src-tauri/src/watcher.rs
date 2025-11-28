use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode, DebounceEventResult};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use crate::AppState;

pub struct FileWatcher {
    debouncer: Arc<Mutex<Option<notify_debouncer_mini::Debouncer<notify_debouncer_mini::notify::RecommendedWatcher>>>>,
}

impl FileWatcher {
    pub fn new() -> Self {
        Self {
            debouncer: Arc::new(Mutex::new(None)),
        }
    }

    pub fn start(&self, app: AppHandle) {
        let app_handle = app.clone();
        let debouncer_mutex = self.debouncer.clone();

        // Spawn a thread or task to handle watching? 
        // Actually notify runs in its own thread. We just need to keep the debouncer alive.
        
        let event_handler = move |res: DebounceEventResult| {
            match res {
                Ok(events) => {
                    for event in events {
                        let path = event.path.to_string_lossy().to_string();
                        // Emit event to frontend
                        // We use a generic "file-change" event. 
                        // The frontend can then refresh git status or file tree.
                        let _ = app_handle.emit("file-change", path);
                    }
                }
                Err(e) => log::error!("File watch error: {:?}", e),
            }
        };

        // Create debouncer with 2 seconds delay (to avoid too many events during git operations)
        let mut debouncer = new_debouncer(Duration::from_secs(2), event_handler).unwrap();

        // Watch workspace roots
        let state = app.state::<Arc<AppState>>();
        if let Ok(roots) = state.workspace_roots.read() {
            for root in roots.iter() {
                let _ = debouncer.watcher().watch(Path::new(root), RecursiveMode::Recursive);
            }
        }

        // Store debouncer to keep it alive
        *debouncer_mutex.lock().unwrap() = Some(debouncer);
        
        // Listen for workspace root changes to update watcher?
        // For now, we assume roots are set at startup or we need a way to update watcher.
        // We can expose a method to update watched paths.
    }
    
    pub fn update_roots(&self, roots: &[String]) {
        if let Some(debouncer) = self.debouncer.lock().unwrap().as_mut() {
            let watcher = debouncer.watcher();
            // Unwatch all? notify doesn't easily support unwatch all without tracking paths.
            // But we can just watch new paths. 
            // Ideally we should track watched paths and unwatch removed ones.
            // For MVP, just watch new ones.
            for root in roots {
                let _ = watcher.watch(Path::new(root), RecursiveMode::Recursive);
            }
        }
    }
}
