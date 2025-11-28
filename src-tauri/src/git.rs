use std::process::Command;
use std::sync::Arc;
use ide_core::AppState;
use crate::validate_path;
use regex::Regex;
use crate::constants::git::*;

#[derive(serde::Serialize, Debug)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String, // "M", "A", "D", "??", etc.
    pub staged: bool,
}

#[derive(serde::Serialize, Debug)]
pub struct GitStatus {
    pub branch: String,
    pub files: Vec<GitFileStatus>,
}

/// Validates a git branch name against security constraints
fn validate_branch_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Branch name cannot be empty".to_string());
    }
    
    if name.len() > MAX_BRANCH_NAME_LEN {
        return Err(format!(
            "Branch name too long: {} characters (max {})",
            name.len(),
            MAX_BRANCH_NAME_LEN
        ));
    }
    
    let pattern = Regex::new(crate::constants::patterns::BRANCH_NAME_PATTERN).map_err(|e| e.to_string())?;
    if !pattern.is_match(name) {
        return Err(format!(
            "Invalid branch name '{}': only alphanumeric characters, slashes, dashes, underscores, and dots are allowed",
            name
        ));
    }
    
    if name.starts_with('-') {
        return Err("Branch name cannot start with dash (prevents argument injection)".to_string());
    }
    
    Ok(())
}

/// Sanitizes a commit message
fn sanitize_commit_message(message: &str) -> Result<String, String> {
    if message.is_empty() {
        return Err("Commit message cannot be empty".to_string());
    }
    
    if message.len() > MAX_COMMIT_MESSAGE_LEN {
        return Err(format!(
            "Commit message too long: {} characters (max {})",
            message.len(),
            MAX_COMMIT_MESSAGE_LEN
        ));
    }
    
    for forbidden in crate::constants::patterns::COMMIT_MESSAGE_FORBIDDEN_CHARS {
        if message.contains(*forbidden) {
            return Err(format!(
                "Commit message contains forbidden character '{}' (potential command injection)",
                forbidden
            ));
        }
    }
    
    Ok(message.to_string())
}

/// Validates a file path for git operations
fn validate_git_path(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("File path cannot be empty".to_string());
    }
    
    if path.len() > MAX_FILE_PATH_LEN {
        return Err(format!(
            "File path too long: {} characters (max {})",
            path.len(),
            MAX_FILE_PATH_LEN
        ));
    }
    
    if path.contains('\0') {
        return Err("File path contains null byte".to_string());
    }
    
    Ok(())
}

