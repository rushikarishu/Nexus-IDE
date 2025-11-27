use serde::{Deserialize, Serialize};
use serde_json::Value;

use std::fs;
use std::collections::HashMap;

pub trait Tool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn execute(&self, args: Value) -> Result<String, String>;
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProposalStatus {
    Pending,
    Approved,
    Rejected,
    Executed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Proposal {
    pub id: String,
    pub tool_name: String,
    pub args: Value,
    pub status: ProposalStatus,
    pub diff: Option<String>,
}

pub struct ToolRegistry {
    pub tools: HashMap<String, Box<dyn Tool>>,
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for ToolRegistry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ToolRegistry")
         .field("tools", &self.tools.keys())
         .finish()
    }
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    pub fn register(&mut self, tool: Box<dyn Tool>) {
        self.tools.insert(tool.name().to_string(), tool);
    }

    pub fn get(&self, name: &str) -> Option<&Box<dyn Tool>> {
        self.tools.get(name)
    }
}

use crate::utils::validate_path;

pub struct ReadFileTool {
    pub workspace_root: String,
}

impl ReadFileTool {
    pub fn new(workspace_root: String) -> Self {
        Self { workspace_root }
    }
}

impl Tool for ReadFileTool {
    fn name(&self) -> &str {
        "read_file"
    }

    fn description(&self) -> &str {
        "Reads the content of a file. Args: { \"path\": \"string\" }"
    }

    fn execute(&self, args: Value) -> Result<String, String> {
        let path_str = args["path"].as_str().ok_or("Missing path argument")?;
        let path = validate_path(&self.workspace_root, path_str)?;
        
        fs::read_to_string(path).map_err(|e| e.to_string())
    }
}

pub struct WriteFileTool {
    pub workspace_root: String,
}

impl WriteFileTool {
    pub fn new(workspace_root: String) -> Self {
        Self { workspace_root }
    }
}

impl Tool for WriteFileTool {
    fn name(&self) -> &str {
        "write_file"
    }

    fn description(&self) -> &str {
        "Writes content to a file. Args: { \"path\": \"string\", \"content\": \"string\" } (IMPORTANT: Escape newlines as \\n in content string)"
    }

    fn execute(&self, args: Value) -> Result<String, String> {
        let path_str = args["path"].as_str().ok_or("Missing path argument")?;
        let content = args["content"].as_str().ok_or("Missing content argument")?;
        
        let path = validate_path(&self.workspace_root, path_str)?;
        
        // Ensure parent dir exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        fs::write(path, content).map_err(|e| e.to_string())?;
        Ok("File written successfully".to_string())
    }
}

pub struct ListDirTool {
    pub workspace_root: String,
}

impl ListDirTool {
    pub fn new(workspace_root: String) -> Self {
        Self { workspace_root }
    }
}

impl Tool for ListDirTool {
    fn name(&self) -> &str {
        "list_dir"
    }

    fn description(&self) -> &str {
        "Lists files in a directory. Args: { \"path\": \"string\" }"
    }

    fn execute(&self, args: Value) -> Result<String, String> {
        let path_str = args["path"].as_str().unwrap_or(".");
        let path = validate_path(&self.workspace_root, path_str)?;

        let mut entries = Vec::new();
        for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let file_type = entry.file_type().map_err(|e| e.to_string())?;
            let name = entry.file_name().to_string_lossy().to_string();
            let type_str = if file_type.is_dir() { "dir" } else { "file" };
            entries.push(format!("{} ({})", name, type_str));
        }
        
        Ok(entries.join("\n"))
    }
}

pub struct RunCommandTool {
    pub workspace_root: String,
}

impl RunCommandTool {
    pub fn new(workspace_root: String) -> Self {
        Self { workspace_root }
    }
}

impl Tool for RunCommandTool {
    fn name(&self) -> &str {
        "run_command"
    }

    fn description(&self) -> &str {
        "Runs a shell command. Args: { \"command\": \"string\" }"
    }

