use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use crate::session::{Session, SessionConfig};
use crate::router::ProviderRouter;
use crate::audit::{AuditLogger, AuditLog};
use chrono::Utc;

/// Maximum number of sessions before cleanup is triggered
const MAX_SESSIONS: usize = 100;

#[derive(Clone)]
pub struct SessionManager {
    pub sessions: Arc<RwLock<HashMap<String, Session>>>,
    pub router: Arc<ProviderRouter>,
    pub audit_logger: Arc<dyn AuditLogger>,
}

impl SessionManager {
    pub fn new(audit_logger: Arc<dyn AuditLogger>) -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            router: Arc::new(ProviderRouter::new()),
            audit_logger,
        }
    }

    pub fn create_session(&self, config: SessionConfig, workspace_root: String) -> String {
        // Cleanup expired sessions before creating new one
        self.cleanup_expired_sessions();
        
        let mut registry = crate::tools::ToolRegistry::new();
        
        // Register basic tools
        registry.register(Box::new(crate::tools::ReadFileTool { workspace_root: workspace_root.clone() }));
        registry.register(Box::new(crate::tools::WriteFileTool { workspace_root: workspace_root.clone() }));
        registry.register(Box::new(crate::tools::ListDirTool { workspace_root: workspace_root.clone() }));
        registry.register(Box::new(crate::tools::RunCommandTool { workspace_root: workspace_root.clone() }));
        registry.register(Box::new(crate::tools::SearchFilesTool { workspace_root: workspace_root.clone() }));
        
        let session = Session::new(config, std::sync::Arc::new(registry));
        let id = session.id.clone();
        let mut sessions = self.sessions.write().unwrap();
        
        // If we're at max capacity, remove oldest sessions
        if sessions.len() >= MAX_SESSIONS {
            self.evict_oldest_sessions(&mut sessions, MAX_SESSIONS / 4);
        }
        
        sessions.insert(id.clone(), session);
        id
    }

    pub fn get_session(&self, id: &str) -> Option<Session> {
        let mut sessions = self.sessions.write().unwrap();
        if let Some(session) = sessions.get_mut(id) {
            // Check if expired
            if session.is_expired() {
                self.audit_logger.log(AuditLog {
                    id: uuid::Uuid::new_v4().to_string(),
                    timestamp: Utc::now(),
                    session_id: id.to_string(),
                    actor: "system".to_string(),
                    action: "session_expired".to_string(),
                    details: serde_json::json!({ "reason": "TTL exceeded" }),
                });
                sessions.remove(id);
                return None;
            }
            // Touch the session to update last_activity
            session.touch();
            return Some(session.clone());
        }
        None
    }

    pub fn delete_session(&self, id: &str) -> bool {
        let mut sessions = self.sessions.write().unwrap();
        if sessions.remove(id).is_some() {
            self.audit_logger.log(AuditLog {
                id: uuid::Uuid::new_v4().to_string(),
                timestamp: Utc::now(),
                session_id: id.to_string(),
                actor: "system".to_string(),
                action: "session_deleted".to_string(),
                details: serde_json::json!({}),
            });
            true
        } else {
            false
        }
    }
    
    /// Cleanup all expired sessions
    pub fn cleanup_expired_sessions(&self) -> usize {
        let mut sessions = self.sessions.write().unwrap();
        let expired_ids: Vec<String> = sessions
            .iter()
            .filter(|(_, s)| s.is_expired())
            .map(|(id, _)| id.clone())
            .collect();
        
        let count = expired_ids.len();
        for id in &expired_ids {
            self.audit_logger.log(AuditLog {
                id: uuid::Uuid::new_v4().to_string(),
                timestamp: Utc::now(),
                session_id: id.clone(),
                actor: "system".to_string(),
                action: "session_expired_cleanup".to_string(),
                details: serde_json::json!({}),
            });
            sessions.remove(id);
        }
        
        if count > 0 {
            log::info!("Cleaned up {} expired sessions", count);
        }
        count
    }
    
    /// Evict oldest sessions to make room
    fn evict_oldest_sessions(&self, sessions: &mut HashMap<String, Session>, count: usize) {
        let mut session_times: Vec<(String, chrono::DateTime<Utc>)> = sessions
            .iter()
            .map(|(id, s)| (id.clone(), s.last_activity))
            .collect();
        
        session_times.sort_by_key(|(_, time)| *time);
        
        for (id, _) in session_times.into_iter().take(count) {
            self.audit_logger.log(AuditLog {
                id: uuid::Uuid::new_v4().to_string(),
                timestamp: Utc::now(),
                session_id: id.clone(),
                actor: "system".to_string(),
                action: "session_evicted".to_string(),
                details: serde_json::json!({ "reason": "capacity limit" }),
            });
            sessions.remove(&id);
        }
    }
    
    /// Get session count
    pub fn session_count(&self) -> usize {
        self.sessions.read().unwrap().len()
    }
    
    /// Get session statistics
    pub fn get_stats(&self) -> SessionStats {
        let sessions = self.sessions.read().unwrap();
        let total = sessions.len();
        let expired = sessions.values().filter(|s| s.is_expired()).count();
        let active = total - expired;
        let total_messages: usize = sessions.values().map(|s| s.history.len()).sum();
        let pending_proposals: usize = sessions.values().map(|s| s.pending_proposals_count()).sum();
        
        SessionStats {
            total_sessions: total,
            active_sessions: active,
            expired_sessions: expired,
            total_messages,
            pending_proposals,
        }
    }
    
    pub fn add_message(&self, id: &str, message: crate::provider::Message) -> Result<(), String> {
        let mut sessions = self.sessions.write().unwrap();
        if let Some(session) = sessions.get_mut(id) {
            // Audit log before adding
            self.audit_logger.log(AuditLog {
                id: uuid::Uuid::new_v4().to_string(),
                timestamp: Utc::now(),
                session_id: id.to_string(),
                actor: match message.role {
                    crate::provider::Role::User => "user",
                    crate::provider::Role::Assistant => "assistant",
                    crate::provider::Role::System => "system",
                    crate::provider::Role::Tool => "tool",
                }.to_string(),
                action: "message".to_string(),
                details: serde_json::json!({
                    "content": message.content.clone(),
                }),
            });
            
            session.add_message(message);
            Ok(())
        } else {
            Err("Session not found".to_string())
        }
    }

    pub fn add_proposal(&self, session_id: &str, proposal: crate::tools::Proposal) -> Result<(), String> {
        let mut sessions = self.sessions.write().unwrap();
        if let Some(session) = sessions.get_mut(session_id) {
            // Audit log proposal
            self.audit_logger.log(AuditLog {
                id: uuid::Uuid::new_v4().to_string(),
                timestamp: Utc::now(),
                session_id: session_id.to_string(),
                actor: "assistant".to_string(), // Proposals are usually from assistant
                action: "proposal_created".to_string(),
                details: serde_json::json!({
                    "proposal_id": proposal.id,
                    "tool": proposal.tool_name,
                    "args": proposal.args,
                }),
            });

            session.proposals.insert(proposal.id.clone(), proposal);
            Ok(())
        } else {
            Err("Session not found".to_string())
        }
    }

    pub fn get_proposals(&self, session_id: &str) -> Result<Vec<crate::tools::Proposal>, String> {
        let sessions = self.sessions.read().unwrap();
        if let Some(session) = sessions.get(session_id) {
            Ok(session.proposals.values().cloned().collect())
        } else {
            Err("Session not found".to_string())
        }
    }

    pub fn update_proposal_status(&self, session_id: &str, proposal_id: &str, status: crate::tools::ProposalStatus) -> Result<(), String> {
        let mut sessions = self.sessions.write().unwrap();
        if let Some(session) = sessions.get_mut(session_id) {
            if let Some(proposal) = session.proposals.get_mut(proposal_id) {
                // Audit log status change
                self.audit_logger.log(AuditLog {
                    id: uuid::Uuid::new_v4().to_string(),
                    timestamp: Utc::now(),
                    session_id: session_id.to_string(),
                    actor: "user".to_string(), // Status changes (approve/reject) are usually user actions
                    action: "proposal_status_updated".to_string(),
                    details: serde_json::json!({
                        "proposal_id": proposal_id,
                        "new_status": format!("{:?}", status),
                    }),
                });

                proposal.status = status;
                Ok(())
            } else {
                Err("Proposal not found".to_string())
            }
        } else {
            Err("Session not found".to_string())
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionStats {
    pub total_sessions: usize,
    pub active_sessions: usize,
    pub expired_sessions: usize,
    pub total_messages: usize,
    pub pending_proposals: usize,
}
