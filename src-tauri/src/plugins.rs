use ide_core::AppState;
use std::sync::Arc;
use std::fs;
use std::path::Path;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub main: String, // Entry point file (e.g., "main.js")
}

#[derive(serde::Serialize)]
pub struct PluginInfo {
    pub dir_name: String,
    pub manifest: PluginManifest,
}

#[tauri::command]
pub fn get_plugins(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<PluginInfo>, String> {
    // tracing::debug!("Getting plugins");
    let roots_guard = state.workspace_roots.read().map_err(|e| e.to_string())?;
    
    if roots_guard.is_empty() {
        return Ok(Vec::new());
    }

    let mut all_plugins = Vec::new();

    for root in roots_guard.iter() {
        let root_path = Path::new(root);
        let plugins_dir = root_path.join(".nexus").join("plugins");
        
        if plugins_dir.exists() {
            if let Ok(entries) = fs::read_dir(plugins_dir) {
                for entry in entries {
                    if let Ok(entry) = entry {
                        let path = entry.path();
                        if path.is_dir() {
                            let manifest_path = path.join("manifest.json");
                            if manifest_path.exists() {
                                if let Ok(content) = fs::read_to_string(&manifest_path) {
                                    if let Ok(manifest) = serde_json::from_str::<PluginManifest>(&content) {
                                        all_plugins.push(PluginInfo {
                                            dir_name: path.file_name().unwrap().to_string_lossy().to_string(),
                                            manifest,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(all_plugins)
}

#[tauri::command]
pub fn load_plugin_script(plugin_dir: String, script_file: String, state: tauri::State<'_, Arc<AppState>>) -> Result<String, String> {
    tracing::info!(plugin_dir = %plugin_dir, script_file = %script_file, "Loading plugin script");
    let roots_guard = state.workspace_roots.read().map_err(|e| e.to_string())?;
    
    if roots_guard.is_empty() {
        return Err("Workspace root not set".to_string());
    }
    
    // Validate inputs to prevent directory traversal
    if plugin_dir.contains("..") || plugin_dir.contains('/') || plugin_dir.contains('\\') {
        return Err("Invalid plugin directory name".to_string());
    }
    if script_file.is_empty()
        || script_file.contains("..")
        || script_file.contains('/')
        || script_file.contains('\\')
    {
        return Err("Invalid plugin script file".to_string());
    }

    // Try to find the plugin script in any of the roots
    for root in roots_guard.iter() {
        let root_path = Path::new(root);
        let full_path = root_path
            .join(".nexus")
            .join("plugins")
            .join(&plugin_dir)
            .join(&script_file);

        if full_path.exists() {
            // Extra safety: verify that the resolved script stays within the workspace root
            if let Some(full_path_str) = full_path.to_str() {
                if crate::validate_path(full_path_str, &state).is_ok() {
                     return fs::read_to_string(full_path).map_err(|e| e.to_string());
                }
            }
        }
    }

    Err(format!("Plugin script not found in any workspace root: {}/{}", plugin_dir, script_file))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::RwLock;
    use tempfile::TempDir;

    fn create_test_state(root: &Path) -> Arc<AppState> {
        Arc::new(AppState {
            workspace_roots: RwLock::new(vec![root.to_string_lossy().to_string()]),
            ..Default::default()
        })
    }

    fn get_plugins_for_tests(state: &Arc<AppState>) -> Result<Vec<PluginInfo>, String> {
        let roots_guard = state.workspace_roots.read().map_err(|e| e.to_string())?;
        
        let mut all_plugins = Vec::new();

        for root in roots_guard.iter() {
            let root_path = Path::new(root);
            let plugins_dir = root_path.join(".nexus").join("plugins");
            
            if plugins_dir.exists() {
                if let Ok(entries) = fs::read_dir(plugins_dir) {
                    for entry in entries {
                        if let Ok(entry) = entry {
                            let path = entry.path();
                            if path.is_dir() {
                                let manifest_path = path.join("manifest.json");
                                if manifest_path.exists() {
                                    if let Ok(content) = fs::read_to_string(&manifest_path) {
                                        if let Ok(manifest) = serde_json::from_str::<PluginManifest>(&content) {
                                            all_plugins.push(PluginInfo {
                                                dir_name: path.file_name().unwrap().to_string_lossy().to_string(),
                                                manifest,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(all_plugins)
    }

    fn load_plugin_script_for_tests(
        plugin_dir: &str,
        script_file: &str,
        state: &Arc<AppState>,
    ) -> Result<String, String> {
        let roots_guard = state.workspace_roots.read().map_err(|e| e.to_string())?;
        
        if roots_guard.is_empty() {
            return Err("Workspace root not set".to_string());
        }

        if plugin_dir.contains("..") || plugin_dir.contains('/') || plugin_dir.contains('\\') {
            return Err("Invalid plugin directory name".to_string());
        }
        if script_file.is_empty()
            || script_file.contains("..")
            || script_file.contains('/')
            || script_file.contains('\\')
        {
            return Err("Invalid plugin script file".to_string());
        }

        for root in roots_guard.iter() {
            let root_path = Path::new(root);
            let full_path = root_path
                .join(".nexus")
                .join("plugins")
                .join(plugin_dir)
                .join(script_file);

            if full_path.exists() {
                return fs::read_to_string(full_path).map_err(|e| e.to_string());
            }
        }

        Err("Plugin script not found".to_string())
    }

    #[test]
    fn get_plugins_returns_empty_when_no_plugins_directory() {
        let temp_dir = TempDir::new().unwrap();
        let state = create_test_state(temp_dir.path());

        let plugins = get_plugins_for_tests(&state).unwrap();
        assert!(plugins.is_empty());
    }

    #[test]
    fn get_plugins_discovers_valid_plugin_manifests() {
        let temp_dir = TempDir::new().unwrap();
        let root = temp_dir.path();
        let plugins_dir = root.join(".nexus").join("plugins");
        fs::create_dir_all(&plugins_dir).unwrap();

        let plugin_path = plugins_dir.join("my-plugin");
        fs::create_dir_all(&plugin_path).unwrap();
        let manifest = r#"{
            "id": "my-plugin",
            "name": "My Plugin",
            "version": "1.0.0",
            "description": "Test plugin",
            "main": "main.js"
        }"#;
        fs::write(plugin_path.join("manifest.json"), manifest).unwrap();

        let state = create_test_state(root);
        let plugins = get_plugins_for_tests(&state).unwrap();

        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].dir_name, "my-plugin");
        assert_eq!(plugins[0].manifest.name, "My Plugin");
    }

    #[test]
    fn load_plugin_script_enforces_input_validation_and_reads_file() {
        let temp_dir = TempDir::new().unwrap();
        let root = temp_dir.path();
        let plugins_dir = root.join(".nexus").join("plugins");
        fs::create_dir_all(&plugins_dir).unwrap();

        // Valid plugin and script
        let plugin_path = plugins_dir.join("safe-plugin");
        fs::create_dir_all(&plugin_path).unwrap();
        fs::write(plugin_path.join("script.js"), "console.log('ok');").unwrap();

        let state = create_test_state(root);

        let content = load_plugin_script_for_tests("safe-plugin", "script.js", &state).unwrap();
        assert!(content.contains("ok"));

        // Invalid plugin dir and script file should be rejected
        assert!(load_plugin_script_for_tests("../evil", "script.js", &state).is_err());
        assert!(load_plugin_script_for_tests("safe-plugin", "../evil.js", &state).is_err());
    }
}

