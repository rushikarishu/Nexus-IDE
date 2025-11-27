use std::path::{Path, PathBuf};
use std::fs;

/// Validates that a path is within the workspace root and contains no path traversal attempts.
///
/// # Security
/// This function MUST remain in sync with any path validation logic in src-tauri.
/// Any changes here should trigger a review of all callers.
///
/// # Arguments
/// * `workspace_root` - The absolute path to the workspace root
/// * `path` - The path to validate (relative or absolute)
///
/// # Returns
/// * `Ok(PathBuf)` - The validated path
/// * `Err(String)` - Description of the validation failure
///
/// # Examples
/// ```
/// let validated = validate_path("/workspace", "/workspace/file.txt")?;
/// ```
pub fn validate_path(workspace_root: &str, path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    
    // Check for path traversal components (..)
    for component in p.components() {
        if let std::path::Component::ParentDir = component {
            return Err("Path traversal detected (..)".to_string());
        }
    }

    // Try to canonicalize the workspace root
    let root_path = Path::new(workspace_root);
    let root_abs = fs::canonicalize(root_path)
        .unwrap_or_else(|_| root_path.to_path_buf());

    // For the target path:
    // - If it exists, canonicalize it (resolve symlinks)
    // - If it doesn't exist (e.g., new file), construct the expected absolute path
    let target_abs = if p.is_absolute() {
        // Absolute path: try to canonicalize, fallback to as-is
        fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf())
    } else {
        // Relative path: join with root and try to canonicalize
        let joined = root_abs.join(p);
        fs::canonicalize(&joined).unwrap_or(joined)
    };

    // Ensure the target is within the workspace root
    if !target_abs.starts_with(&root_abs) {
        return Err(format!(
            "Access denied: Path '{}' is outside workspace root '{}'",
            target_abs.display(),
            root_abs.display()
        ));
    }

    Ok(target_abs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_validate_path_rejects_traversal() {
        let root = env::current_dir().unwrap().to_string_lossy().to_string();
        let result = validate_path(&root, "../etc/passwd");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("traversal"));
    }

    #[test]
    fn test_validate_path_accepts_child() {
        let root = env::current_dir().unwrap().to_string_lossy().to_string();
        let result = validate_path(&root, "test.txt");
        assert!(result.is_ok());
    }
}
