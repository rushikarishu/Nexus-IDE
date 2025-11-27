use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ModelName {
    KimiK2Thinking,
    Glm4_6,
    MiniMaxM2,
    #[allow(non_camel_case_types)]
    Qwen3_7B_Instruct,
    #[allow(non_camel_case_types)]
    Qwen3_235B_Instruct,
    #[allow(non_camel_case_types)]
    Qwen3_5B_Instruct,
    #[allow(non_camel_case_types)]
    Qwen3VL_235B_Instruct,
    DeepSeekV3_2Exp,
    DeepSeekV3_1Terminus,
    TongyiDeepResearch,
    // Fallback/Generic
    Other(String),
}

impl ToString for ModelName {
    fn to_string(&self) -> String {
        match self {
            ModelName::KimiK2Thinking => "moonshotai/Kimi-K2-Thinking".to_string(),
            ModelName::Glm4_6 => "zai-org/GLM-4.6".to_string(),
            ModelName::MiniMaxM2 => "MiniMaxAI/MiniMax-M2".to_string(),
            ModelName::Qwen3_7B_Instruct => "Qwen/Qwen3-7B-Instruct".to_string(),
            ModelName::Qwen3_235B_Instruct => "Qwen/Qwen3-235B-A22B-Instruct-2507".to_string(),
            ModelName::Qwen3_5B_Instruct => "Qwen/Qwen3-5B-Instruct".to_string(),
            ModelName::Qwen3VL_235B_Instruct => "Qwen/Qwen3-VL-235B-A22B-Instruct".to_string(),
            ModelName::DeepSeekV3_2Exp => "deepseek-ai/DeepSeek-V3.2-Exp".to_string(),
            ModelName::DeepSeekV3_1Terminus => "deepseek-ai/DeepSeek-V3.1-Terminus".to_string(),
            ModelName::TongyiDeepResearch => "Alibaba-NLP/Tongyi-DeepResearch-30B-A3B".to_string(),
            ModelName::Other(s) => s.clone(),
        }
    }
}

impl From<&str> for ModelName {
    fn from(s: &str) -> Self {
        match s {
            "moonshotai/Kimi-K2-Thinking" => ModelName::KimiK2Thinking,
            "zai-org/GLM-4.6" => ModelName::Glm4_6,
            "MiniMaxAI/MiniMax-M2" => ModelName::MiniMaxM2,
            "Qwen/Qwen3-7B-Instruct" => ModelName::Qwen3_7B_Instruct,
            "Qwen/Qwen3-235B-A22B-Instruct-2507" => ModelName::Qwen3_235B_Instruct,
            "Qwen/Qwen3-5B-Instruct" => ModelName::Qwen3_5B_Instruct,
            "Qwen/Qwen3-VL-235B-A22B-Instruct" => ModelName::Qwen3VL_235B_Instruct,
            "deepseek-ai/DeepSeek-V3.2-Exp" => ModelName::DeepSeekV3_2Exp,
            "deepseek-ai/DeepSeek-V3.1-Terminus" => ModelName::DeepSeekV3_1Terminus,
            "Alibaba-NLP/Tongyi-DeepResearch-30B-A3B" => ModelName::TongyiDeepResearch,
            _ => ModelName::Other(s.to_string()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ModelCapabilities {
    pub coding_score: f32,
    pub reasoning_score: f32,
    pub math_score: f32,
    pub data_analysis_score: f32,
    pub language_score: f32,
    pub if_score: f32, // Instruction Following
    pub agentic_coding_score: f32,
}

pub struct ModelRegistry {
    models: HashMap<ModelName, ModelCapabilities>,
}

impl ModelRegistry {
    pub fn new() -> Self {
        let mut models = HashMap::new();

        // Based on user provided benchmarks
        
        // Kimi K2 Thinking
        models.insert(ModelName::KimiK2Thinking, ModelCapabilities {
            coding_score: 68.20,
            reasoning_score: 87.69,
            math_score: 88.46,
            data_analysis_score: 69.08,
            language_score: 61.92,
            if_score: 90.60,
            agentic_coding_score: 35.00,
        });

        // GLM 4.6
        models.insert(ModelName::Glm4_6, ModelCapabilities {
            coding_score: 71.02,
            reasoning_score: 92.22,
            math_score: 90.10,
            data_analysis_score: 71.74,
            language_score: 61.62, // Using 4.5 proxy if 4.6 missing, but 4.6 is listed in some
            if_score: 81.65,
            agentic_coding_score: 35.00,
        });

        // MiniMax M2
        models.insert(ModelName::MiniMaxM2, ModelCapabilities {
            coding_score: 0.0, // Missing in coding avg list? No, wait. Not in top list. Assume lower.
            reasoning_score: 88.22,
            math_score: 85.95,
            data_analysis_score: 67.56,
            language_score: 0.0, // Missing
            if_score: 81.02,
            agentic_coding_score: 21.67,
        });

        // DeepSeek V3.2 Exp
        models.insert(ModelName::DeepSeekV3_2Exp, ModelCapabilities {
            coding_score: 73.19,
            reasoning_score: 88.72, // Using thinking score as proxy or base? User listed "deepseek-v3.2-exp" and "deepseek-v3.2-exp-thinking". 
            // Let's use the non-thinking scores where available, or thinking if that's the model we use.
            // The user listed "deepseek-ai/DeepSeek-V3.2-Exp" in the model list.
            math_score: 80.79,
            data_analysis_score: 72.78, // Proxy from thinking
            language_score: 62.71,
            if_score: 83.15,
            agentic_coding_score: 35.00,
        });

        // Qwen3 235B Instruct
        models.insert(ModelName::Qwen3_235B_Instruct, ModelCapabilities {
            coding_score: 69.61,
            reasoning_score: 86.89,
            math_score: 80.15, // Proxy
            data_analysis_score: 68.31, // Proxy
            language_score: 66.29,
            if_score: 87.73, // Proxy
            agentic_coding_score: 31.67, // Proxy
        });

        Self { models }
    }

    pub fn get_capabilities(&self, model: &ModelName) -> Option<&ModelCapabilities> {
        self.models.get(model)
    }

    pub fn get_best_model_for(&self, criteria: impl Fn(&ModelCapabilities) -> f32) -> Option<ModelName> {
        self.models
            .iter()
            .max_by(|a, b| criteria(a.1).partial_cmp(&criteria(b.1)).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(name, _)| name.clone())
    }
}