fn run_git(args: &[&str], cwd: &std::path::Path) -> Result<String, String> {
    tracing::info!(args = ?args, cwd = ?cwd, "Running git command");
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn git_status_impl(path: &str, state: &Arc<AppState>) -> Result<GitStatus, String> {
    let root = validate_path(path, state)?;
    
    // Get branch
    let branch = run_git(&["rev-parse", "--abbrev-ref", "HEAD"], &root)
        .unwrap_or_else(|_| "HEAD".to_string());

    // Get status
    // --porcelain gives us easy to parse output
    // XY PATH
    // X = staged, Y = unstaged
    let status_output = run_git(&["status", "--porcelain"], &root)?;
    
    let mut files = Vec::new();
    
    for line in status_output.lines() {
        if line.len() < 4 { continue; }
        let x = line.chars().nth(0).unwrap_or(' ');
        let y = line.chars().nth(1).unwrap_or(' ');
        let file_path = line[3..].to_string();

        // Handle untracked files explicitly
        if x == '?' && y == '?' {
             files.push(GitFileStatus {
                path: file_path,
                status: "??".to_string(),
                staged: false,
            });
            continue;
        }
        
        // If X is not ' ' or '?', it's staged
        if x != ' ' {
            files.push(GitFileStatus {
                path: file_path.clone(),
                status: x.to_string(),
                staged: true,
            });
        }
        
        // If Y is not ' ', it's unstaged (modified/deleted)
        if y != ' ' {
             files.push(GitFileStatus {
                path: file_path,
                status: y.to_string(),
                staged: false,
            });
        }
    }

    Ok(GitStatus {
        branch,
        files,
    })
}

#[tauri::command]
pub fn git_status(path: &str, state: tauri::State<'_, Arc<AppState>>) -> Result<GitStatus, String> {
    git_status_impl(path, &state)
}

pub fn git_add_impl(path: &str, file: &str, state: &Arc<AppState>) -> Result<(), String> {
    let root = validate_path(path, state)?;
    run_git(&["add", file], &root).map(|_| ())
}

#[tauri::command]
pub fn git_add(path: &str, file: &str, state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    git_add_impl(path, file, &state)
}

pub fn git_reset_impl(path: &str, file: &str, state: &Arc<AppState>) -> Result<(), String> {
    let root = validate_path(path, state)?;
    run_git(&["reset", "HEAD", file], &root).map(|_| ())
}

#[tauri::command]
pub fn git_reset(path: &str, file: &str, state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    git_reset_impl(path, file, &state)
}

pub fn git_commit_impl(path: &str, message: &str, state: &Arc<AppState>) -> Result<(), String> {
    let root = validate_path(path, state)?;
    run_git(&["commit", "-m", message], &root).map(|_| ())
}

#[tauri::command]
pub fn git_commit(path: &str, message: &str, state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    git_commit_impl(path, message, &state)
}

#[tauri::command]
pub fn git_diff(path: &str, file: &str, staged: bool, state: tauri::State<'_, Arc<AppState>>) -> Result<String, String> {
    let root = validate_path(path, &state)?;
    let mut args = vec!["diff"];
    if staged {
        args.push("--staged");
    }
    args.push(file);
    run_git(&args, &root)
}

#[derive(serde::Serialize, Debug)]
pub struct GitBranch {
    pub name: String,
    pub active: bool,
}

pub fn git_get_branches_impl(path: &str, state: &Arc<AppState>) -> Result<Vec<GitBranch>, String> {
    let root = validate_path(path, state)?;
    let output = run_git(&["branch", "--list"], &root)?;
    
    let mut branches = Vec::new();
    for line in output.lines() {
        let active = line.starts_with('*');
        let name = line.trim_start_matches('*').trim().to_string();
        branches.push(GitBranch { name, active });
    }
    Ok(branches)
}

#[tauri::command]
pub fn git_get_branches(path: &str, state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<GitBranch>, String> {
    git_get_branches_impl(path, &state)
}

pub fn git_checkout_branch_impl(path: &str, branch_name: &str, state: &Arc<AppState>) -> Result<(), String> {
    let root = validate_path(path, state)?;
    run_git(&["checkout", branch_name], &root).map(|_| ())
}

#[tauri::command]
pub fn git_checkout_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    tracing::info!(repo_path = %repo_path, branch = %branch_name, "Checking out branch");
    
    // Validate branch name before using it
    validate_branch_name(&branch_name)?;
    
    let path = std::path::Path::new(&repo_path);
    run_git(&["checkout", &branch_name], path)?;
    Ok(())
}

pub fn git_create_branch_impl(path: &str, branch_name: &str, state: &Arc<AppState>) -> Result<(), String> {
    let root = validate_path(path, state)?;
    run_git(&["checkout", "-b", branch_name], &root).map(|_| ())
}

#[tauri::command]
pub fn git_create_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    tracing::info!(repo_path = %repo_path, branch = %branch_name, "Creating branch");
    
    // Validate branch name before using it
    validate_branch_name(&branch_name)?;
    
    let path = std::path::Path::new(&repo_path);
    run_git(&["checkout", "-b", &branch_name], path)?;
    Ok(())
}

pub fn git_delete_branch_impl(path: &str, branch_name: &str, state: &Arc<AppState>) -> Result<(), String> {
    let root = validate_path(path, state)?;
    run_git(&["branch", "-d", branch_name], &root).map(|_| ())
}

