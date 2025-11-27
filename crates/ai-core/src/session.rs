use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc, Duration};
use crate::provider::Message;
use crate::policy::Policy;
use crate::tools::{ToolRegistry, Proposal};
use std::collections::HashMap;
use std::sync::Arc;

/// Default session TTL in hours
pub const DEFAULT_SESSION_TTL_HOURS: i64 = 24;

/// Maximum number of messages per session before cleanup
pub const MAX_MESSAGES_PER_SESSION: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    pub mode: String, // "supadev" | "beastup"
    pub provider: String, // "internal" | "openai" | ...
    pub model: Option<String>,
    pub version: Option<String>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub config: SessionConfig,
    pub history: Vec<Message>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_activity: DateTime<Utc>,
    pub policy: Option<Policy>,
    #[serde(skip)]
    pub tool_registry: Arc<ToolRegistry>,
    pub proposals: HashMap<String, Proposal>,
    /// Time-to-live in hours. Session expires after this duration of inactivity.
    pub ttl_hours: i64,
}

impl Session {
    pub fn new(config: SessionConfig, tool_registry: Arc<ToolRegistry>) -> Self {
        let policy = Policy::default_for_mode(&config.mode);
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            config,
            history: Vec::new(),
            created_at: now,
            updated_at: now,
            last_activity: now,
            policy: Some(policy),
            tool_registry,
            proposals: HashMap::new(),
            ttl_hours: DEFAULT_SESSION_TTL_HOURS,
        }
    }

    pub fn add_message(&mut self, message: Message) {
        self.history.push(message);
        self.updated_at = Utc::now();
        self.last_activity = Utc::now();
        
        // Trim history if too long (keep most recent messages)
        if self.history.len() > MAX_MESSAGES_PER_SESSION {
            let drain_count = self.history.len() - MAX_MESSAGES_PER_SESSION;
            self.history.drain(0..drain_count);
        }
    }
    
    /// Check if the session has expired based on TTL
    pub fn is_expired(&self) -> bool {
        let expiry_time = self.last_activity + Duration::hours(self.ttl_hours);
        Utc::now() > expiry_time
    }
    
    /// Touch the session to reset the TTL timer
    pub fn touch(&mut self) {
        self.last_activity = Utc::now();
    }
    
    /// Get the number of pending proposals
    pub fn pending_proposals_count(&self) -> usize {
        self.proposals.values()
            .filter(|p| p.status == crate::tools::ProposalStatus::Pending)
            .count()
    }
}
