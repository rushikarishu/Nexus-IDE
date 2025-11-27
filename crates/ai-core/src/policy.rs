use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Policy {
    pub allowed_tools: Vec<String>,
    pub require_approval: Vec<String>,
}

impl Policy {
    pub fn default_for_mode(mode: &str) -> Self {
        match mode {
            "supadev" => Self {
                // Allow all tools for SupaDev, but require approval for destructive operations
                allowed_tools: vec![
                    "read_file".to_string(),
                    "write_file".to_string(),
                    "list_dir".to_string(),
                    "run_command".to_string(),
                    "search_files".to_string(),
                ],
                // Only require approval for write operations
                require_approval: vec![
                    "write_file".to_string(),
                    "run_command".to_string(),
                ],
            },
            "beastup" => Self {
                // BeastUp mode allows all tools with no approval required
                allowed_tools: vec![
                    "read_file".to_string(),
                    "write_file".to_string(),
                    "list_dir".to_string(),
                    "run_command".to_string(),
                    "search_files".to_string(),
                ],
                require_approval: vec![], // Auto-approve everything in Beast Mode
            },
            _ => Self {
                allowed_tools: vec![],
                require_approval: vec![],
            },
        }
    }

    pub fn is_tool_allowed(&self, tool_name: &str) -> bool {
        self.allowed_tools.contains(&tool_name.to_string())
    }

    pub fn requires_approval(&self, tool_name: &str) -> bool {
        self.require_approval.contains(&tool_name.to_string())
    }
}