#[tauri::command]
pub fn git_delete_branch(repo_path: String, branch_name: String, force: bool) -> Result<(), String> {
    tracing::info!(repo_path = %repo_path, branch = %branch_name, force = force, "Deleting branch");
    
    // Validate branch name before using it
    validate_branch_name(&branch_name)?;
    
    let path = std::path::Path::new(&repo_path);
    let flag = if force { "-D" } else { "-d" };
    run_git(&["branch", flag, &branch_name], path)?;
    Ok(())
}

#[derive(serde::Serialize, Debug)]
pub struct GitCommit {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

pub fn git_log_impl(path: &str, limit: Option<usize>, file_path: Option<String>, state: &Arc<AppState>) -> Result<Vec<GitCommit>, String> {
    let root = validate_path(path, state)?;
    let mut args = vec!["log", "--pretty=format:%H|%an|%ad|%s", "--date=short"];
    
    let limit_str = limit.unwrap_or(50).to_string();
    args.push("-n");
    args.push(&limit_str);

    if let Some(f) = &file_path {
        args.push("--");
        args.push(f);
    }

    let output = run_git(&args, &root)?;
    let mut commits = Vec::new();
    
    for line in output.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 4 {
            commits.push(GitCommit {
                hash: parts[0].to_string(),
                author: parts[1].to_string(),
                date: parts[2].to_string(),
                message: parts[3..].join("|"),
            });
        }
    }
    Ok(commits)
}

#[tauri::command]
pub fn git_log(repo_path: String, limit: Option<usize>, file_path: Option<String>) -> Result<Vec<GitCommit>, String> {
    tracing::info!(repo_path = %repo_path, limit = ?limit, file_path = ?file_path, "Getting git log");
    if let Some(ref f) = file_path {
        validate_git_path(f)?;
    }
    let path = std::path::Path::new(&repo_path);
    let mut args = vec!["log", "--pretty=format:%H|%an|%ad|%s", "--date=short"];
    
    let limit_str = limit.unwrap_or(50).to_string();
    args.push("-n");
    args.push(&limit_str);

    if let Some(f) = &file_path {
        args.push("--");
        args.push(f);
    }

    let output = run_git(&args, path)?;
    let mut commits = Vec::new();
    
    for line in output.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 4 {
            commits.push(GitCommit {
                hash: parts[0].to_string(),
                author: parts[1].to_string(),
                date: parts[2].to_string(),
                message: parts[3..].join("|"),
            });
        }
    }
    Ok(commits)
}

#[derive(serde::Serialize, Debug)]
pub struct GitBlame {
    pub line: usize,
    pub commit_hash: String,
    pub author: String,
    pub summary: String,
}

pub fn git_blame_impl(path: &str, file_path: &str, state: &Arc<AppState>) -> Result<Vec<GitBlame>, String> {
    let root = validate_path(path, state)?;
    let output = run_git(&["blame", "--porcelain", file_path], &root)?;
    
    let mut blames = Vec::new();
    let mut current_hash = String::new();
    let mut current_author = String::new();
    let mut current_summary = String::new();
    let mut current_line_num = 0;
    
    for line in output.lines() {
        if line.starts_with('\t') {
            if current_line_num > 0 {
                blames.push(GitBlame {
                    line: current_line_num,
                    commit_hash: current_hash.clone(),
                    author: current_author.clone(),
                    summary: current_summary.clone(),
                });
            }
            continue;
        }
        
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() { continue; }
        
        if parts[0].len() == 40 {
            current_hash = parts[0].to_string();
            if parts.len() >= 3 {
                current_line_num = parts[2].parse().unwrap_or(0);
            }
        } else if line.starts_with("author ") {
            current_author = line[7..].to_string();
        } else if line.starts_with("summary ") {
            current_summary = line[8..].to_string();
        }
    }
    
    Ok(blames)
}

