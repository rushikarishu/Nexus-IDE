use std::sync::Arc;
use crate::provider::LLMProvider;
use crate::session::SessionConfig;
use crate::error::ProviderError;
use crate::providers::internal::InternalProvider;
use crate::providers::openai::{OpenAIProvider, OpenAIConfig};
use crate::providers::anthropic::{AnthropicProvider, AnthropicConfig};

pub struct ProviderRouter {
    internal: Arc<InternalProvider>,
    openai: Arc<OpenAIProvider>,
    anthropic: Arc<AnthropicProvider>,
}

impl ProviderRouter {
    pub fn new() -> Self {
        Self {
            internal: Arc::new(InternalProvider::new()),
            openai: Arc::new(OpenAIProvider::new(OpenAIConfig::default())),
            anthropic: Arc::new(AnthropicProvider::new(AnthropicConfig::default())),
        }
    }

    pub fn get_provider(&self, config: &SessionConfig) -> Result<Arc<dyn LLMProvider>, ProviderError> {
        match config.provider.as_str() {
            "internal" => Ok(self.internal.clone()),
            "openai" => Ok(self.openai.clone()),
            "anthropic" => Ok(self.anthropic.clone()),
            _ => Err(ProviderError::Configuration(format!("Unknown provider: {}", config.provider))),
        }
    }
}
