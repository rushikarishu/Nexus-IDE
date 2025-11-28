use regex::Regex;
use std::sync::OnceLock;

static EMAIL_REGEX: OnceLock<Regex> = OnceLock::new();
static ALPHANUMERIC_REGEX: OnceLock<Regex> = OnceLock::new();
static SAFE_FILENAME_REGEX: OnceLock<Regex> = OnceLock::new();

pub trait InputValidator {
    fn validate(&self, input: &str) -> Result<(), String>;
}

pub fn validate_email(email: &str) -> Result<(), String> {
    let re = EMAIL_REGEX.get_or_init(|| {
        Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap()
    });
    
    if re.is_match(email) {
        Ok(())
    } else {
        Err("Invalid email format".to_string())
    }
}

pub fn validate_alphanumeric(input: &str) -> Result<(), String> {
    let re = ALPHANUMERIC_REGEX.get_or_init(|| {
        Regex::new(r"^[a-zA-Z0-9]+$").unwrap()
    });
    
    if re.is_match(input) {
        Ok(())
    } else {
        Err("Input must be alphanumeric".to_string())
    }
}

pub fn validate_safe_filename(filename: &str) -> Result<(), String> {
    // No path separators, no null bytes, no control chars
    let re = SAFE_FILENAME_REGEX.get_or_init(|| {
        Regex::new(r"^[^/\\:\x00-\x1f]+$").unwrap()
    });
    
    if filename.trim().is_empty() {
        return Err("Filename cannot be empty".to_string());
    }
    
    if filename == "." || filename == ".." {
        return Err("Filename cannot be '.' or '..'".to_string());
    }
    
    if re.is_match(filename) {
        Ok(())
    } else {
        Err("Invalid filename: contains forbidden characters".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_email() {
        assert!(validate_email("test@example.com").is_ok());
        assert!(validate_email("user.name+tag@sub.domain.co.uk").is_ok());
        assert!(validate_email("invalid").is_err());
        assert!(validate_email("user@").is_err());
    }

    #[test]
    fn test_validate_alphanumeric() {
        assert!(validate_alphanumeric("abc123").is_ok());
        assert!(validate_alphanumeric("ABC").is_ok());
        assert!(validate_alphanumeric("abc-123").is_err());
        assert!(validate_alphanumeric("abc 123").is_err());
    }

    #[test]
    fn test_validate_safe_filename() {
        assert!(validate_safe_filename("file.txt").is_ok());
        assert!(validate_safe_filename("my_file-123.log").is_ok());
        assert!(validate_safe_filename("path/to/file").is_err());
        assert!(validate_safe_filename("..").is_err());
        assert!(validate_safe_filename("").is_err());
    }
}
