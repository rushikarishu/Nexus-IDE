use crate::model_registry::ModelName;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityCheck {
    pub has_tests: bool,
    pub tests_passed: bool,
    pub has_documentation: bool,
    pub code_reviewed: bool,
    pub error_count: usize,
}

impl Default for QualityCheck {
    fn default() -> Self {
        Self {
            has_tests: false,
            tests_passed: false,
            has_documentation: false,
            code_reviewed: false,
            error_count: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub description: String,
    pub status: TaskStatus,
    pub assigned_model: Option<ModelName>,
    pub quality_check: QualityCheck,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub subtasks: Vec<String>, // IDs of subtasks
    pub parent_task_id: Option<String>,
}

pub struct TaskManager {
    tasks: HashMap<String, Task>,
}

impl TaskManager {
    pub fn new() -> Self {
        Self {
            tasks: HashMap::new(),
        }
    }

    pub fn create_task(&mut self, description: String, parent_id: Option<String>) -> String {
        let id = Uuid::new_v4().to_string();
        let task = Task {
            id: id.clone(),
            description,
            status: TaskStatus::Pending,
            assigned_model: None,
            quality_check: QualityCheck::default(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            subtasks: Vec::new(),
            parent_task_id: parent_id.clone(),
        };

        if let Some(pid) = parent_id {
            if let Some(parent) = self.tasks.get_mut(&pid) {
                parent.subtasks.push(id.clone());
            }
        }

        self.tasks.insert(id.clone(), task);
        id
    }

    pub fn get_task(&self, id: &str) -> Option<&Task> {
        self.tasks.get(id)
    }

    pub fn update_status(&mut self, id: &str, status: TaskStatus) -> Result<(), String> {
        if let Some(task) = self.tasks.get_mut(id) {
            task.status = status;
            task.updated_at = Utc::now();
            Ok(())
        } else {
            Err(format!("Task {} not found", id))
        }
    }

    pub fn assign_model(&mut self, id: &str, model: ModelName) -> Result<(), String> {
        if let Some(task) = self.tasks.get_mut(id) {
            task.assigned_model = Some(model);
            task.updated_at = Utc::now();
            Ok(())
        } else {
            Err(format!("Task {} not found", id))
        }
    }

    pub fn update_quality_check(&mut self, id: &str, check: QualityCheck) -> Result<(), String> {
        if let Some(task) = self.tasks.get_mut(id) {
            task.quality_check = check;
            task.updated_at = Utc::now();
            Ok(())
        } else {
            Err(format!("Task {} not found", id))
        }
    }
    
    pub fn list_tasks(&self) -> Vec<&Task> {
        self.tasks.values().collect()
    }
}
