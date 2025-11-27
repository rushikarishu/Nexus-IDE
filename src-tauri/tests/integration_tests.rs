// use tauri::test::{mock_builder, mock_context, noop_assets};
use nexus_ide_lib::{read_dir_impl, read_file_impl, save_file_impl, create_file_impl, delete_file_impl};
use ide_core::AppState;
use std::sync::Arc;
use tempfile::tempdir;

#[test]
fn test_file_operations_integration() {
    // Create a temp directory for safe testing
    let dir = tempdir().expect("failed to create temp dir");
    let dir_path = dir.path().to_str().unwrap().to_string();
    
    let state = Arc::new(AppState::new());

    // Set workspace root to the temp directory for these operations
    {
        let mut roots = state.workspace_roots.write().unwrap();
        roots.push(dir_path.clone());
    }

    // 1. Create File
    let file_path = dir.path().join("test.txt");
    let file_path_str = file_path.to_str().unwrap().to_string();
    
    assert!(create_file_impl(&file_path_str, &state).is_ok());
    assert!(file_path.exists());

    // 2. Save File
    let content = "Hello Integration Test";
    assert!(save_file_impl(&file_path_str, content, &state).is_ok());
    
    // 3. Read File
    let read_content = read_file_impl(&file_path_str, &state).expect("failed to read file");
    assert_eq!(read_content, content);

    // 4. Read Dir
    let entries = read_dir_impl(&dir_path, &state).expect("failed to read dir");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "test.txt");
    assert!(!entries[0].is_dir);

    // 5. Delete File
    assert!(delete_file_impl(&file_path_str, &state).is_ok());
    assert!(!file_path.exists());
}

#[test]
fn test_security_integration() {
    let dir = tempdir().expect("failed to create temp dir");
    let dir_path = dir.path().to_str().unwrap();
    let state = Arc::new(AppState::new());
    {
        let mut roots = state.workspace_roots.write().unwrap();
        roots.push(dir_path.to_string());
    }
    
    // Attempt path traversal
    let traversal_path = format!("{}/../secret.txt", dir_path);
    assert!(read_file_impl(&traversal_path, &state).is_err());
}
