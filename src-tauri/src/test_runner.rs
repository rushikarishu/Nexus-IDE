use std::path::Path;
use std::sync::Arc;
use ide_core::AppState;
use tauri::State;
use glob::glob;

#[derive(Debug, serde::Serialize, Clone)]
pub struct TestFile {
    pub path: String,
    pub name: String,
    pub suite: String, // "frontend" or "backend" (or "rust", "js")
}

#[tauri::command]
pub fn discover_tests(state: State<'_, Arc<AppState>>) -> Result<Vec<TestFile>, String> {
    tracing::info!("Discovering tests");
    let roots_guard = state.workspace_roots.read().map_err(|e| e.to_string())?;
    
    if roots_guard.is_empty() {
        return Ok(Vec::new());
    }

    let mut tests = Vec::new();
    
    let patterns = vec![
        "src/**/*.test.tsx",
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/**/*.spec.tsx",
    ];

    for root in roots_guard.iter() {
        let root_path = Path::new(root);
        
        for pattern in &patterns {
            let full_pattern = root_path.join(pattern);
            let pattern_str = full_pattern.to_str().ok_or("Invalid path pattern")?;
            
            if let Ok(paths) = glob(pattern_str) {
                for entry in paths {
                    if let Ok(path) = entry {
                        if let Ok(relative) = path.strip_prefix(root) {
                            tests.push(TestFile {
                                path: relative.to_string_lossy().to_string(),
                                name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                                suite: "frontend".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    // Rust tests? 
    // Scanning for #[test] is hard without parsing. 
    // We can just list .rs files that likely contain tests or just list all .rs files?
    // For now, let's stick to frontend tests as requested in the prompt "scanning src/**.test.tsx on the frontend".
    // The prompt says "optionally .rs tests by module name". Let's skip .rs for now to keep it lightweight.

    Ok(tests)
}