    fn execute(&self, args: Value) -> Result<String, String> {
        let command = args["command"].as_str().ok_or("Missing command argument")?;
        
        // Security: Check against dangerous command patterns
        if !is_command_safe(command) {
            return Err("Command blocked by security policy. Dangerous patterns detected.".to_string());
        }

        let output = std::process::Command::new("sh")
            .arg("-c")
            .arg(command)
            .current_dir(&self.workspace_root)
            .env("PATH", std::env::var("PATH").unwrap_or_default())
            .output()
            .map_err(|e| e.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        // Limit output size to prevent memory issues
        let max_output_len = 50000;
        let stdout_limited = if stdout.len() > max_output_len {
            format!("{}...\n[Output truncated, {} bytes total]", &stdout[..max_output_len], stdout.len())
        } else {
            stdout.to_string()
        };

        if output.status.success() {
            let stderr_limited = if stderr.len() > max_output_len {
                format!("{}...\n[Truncated]", &stderr[..max_output_len])
            } else {
                stderr.to_string()
            };
            
            if stderr_limited.is_empty() {
                Ok(format!("Command executed successfully. Exit Code: 0\nOutput:\n{}", stdout_limited))
            } else {
                Ok(format!("Command executed successfully. Exit Code: 0\nOutput:\n{}\nStderr:\n{}", stdout_limited, stderr_limited))
            }
        } else {
            let stderr_limited = if stderr.len() > max_output_len {
                format!("{}...\n[Truncated]", &stderr[..max_output_len])
            } else {
                stderr.to_string()
            };
            Ok(format!("Command failed with code {}:\nStdout:\n{}\nStderr:\n{}", 
                output.status.code().unwrap_or(-1), stdout_limited, stderr_limited))
        }
    }
}

/// Checks if a command is safe to execute.
/// Uses a blocklist approach with pattern matching for dangerous operations.
fn is_command_safe(command: &str) -> bool {
    let cmd_lower = command.to_lowercase();
    
    // Dangerous command patterns (blocklist)
    let dangerous_patterns = [
        // Destructive file operations on system directories
        "rm -rf /",
        "rm -rf /*",
        "rm -fr /",
        "rm --no-preserve-root",
        "rmdir /",
        // Fork bombs
        ":(){ :|:& };:",
        ".LfL", // Common fork bomb pattern
        // System modification
        "mkfs",
        "dd if=",
        "chmod 777 /",
        "chown -R",
        "> /dev/sd",
        // Network exfiltration
        "curl.*|.*sh",
        "wget.*|.*sh",
        "nc -e",
        "bash -i",
        "/dev/tcp/",
        // Privilege escalation attempts  
        "sudo su",
        "sudo -i",
        "sudo bash",
        "passwd root",
        // Dangerous redirects
        "> /etc/",
        ">> /etc/",
        "> /bin/",
        "> /usr/",
        // Shutdown/reboot
        "shutdown",
        "reboot",
        "init 0",
        "init 6",
        "poweroff",
        "halt",
    ];
    
    for pattern in dangerous_patterns {
        if cmd_lower.contains(pattern) {
            log::warn!("Blocked dangerous command pattern: {}", pattern);
            return false;
        }
    }
    
    // Check for attempts to escape workspace via path traversal in command
    if command.contains("../") && (cmd_lower.contains("rm") || cmd_lower.contains("mv") || cmd_lower.contains("cp")) {
        log::warn!("Blocked command with path traversal");
        return false;
    }
    
    true
}

pub struct SearchFilesTool {
    pub workspace_root: String,
}

impl SearchFilesTool {
    pub fn new(workspace_root: String) -> Self {
        Self { workspace_root }
    }
}

impl Tool for SearchFilesTool {
    fn name(&self) -> &str {
        "search_files"
    }

    fn description(&self) -> &str {
        "Searches for a string in files. Args: { \"query\": \"string\", \"path\": \"string\" (optional) }"
    }

    fn execute(&self, args: Value) -> Result<String, String> {
        let query = args["query"].as_str().ok_or("Missing query argument")?;
        let path_str = args["path"].as_str().unwrap_or(".");
        let path = validate_path(&self.workspace_root, path_str)?;

        // Use grep for efficiency
        let output = std::process::Command::new("grep")
            .arg("-r")
            .arg("-n") // Line numbers
            .arg(query)
            .arg(path)
            .output()
            .map_err(|e| e.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        
        if stdout.is_empty() {
            Ok("No matches found.".to_string())
        } else {
            // Limit output size
            let lines: Vec<&str> = stdout.lines().take(50).collect();
            let result = lines.join("\n");
            if stdout.lines().count() > 50 {
                Ok(format!("{}\n... (truncated)", result))
            } else {
                Ok(result)
            }
        }
    }
}

pub struct SequentialThinkingTool;

impl SequentialThinkingTool {
    pub fn new() -> Self {
        Self
    }
}

impl Tool for SequentialThinkingTool {
    fn name(&self) -> &str {
        "sequential_thinking"
    }

    fn description(&self) -> &str {
        "A tool for dynamic step-by-step thinking. Use this to break down complex problems. Args: { \"thought\": \"string\", \"needs_more_thought\": boolean }"
    }

    fn execute(&self, args: Value) -> Result<String, String> {
        let thought = args["thought"].as_str().ok_or("Missing thought argument")?;
        let needs_more = args["needs_more_thought"].as_bool().unwrap_or(false);
        
        if needs_more {
            Ok(format!("Thought recorded: {}. Continue thinking.", thought))
        } else {
            Ok(format!("Thought recorded: {}. distinct thought process complete.", thought))
        }
    }
}