#[tauri::command]
pub fn git_blame(repo_path: String, file_path: String) -> Result<Vec<GitBlame>, String> {
    tracing::info!(repo_path = %repo_path, file_path = %file_path, "Getting git blame");
    validate_git_path(&file_path)?;
    let path = std::path::Path::new(&repo_path);
    let output = run_git(&["blame", "--porcelain", &file_path], path)?;
    
    let mut blames = Vec::new();
    let mut current_hash = String::new();
    let mut current_author = String::new();
    let mut current_summary = String::new();
    let mut current_line_num = 0;
    
    for line in output.lines() {
        if line.starts_with('\t') {
            if current_line_num > 0 {
                blames.push(GitBlame {
                    line: current_line_num,
                    commit_hash: current_hash.clone(),
                    author: current_author.clone(),
                    summary: current_summary.clone(),
                });
            }
            continue;
        }
        
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() { continue; }
        
        if parts[0].len() == 40 {
            current_hash = parts[0].to_string();
            if parts.len() >= 3 {
                current_line_num = parts[2].parse().unwrap_or(0);
            }
        } else if line.starts_with("author ") {
            current_author = line[7..].to_string();
        } else if line.starts_with("summary ") {
            current_summary = line[8..].to_string();
        }
    }
    
    Ok(blames)
}

#[derive(serde::Serialize, Debug)]
pub struct GitStash {
    pub index: usize,
    pub message: String,
}

pub fn git_stash_save_impl(path: &str, message: Option<String>, state: &Arc<AppState>) -> Result<(), String> {
    let root = validate_path(path, state)?;
    let mut args = vec!["stash", "push"];
    
    // Fix lifetime issue by keeping the message string alive if needed
    // But run_git takes &[&str], so we just need to make sure the reference is valid during the call.
    // The issue before was `if let Some(msg) = message { ... }`. `msg` dropped at end of block.
    // We can just construct the args vector carefully.
    
    if let Some(ref msg) = message {
        args.push("-m");
        args.push(msg);
        run_git(&args, &root).map(|_| ())
    } else {
        run_git(&args, &root).map(|_| ())
    }
}

#[tauri::command]
pub fn git_stash_save(repo_path: String, message: Option<String>) -> Result<(), String> {
    tracing::info!(repo_path = %repo_path, message = ?message, "Saving git stash");
    let path = std::path::Path::new(&repo_path);
    let mut args = vec!["stash", "push"];
    
    let sanitized_message;
    if let Some(msg) = message {
        sanitized_message = sanitize_commit_message(&msg)?;
        args.push("-m");
        args.push(&sanitized_message);
    }
    
    run_git(&args, path)?;
    Ok(())
}

pub fn git_stash_list_impl(path: &str, state: &Arc<AppState>) -> Result<Vec<GitStash>, String> {
    let root = validate_path(path, state)?;
    let output = run_git(&["stash", "list"], &root)?;
    
    let mut stashes = Vec::new();
    for line in output.lines() {
        if let Some(idx_end) = line.find('}') {
            if let Some(idx_start) = line.find('{') {
                let index_str = &line[idx_start+1..idx_end];
                if let Ok(index) = index_str.parse::<usize>() {
                     let message = line[idx_end+2..].to_string();
                     stashes.push(GitStash { index, message });
                }
            }
        }
    }
    Ok(stashes)
}

