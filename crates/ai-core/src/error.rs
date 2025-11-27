use thiserror::Error;
use serde::Serialize;

#[derive(Debug, Error, Serialize)]
pub enum ProviderError {
    #[error("Authentication failed: {0}")]
    Auth(String),
    #[error("Rate limit exceeded")]
    RateLimit,
    #[error("Server error: {0}")]
    Server(String),
    #[error("Network error: {0}")]
    Network(String),
    #[error("Configuration error: {0}")]
    Configuration(String),
    #[error("Feature not implemented: {0}")]
    NotImplemented(String),
    #[error("Unknown error: {0}")]
    Unknown(String),
}
