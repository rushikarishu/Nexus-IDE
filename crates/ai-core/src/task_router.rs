use crate::model_registry::{ModelName, ModelRegistry};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum TaskType {
    Coding,
    Reasoning,
    Math,
    DataAnalysis,
    Language,
    InstructionFollowing,
    AgenticCoding,
    General,
}

pub struct TaskRouter {
    registry: ModelRegistry,
}

impl TaskRouter {
    pub fn new() -> Self {
        Self {
            registry: ModelRegistry::new(),
        }
    }

    pub fn determine_task_type(&self, task_description: &str) -> TaskType {
        let lower = task_description.to_lowercase();
        
        // Check for Agentic Coding first or within Coding
        if lower.contains("agent") || lower.contains("autonomous") {
            if lower.contains("code") || lower.contains("build") || lower.contains("create") || lower.contains("project") {
                return TaskType::AgenticCoding;
            }
        }

        if lower.contains("code") || lower.contains("function") || lower.contains("class") || lower.contains("implement") 
           || lower.contains("build") || lower.contains("create") || lower.contains("develop") {
            return TaskType::Coding;
        }
        
        if lower.contains("math") || lower.contains("calculate") || lower.contains("equation") {
            return TaskType::Math;
        }
        
        if lower.contains("analyze") || lower.contains("data") || lower.contains("table") || lower.contains("csv") {
            return TaskType::DataAnalysis;
        }
        
        if lower.contains("reason") || lower.contains("logic") || lower.contains("why") || lower.contains("puzzle") {
            return TaskType::Reasoning;
        }
        
        if lower.contains("write") || lower.contains("story") || lower.contains("summary") || lower.contains("translate") {
            return TaskType::Language;
        }

        TaskType::General
    }

    pub fn route(&self, task_description: &str) -> ModelName {
        let task_type = self.determine_task_type(task_description);
        self.route_by_type(task_type)
    }

    pub fn route_by_type(&self, task_type: TaskType) -> ModelName {
        match task_type {
            TaskType::Coding => self.registry.get_best_model_for(|c| c.coding_score).unwrap_or(ModelName::KimiK2Thinking),
            TaskType::AgenticCoding => self.registry.get_best_model_for(|c| c.agentic_coding_score).unwrap_or(ModelName::KimiK2Thinking),
            TaskType::Reasoning => self.registry.get_best_model_for(|c| c.reasoning_score).unwrap_or(ModelName::KimiK2Thinking),
            TaskType::Math => self.registry.get_best_model_for(|c| c.math_score).unwrap_or(ModelName::KimiK2Thinking),
            TaskType::DataAnalysis => self.registry.get_best_model_for(|c| c.data_analysis_score).unwrap_or(ModelName::KimiK2Thinking),
            TaskType::Language => self.registry.get_best_model_for(|c| c.language_score).unwrap_or(ModelName::KimiK2Thinking),
            TaskType::InstructionFollowing => self.registry.get_best_model_for(|c| c.if_score).unwrap_or(ModelName::KimiK2Thinking),
            TaskType::General => ModelName::KimiK2Thinking, // Default main model
        }
    }

    pub fn get_fallback(&self, model: &ModelName) -> ModelName {
        // Simple fallback logic: if Kimi fails, try GLM, then DeepSeek
        match model {
            ModelName::KimiK2Thinking => ModelName::Glm4_6,
            ModelName::Glm4_6 => ModelName::DeepSeekV3_2Exp,
            _ => ModelName::KimiK2Thinking,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_determine_task_type() {
        let router = TaskRouter::new();
        
        assert_eq!(router.determine_task_type("Write a function to calculate fibonacci"), TaskType::Coding);
        assert_eq!(router.determine_task_type("Calculate 2 + 2"), TaskType::Math);
        assert_eq!(router.determine_task_type("Analyze this csv data"), TaskType::DataAnalysis);
        assert_eq!(router.determine_task_type("Why is the sky blue?"), TaskType::Reasoning);
        assert_eq!(router.determine_task_type("Write a story about a cat"), TaskType::Language);
        assert_eq!(router.determine_task_type("Build an autonomous agent project"), TaskType::AgenticCoding);
    }

    #[test]
    fn test_route() {
        let router = TaskRouter::new();
        
        // Coding -> Qwen3-Coder (480b) or Kimi?
        // In registry:
        // Kimi: 68.20
        // GLM 4.6: 71.02
        // DeepSeek V3.2 Exp: 73.19
        // Qwen3 235B: 69.61
        // Best for coding in my registry is DeepSeek V3.2 Exp (73.19)
        assert_eq!(router.route("Write a function"), ModelName::DeepSeekV3_2Exp);

        // Reasoning -> GLM 4.6 (92.22)
        assert_eq!(router.route("Solve this logic puzzle"), ModelName::Glm4_6);

        // Math -> GLM 4.6 (90.10)
        assert_eq!(router.route("Calculate the integral"), ModelName::Glm4_6);
        
        // Agentic Coding -> DeepSeek V3.2 Exp (35.00) or GLM 4.6 (35.00) or Kimi (35.00)
        // If tie, max_by might pick first. Let's see order in HashMap iteration (random) or insertion?
        // HashMap iteration is random.
        // But wait, I inserted them.
        // Let's just check it returns ONE of the top ones.
        let model = router.route("Build an autonomous agent");
        assert!(matches!(model, ModelName::DeepSeekV3_2Exp | ModelName::Glm4_6 | ModelName::KimiK2Thinking));
    }
}
