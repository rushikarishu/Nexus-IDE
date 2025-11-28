// Security and operational constants for Nexus IDE
// All limits and constraints are defined here for easy auditing and modification

/// File operation limits
pub mod files {
    /// Maximum file size that can be read/written (10MB)
    pub const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024;
    
    /// Maximum search results to return
    pub const MAX_SEARCH_RESULTS: usize = 1000;
}

/// Terminal operation limits
pub mod terminal {
    /// Maximum number of terminal rows
    pub const MAX_ROWS: u16 = 500;
    
    /// Maximum number of terminal columns
    pub const MAX_COLS: u16 = 500;
    
    /// Minimum terminal dimensions
    pub const MIN_ROWS: u16 = 1;
    pub const MIN_COLS: u16 = 1;
}

/// AI session limits
pub mod session {
    /// Maximum number of concurrent sessions
    pub const MAX_SESSIONS: usize = 100;
    
    /// Maximum messages per session before trimming
    pub const MAX_MESSAGES_PER_SESSION: usize = 500;
    
    /// Maximum size of a single message (100KB)
    pub const MAX_MESSAGE_SIZE: usize = 100 * 1024;
    
    /// Maximum total session memory (10MB)
    pub const MAX_SESSION_MEMORY: usize = 10 * 1024 * 1024;
    
    /// Session TTL in hours
    pub const DEFAULT_SESSION_TTL_HOURS: i64 = 24;
}

/// Git operation limits
pub mod git {
    /// Maximum branch name length
    pub const MAX_BRANCH_NAME_LEN: usize = 255;
    
    /// Maximum commit message length
    pub const MAX_COMMIT_MESSAGE_LEN: usize = 10000;
    
    /// Maximum file path length for git operations
    pub const MAX_FILE_PATH_LEN: usize = 4096;
    
    /// Maximum number of log entries to fetch
    pub const MAX_LOG_ENTRIES: usize = 1000;
}

/// LSP operation limits
pub mod lsp {
    /// LSP server startup timeout in seconds
    pub const STARTUP_TIMEOUT_SECS: u64 = 10;
    
    /// LSP shutdown grace period in milliseconds
    pub const SHUTDOWN_GRACE_PERIOD_MS: u64 = 1000;
}

/// Polling and timing constants
pub mod timing {
    /// Minimum git status poll interval (milliseconds)
    pub const GIT_POLL_MIN_INTERVAL_MS: u64 = 5000;
    
    /// Maximum git status poll interval (milliseconds)
    pub const GIT_POLL_MAX_INTERVAL_MS: u64 = 30000;
    
    /// File watcher debounce delay (milliseconds)
    pub const FILE_WATCH_DEBOUNCE_MS: u64 = 500;
}

/// Validation patterns
pub mod patterns {
    /// Valid branch name pattern (alphanumeric, slash, dash, underscore, dot)
    pub const BRANCH_NAME_PATTERN: &str = r"^[a-zA-Z0-9/_.-]+$";
    
    /// Invalid characters in commit messages (shell metacharacters)
    pub const COMMIT_MESSAGE_FORBIDDEN_CHARS: &[char] = &['`', '$', '|', '&', ';', '<', '>'];
}
