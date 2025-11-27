use nexus_ide_lib::{
    create_file_impl, save_file_impl, 
    git::{git_add_impl, git_commit_impl, git_status_impl, git_log_impl},
    AppState
};
use std::sync::Arc;
use tempfile::TempDir;
use std::fs;

#[test]
fn test_e2e_workflow() {
    // Initialize tracing for logs
    let _ = tracing_subscriber::fmt()
        .with_test_writer() // Write to test output
        .with_max_level(tracing::Level::INFO)
        .try_init();

    // 1. Setup
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let path = temp_dir.path().to_str().unwrap().to_string();
    let app_state = Arc::new(AppState::new());
    
    // Set workspace root
    {
        let mut roots = app_state.workspace_roots.write().unwrap();
        roots.push(path.clone());
    }

    // 2. Initialize Git
    // We need to call git init manually or via command if available. 
    // Checking git.rs, there might not be a git_init exposed to frontend, 
    // but we can use std::process::Command for setup if needed, 
    // OR if git_init is in the lib, use it.
    // Assuming git_init exists or we simulate it.
    // If git_init is not in lib, we'll use Command.
    let _ = std::process::Command::new("git")
        .arg("init")
        .current_dir(&path)
        .output()
        .expect("Failed to init git");

    // Configure git user for commit to work
    let _ = std::process::Command::new("git")
        .args(&["config", "user.email", "test@example.com"])
        .current_dir(&path)
        .output();
    let _ = std::process::Command::new("git")
        .args(&["config", "user.name", "Test User"])
        .current_dir(&path)
        .output();

    // 3. Create File
    let file_path = temp_dir.path().join("main.rs");
    let file_path_str = file_path.to_str().unwrap().to_string();
    
    create_file_impl(&file_path_str, &app_state).expect("Failed to create file");
    assert!(file_path.exists());

    // 4. Write Content
    let content = "fn main() { println!(\"Hello World\"); }";
    save_file_impl(&file_path_str, content, &app_state).expect("Failed to save file");
    
    let saved_content = fs::read_to_string(&file_path).expect("Failed to read file");
    assert_eq!(saved_content, content);

    // 5. Git Status (Check Untracked/Modified)
    let status = git_status_impl(&path, &app_state).expect("Failed to get git status");
    // Should be untracked or added depending on how git_status works.
    // Usually "main.rs" should be in files.
    assert!(status.files.iter().any(|f| f.path == "main.rs"));

    // 6. Git Add
    git_add_impl(&path, "main.rs", &app_state).expect("Failed to git add");

    // 7. Git Commit
    git_commit_impl(&path, "Initial commit", &app_state).expect("Failed to git commit");

    // 8. Verify Log
    let logs = git_log_impl(&path, Some(10), None, &app_state).expect("Failed to get git log");
    assert!(!logs.is_empty());
    assert_eq!(logs[0].message, "Initial commit");

    // 9. Verify via File System (Real check)
    // We already checked fs::read_to_string above.
}
