use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use ide_core::AppState;
use tauri::{State, Window, Emitter};
use crate::validate_path;

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct TaskDefinition {
    pub label: String,
    pub command: String,
    pub args: Option<Vec<String>>,
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct TasksConfig {
    pub tasks: Vec<TaskDefinition>,
}

#[tauri::command]
pub fn get_tasks(state: State<'_, Arc<AppState>>) -> Result<Vec<TaskDefinition>, String> {
    // tracing::debug!("Getting tasks");
    let roots_guard = state.workspace_roots.read().map_err(|e| e.to_string())?;
    
    if roots_guard.is_empty() {
        return Ok(Vec::new());
    }

    let mut all_tasks = Vec::new();

    for root in roots_guard.iter() {
        let tasks_path = Path::new(root).join(".nexus").join("tasks.json");
        
        if tasks_path.exists() {
            // Validate path just in case
            if validate_path(tasks_path.to_str().unwrap(), &state).is_ok() {
                if let Ok(content) = fs::read_to_string(tasks_path) {
                    if let Ok(config) = serde_json::from_str::<TasksConfig>(&content) {
                        all_tasks.extend(config.tasks);
                    }
                }
            }
        }
    }
    
    Ok(all_tasks)
}

#[tauri::command]
pub fn run_task(task: TaskDefinition, terminal_id: String, state: State<'_, Arc<AppState>>, window: Window) -> Result<(), String> {
    tracing::info!(task_label = %task.label, terminal_id = %terminal_id, "Running task");
    let roots_guard = state.workspace_roots.read().map_err(|e| e.to_string())?;
    // For now, use the first root as the default CWD base if not specified
    // In a full multi-root implementation, the task should probably carry its source root
    let root = roots_guard.first().ok_or("Workspace root not set")?;

    let mut command = std::process::Command::new(&task.command);
    
    if let Some(args) = task.args {
        command.args(args);
    }

    let cwd = if let Some(custom_cwd) = task.cwd {
        // If custom cwd is provided, resolve it relative to workspace root
        let p = Path::new(root).join(custom_cwd);
        // Validate it's within workspace
        let validated = validate_path(p.to_str().unwrap_or(""), &state)?;
        validated
    } else {
        // Default to workspace root
        std::path::PathBuf::from(root)
    };

    command.current_dir(cwd);

    if let Some(env) = task.env {
        command.envs(env);
    }

    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    // Use the existing execute_command helper from terminal module?
    // Since execute_command is private in lib.rs or terminal.rs, we might need to expose it or duplicate logic.
    // For now, let's duplicate the simple streaming logic or make execute_command public.
    // Actually, execute_command is in lib.rs but not pub. I'll check lib.rs again.
    // It seems execute_command is in lib.rs but private. I should probably move it to terminal.rs and make it pub, or just copy it here for now to avoid refactoring lib.rs too much.
    // Copying is safer for now.

    let mut child = command.spawn().map_err(|e| {
        let err_msg = format!("Failed to execute task '{}': {}", task.label, e);
        let _ = window.emit(&format!("terminal-data-{}", terminal_id), format!("{}\r\n", err_msg));
        err_msg
    })?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    let window_clone = window.clone();
    let tid = terminal_id.clone();
    
    std::thread::spawn(move || {
        use std::io::BufRead;
        let reader = std::io::BufReader::new(stdout);
        for l in reader.lines().map_while(Result::ok) {
            let _ = window_clone.emit(&format!("terminal-data-{}", tid), format!("{}\r\n", l));
        }
    });

    let window_clone2 = window.clone();
    let tid2 = terminal_id.clone();
    
    std::thread::spawn(move || {
        use std::io::BufRead;
        let reader = std::io::BufReader::new(stderr);
        for l in reader.lines().map_while(Result::ok) {
            let _ = window_clone2.emit(&format!("terminal-data-{}", tid2), format!("{}\r\n", l));
        }
    });

    Ok(())
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

    // Helper that mirrors get_tasks for unit tests without tauri::State
    fn get_tasks_for_tests(state: &Arc<AppState>) -> Result<Vec<TaskDefinition>, String> {
        let roots_guard = state.workspace_roots.read().map_err(|e| e.to_string())?;
        
        let mut all_tasks = Vec::new();

        for root in roots_guard.iter() {
            let tasks_path = Path::new(root).join(".nexus").join("tasks.json");
            if tasks_path.exists() {
                let content = fs::read_to_string(&tasks_path).map_err(|e| e.to_string())?;
                let config: TasksConfig = serde_json::from_str(&content)
                    .map_err(|e| format!("Failed to parse tasks.json: {}", e))?;
                all_tasks.extend(config.tasks);
            }
        }
        Ok(all_tasks)
    }

    #[test]
    fn get_tasks_returns_empty_when_file_missing() {
        let temp_dir = TempDir::new().unwrap();
        let state = create_test_state(temp_dir.path());

        let tasks = get_tasks_for_tests(&state).unwrap();
        assert!(tasks.is_empty());
    }

    #[test]
    fn get_tasks_parses_valid_tasks_config() {
        let temp_dir = TempDir::new().unwrap();
        let root = temp_dir.path();
        let nexus_dir = root.join(".nexus");
        fs::create_dir_all(&nexus_dir).unwrap();

        let tasks_json = r#"{
            "tasks": [
                { "label": "Build", "command": "npm", "args": ["run", "build"], "cwd": null, "env": null },
                { "label": "Test", "command": "npm", "args": ["test"], "cwd": "subdir", "env": { "CI": "1" } }
            ]
        }"#;

        fs::write(nexus_dir.join("tasks.json"), tasks_json).unwrap();

        let state = create_test_state(root);
        let tasks = get_tasks_for_tests(&state).unwrap();

        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].label, "Build");
        assert_eq!(tasks[0].command, "npm");
        assert_eq!(tasks[0].args.as_ref().unwrap(), &vec!["run".to_string(), "build".to_string()]);

        assert_eq!(tasks[1].label, "Test");
        assert_eq!(tasks[1].cwd.as_deref(), Some("subdir"));
        assert_eq!(tasks[1].env.as_ref().unwrap().get("CI").map(String::as_str), Some("1"));
    }
}