#[tauri::command]
pub fn git_stash_list(path: &str, state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<GitStash>, String> {
    git_stash_list_impl(path, &state)
}

pub fn git_stash_apply_impl(path: &str, index: usize, state: &Arc<AppState>) -> Result<(), String> {
    let root = validate_path(path, state)?;
    let stash_ref = format!("stash@{{{}}}", index);
    run_git(&["stash", "apply", &stash_ref], &root).map(|_| ())
}

#[tauri::command]
pub fn git_stash_apply(repo_path: String, index: usize) -> Result<(), String> {
    tracing::info!(repo_path = %repo_path, index = index, "Applying git stash");
    let path = std::path::Path::new(&repo_path);
    let stash_ref = format!("stash@{{{}}}", index);
    run_git(&["stash", "apply", &stash_ref], path)?;
    Ok(())
}

pub fn git_stash_drop_impl(path: &str, index: usize, state: &Arc<AppState>) -> Result<(), String> {
    let root = validate_path(path, state)?;
    let stash_ref = format!("stash@{{{}}}", index);
    run_git(&["stash", "drop", &stash_ref], &root).map(|_| ())
}

#[tauri::command]
pub fn git_stash_drop(repo_path: String, index: usize) -> Result<(), String> {
    tracing::info!(repo_path = %repo_path, index = index, "Dropping git stash");
    let path = std::path::Path::new(&repo_path);
    let stash_ref = format!("stash@{{{}}}", index);
    run_git(&["stash", "drop", &stash_ref], path)?;
    Ok(())
}



#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use std::sync::RwLock;
    use tempfile::TempDir;

    fn create_test_state(root: &Path) -> Arc<AppState> {
        Arc::new(AppState {
            workspace_roots: RwLock::new(vec![root.to_string_lossy().to_string()]),
            ..Default::default()
        })
    }

    fn run_git_raw(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(dir)
            .status()
            .expect("failed to run git command");
        assert!(status.success(), "git {:?} failed", args);
    }

    // Helper mirroring git_status for tests without tauri::State
    fn git_status_for_tests(path: &str, state: &Arc<AppState>) -> Result<GitStatus, String> {
        let root = crate::validate_path(path, state)?;

        let branch = run_git(&["rev-parse", "--abbrev-ref", "HEAD"], &root)
            .unwrap_or_else(|_| "HEAD".to_string());

        let status_output = run_git(&["status", "--porcelain"], &root)?;
        let mut files = Vec::new();

        for line in status_output.lines() {
            if line.len() < 4 {
                continue;
            }
            let x = line.chars().nth(0).unwrap_or(' ');
            let y = line.chars().nth(1).unwrap_or(' ');
            let file_path = line[3..].to_string();

            if x == '?' && y == '?' {
                files.push(GitFileStatus {
                    path: file_path,
                    status: "??".to_string(),
                    staged: false,
                });
                continue;
            }

            if x != ' ' {
                files.push(GitFileStatus {
                    path: file_path.clone(),
                    status: x.to_string(),
                    staged: true,
                });
            }

            if y != ' ' {
                files.push(GitFileStatus {
                    path: file_path,
                    status: y.to_string(),
                    staged: false,
                });
            }
        }

        Ok(GitStatus { branch, files })
    }

    #[test]
    fn git_status_reports_untracked_file() {
        let temp_dir = TempDir::new().unwrap();
        let root = temp_dir.path();

        run_git_raw(root, &["init"]);
        run_git_raw(root, &["config", "user.email", "test@example.com"]);
        run_git_raw(root, &["config", "user.name", "Test User"]);

        fs::write(root.join("file1.txt"), "content").unwrap();

        let state = create_test_state(root);
        let status = git_status_for_tests(root.to_string_lossy().as_ref(), &state).unwrap();

        assert_eq!(status.files.len(), 1);
        assert_eq!(status.files[0].path, "file1.txt");
        assert_eq!(status.files[0].status, "??");
        assert!(!status.files[0].staged);
    }

    #[test]
    fn git_status_marks_staged_files() {
        let temp_dir = TempDir::new().unwrap();
        let root = temp_dir.path();

        run_git_raw(root, &["init"]);
        run_git_raw(root, &["config", "user.email", "test@example.com"]);
        run_git_raw(root, &["config", "user.name", "Test User"]);

        // Create and stage a file
        fs::write(root.join("file.txt"), "content").unwrap();
        run_git_raw(root, &["add", "file.txt"]);

        let state = create_test_state(root);
        let status = git_status_for_tests(root.to_string_lossy().as_ref(), &state).unwrap();

        assert_eq!(status.files.len(), 1);
        assert_eq!(status.files[0].status, "A");
        assert!(status.files[0].staged);
    }

    #[test]
    fn test_git_branches() {
        let temp_dir = TempDir::new().unwrap();
        let root = temp_dir.path();
        run_git_raw(root, &["init"]);
        run_git_raw(root, &["config", "user.email", "test@example.com"]);
        run_git_raw(root, &["config", "user.name", "Test User"]);
        
        // Need a commit to have a branch
        fs::write(root.join("file.txt"), "content").unwrap();
        run_git_raw(root, &["add", "file.txt"]);
        run_git_raw(root, &["commit", "-m", "Initial"]);

        let state = create_test_state(root);
        let path_str = root.to_string_lossy().to_string();

        // Create branch
        git_create_branch_impl(&path_str, "feature", &state).unwrap();

        // List branches
        let branches = git_get_branches_impl(&path_str, &state).unwrap();
        assert!(branches.iter().any(|b| b.name == "feature"));
        assert!(branches.iter().any(|b| b.name == "master" || b.name == "main"));

        // Checkout
        git_checkout_branch_impl(&path_str, "feature", &state).unwrap();
        let branches = git_get_branches_impl(&path_str, &state).unwrap();
        assert!(branches.iter().find(|b| b.name == "feature").unwrap().active);

        // Delete (switch back first)
        git_checkout_branch_impl(&path_str, "master", &state).unwrap_or_else(|_| {
             let _ = git_checkout_branch_impl(&path_str, "main", &state);
        });
        git_delete_branch_impl(&path_str, "feature", &state).unwrap();
        
        let branches = git_get_branches_impl(&path_str, &state).unwrap();
        assert!(!branches.iter().any(|b| b.name == "feature"));
    }

    #[test]
    fn test_git_log() {
        let temp_dir = TempDir::new().unwrap();
        let root = temp_dir.path();
        run_git_raw(root, &["init"]);
        run_git_raw(root, &["config", "user.email", "test@example.com"]);
        run_git_raw(root, &["config", "user.name", "Test User"]);
        
        fs::write(root.join("file.txt"), "content").unwrap();
        run_git_raw(root, &["add", "file.txt"]);
        run_git_raw(root, &["commit", "-m", "Commit 1"]);
        
        fs::write(root.join("file.txt"), "content2").unwrap();
        run_git_raw(root, &["add", "file.txt"]);
        run_git_raw(root, &["commit", "-m", "Commit 2"]);

        let state = create_test_state(root);
        let path_str = root.to_string_lossy().to_string();

        let logs = git_log_impl(&path_str, None, None, &state).unwrap();
        assert_eq!(logs.len(), 2);
        assert_eq!(logs[0].message, "Commit 2");
        assert_eq!(logs[1].message, "Commit 1");
    }

    #[test]
    fn test_git_stash() {
        let temp_dir = TempDir::new().unwrap();
        let root = temp_dir.path();
        run_git_raw(root, &["init"]);
        run_git_raw(root, &["config", "user.email", "test@example.com"]);
        run_git_raw(root, &["config", "user.name", "Test User"]);
        
        fs::write(root.join("file.txt"), "content").unwrap();
        run_git_raw(root, &["add", "file.txt"]);
        run_git_raw(root, &["commit", "-m", "Initial"]);
        
        // Modify file
        fs::write(root.join("file.txt"), "modified").unwrap();
        
        let state = create_test_state(root);
        let path_str = root.to_string_lossy().to_string();

        // Save stash
        git_stash_save_impl(&path_str, Some("WIP".to_string()), &state).unwrap();
        
        // List stash
        let stashes = git_stash_list_impl(&path_str, &state).unwrap();
        assert_eq!(stashes.len(), 1);
        assert!(stashes[0].message.contains("WIP"));
        
        // Apply stash
        git_stash_apply_impl(&path_str, 0, &state).unwrap();
        let content = fs::read_to_string(root.join("file.txt")).unwrap();
        assert_eq!(content, "modified");
    }

    #[test]
    fn test_git_validation() {
        // Test validation functions directly
        
        // Invalid branch name
        let err = validate_branch_name("invalid;command").unwrap_err();
        assert!(err.contains("Invalid branch name"));
        
        let err = validate_branch_name("-dash").unwrap_err();
        assert!(err.contains("cannot start with dash"));
        
        // Valid branch name
        assert!(validate_branch_name("feature/new-thing").is_ok());
        
        // Invalid commit message
        let err = sanitize_commit_message("msg; rm -rf /").unwrap_err();
        assert!(err.contains("forbidden character"));
        
        // Valid commit message
        assert!(sanitize_commit_message("Initial commit").is_ok());
    }
}

