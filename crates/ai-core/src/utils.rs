use std::path::{Path, PathBuf};
use std::fs;
use serde::{Serialize, Deserialize};

/// Validates that a path is within the workspace root and contains no path traversal attempts.
///
/// # Security
/// This function MUST remain in sync with any path validation logic in src-tauri.
/// Any changes here should trigger a review of all callers.
///
/// # Security Model
/// 1. ONLY accepts absolute paths (no relative paths allowed)
/// 2. Canonicalizes workspace root (MUST exist)
/// 3. Rejects any path with ".." components before canonicalization
/// 4. Canonicalizes target path or its existing parent
/// 5. Verifies final path is within workspace root
///
/// # Arguments
/// * `workspace_root` - The absolute path to the workspace root (must exist)
/// * `path` - The path to validate (must be absolute)
///
/// # Returns
/// * `Ok(PathBuf)` - The validated, canonicalized path
/// * `Err(String)` - Description of the validation failure
///
/// # Examples
/// ```
/// // Valid: absolute path within workspace
/// let validated = validate_path("/workspace", "/workspace/file.txt")?;
/// 
/// // Invalid: relative path
/// validate_path("/workspace", "file.txt").is_err(); // true
/// 
/// // Invalid: path traversal
/// validate_path("/workspace", "/workspace/../etc/passwd").is_err(); // true
/// ```
pub fn validate_path(workspace_root: &str, path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    
    // SECURITY: Reject relative paths immediately
    if !p.is_absolute() {
        return Err(format!(
            "Security violation: Only absolute paths are allowed. Got relative path: '{}'",
            path
        ));
    }
    
    // SECURITY: Check for path traversal components (..) before any other processing
    for component in p.components() {
        if let std::path::Component::ParentDir = component {
            return Err(format!(
                "Security violation: Path traversal detected (..) in path: '{}'",
                path
            ));
        }
    }

    // Canonicalize workspace root - this MUST succeed
    let root_path = Path::new(workspace_root);
    let root_abs = fs::canonicalize(root_path).map_err(|e| {
        format!(
            "Workspace root does not exist or is not accessible: '{}' (error: {})",
            workspace_root, e
        )
    })?;

    // For the target path:
    // - If it exists, canonicalize it fully (resolves symlinks)
    // - If it doesn't exist, canonicalize its existing parent and append the filename
    let target_abs = if p.exists() {
        // Path exists - canonicalize it fully to resolve any symlinks
        fs::canonicalize(p).map_err(|e| {
            format!(
                "Failed to canonicalize existing path '{}': {}",
                path, e
            )
        })?
    } else {
        // Path doesn't exist (e.g., new file being created)
        // Canonicalize the parent directory and append the filename
        if let Some(parent) = p.parent() {
            if parent.as_os_str().is_empty() || parent == Path::new("/") {
                // Root directory or empty parent - just use the path as-is
                p.to_path_buf()
            } else if parent.exists() {
                let canonical_parent = fs::canonicalize(parent).map_err(|e| {
                    format!(
                        "Failed to canonicalize parent directory '{}': {}",
                        parent.display(), e
                    )
                })?;
                if let Some(filename) = p.file_name() {
                    canonical_parent.join(filename)
                } else {
                    canonical_parent
                }
            } else {
                // Parent doesn't exist - this is likely an error
                return Err(format!(
                    "Parent directory does not exist: '{}' (for path '{}')",
                    parent.display(),
                    path
                ));
            }
        } else {
            // No parent (shouldn't happen for absolute paths, but handle it)
            p.to_path_buf()
        }
    };

    // SECURITY: Final check - ensure the target is within the workspace root
    if !target_abs.starts_with(&root_abs) {
        return Err(format!(
            "Security violation: Path '{}' is outside workspace root '{}'. Canonical paths: target='{}', root='{}'",
            path,
            workspace_root,
            target_abs.display(),
            root_abs.display()
        ));
    }

    Ok(target_abs)
}

/// A wrapper for strings that should be redacted in debug output
#[derive(Clone, Serialize, Deserialize)]
pub struct SecretString(String);

impl SecretString {
    pub fn new(s: impl Into<String>) -> Self {
        Self(s.into())
    }

    pub fn expose_secret(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for SecretString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[REDACTED]")
    }
}

impl From<String> for SecretString {
    fn from(s: String) -> Self {
        Self(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;

    #[test]
    fn test_secret_string_redaction() {
        let secret = SecretString::new("my_secret_token");
        assert_eq!(format!("{:?}", secret), "[REDACTED]");
        assert_eq!(secret.expose_secret(), "my_secret_token");
    }

    #[test]
    fn test_validate_path_rejects_traversal() {
        let root = env::current_dir().unwrap().to_string_lossy().to_string();
        let result = validate_path(&root, "../etc/passwd");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("absolute") || err.contains("relative"));
    }
    
    #[test]
    fn test_validate_path_rejects_traversal_absolute() {
        let root = env::current_dir().unwrap().to_string_lossy().to_string();
        let malicious_path = format!("{}/../etc/passwd", root);
        let result = validate_path(&root, &malicious_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("traversal"));
    }

    #[test]
    fn test_validate_path_accepts_child() {
        let root = env::current_dir().unwrap();
        let test_file = root.join("test_temp_file.txt");
        
        // Create parent if doesn't exist
        if !root.exists() {
            fs::create_dir_all(&root).ok();
        }
        
        let result = validate_path(
            &root.to_string_lossy().to_string(),
            &test_file.to_string_lossy().to_string()
        );
        assert!(result.is_ok(), "Expected Ok, got: {:?}", result);
    }
    
    #[test]
    fn test_validate_path_rejects_relative() {
        let root = env::current_dir().unwrap().to_string_lossy().to_string();
        let result = validate_path(&root, "src/main.rs");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("absolute"));
    }
    
    #[test]
    fn test_validate_path_rejects_outside_workspace() {
        let root = env::current_dir().unwrap().to_string_lossy().to_string();
        let result = validate_path(&root, "/etc/passwd");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("outside workspace"));
    }
    
    #[test]
    fn test_validate_path_nonexistent_file_in_existing_parent() {
        let root = env::current_dir().unwrap();
        // Create a test subdirectory
        let test_dir = root.join("test_subdir");
        fs::create_dir_all(&test_dir).ok();
        
        let nonexistent = test_dir.join("nonexistent_file.txt");
        let result = validate_path(
            &root.to_string_lossy().to_string(),
            &nonexistent.to_string_lossy().to_string()
        );
        assert!(result.is_ok(), "Expected Ok for nonexistent file in existing parent, got: {:?}", result);
        
        // Cleanup
        fs::remove_dir_all(&test_dir).ok();
    }
}
