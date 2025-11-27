use std::process::{Command, Stdio};
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartupStatus {
    pub qdrant_running: bool,
    pub qdrant_message: String,
    pub llm_available: bool,
    pub llm_message: String,
}

/// Check if Qdrant is already running
fn is_qdrant_running() -> bool {
    #[cfg(target_os = "linux")]
    {
        Command::new("pgrep")
            .arg("-f")
            .arg("qdrant")
            .stdout(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    
    #[cfg(target_os = "macos")]
    {
        Command::new("pgrep")
            .arg("-f")
            .arg("qdrant")
            .stdout(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    
    #[cfg(target_os = "windows")]
    {
        Command::new("tasklist")
            .stdout(Stdio::piped())
            .spawn()
            .and_then(|child| child.wait_with_output())
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|s| s.contains("qdrant"))
            .unwrap_or(false)
    }
}

/// Start Qdrant as a background process
pub fn start_qdrant() -> Result<String, String> {
    // Check if already running
    if is_qdrant_running() {
        log::info!("Qdrant is already running");
        return Ok("Qdrant is already running".to_string());
    }
    
    // Find project root - go up from current dir to find bin/qdrant
    let mut search_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
    
    let mut qdrant_path = None;
    
    // Try current directory and up to 3 parent directories
    for _ in 0..4 {
        let candidate = search_dir.join("bin").join("qdrant");
        if candidate.exists() {
            qdrant_path = Some(candidate);
            break;
        }
        if let Some(parent) = search_dir.parent() {
            search_dir = parent.to_path_buf();
        } else {
            break;
        }
    }
    
    let qdrant_binary = qdrant_path.ok_or_else(|| {
        "Qdrant binary not found in bin/ folder. Please ensure bin/qdrant exists.".to_string()
    })?;
    
    // Use the directory containing bin/ as the working directory
    let project_root = qdrant_binary.parent().and_then(|p| p.parent())
        .ok_or("Failed to determine project root")?;
    
    // Create log file path
    let log_path = project_root.join("qdrant.log");
    let log_file = std::fs::File::create(&log_path)
        .map_err(|e| format!("Failed to create Qdrant log file: {}", e))?;
    
    // Start Qdrant as a detached background process
    log::info!("Starting Qdrant from: {}", qdrant_binary.display());
    
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        
        Command::new(&qdrant_binary)
            .current_dir(project_root)
            .stdout(Stdio::from(log_file.try_clone().map_err(|e| e.to_string())?))
            .stderr(Stdio::from(log_file))
            .process_group(0) // Create new process group
            .spawn()
            .map_err(|e| format!("Failed to start Qdrant: {}", e))?;
    }
    
    #[cfg(windows)]
    {
        Command::new(&qdrant_binary)
            .current_dir(project_root)
            .stdout(Stdio::from(log_file.try_clone().map_err(|e| e.to_string())?))
            .stderr(Stdio::from(log_file))
            .creation_flags(0x00000008) // DETACHED_PROCESS
            .spawn()
            .map_err(|e| format!("Failed to start Qdrant: {}", e))?;
    }
    
    log::info!("Qdrant started successfully, logging to: {}", log_path.display());
    
    // Give it a moment to initialize
    std::thread::sleep(std::time::Duration::from_millis(500));
    
    Ok(format!("Qdrant started successfully at {}", qdrant_binary.display()))
}

/// Check LLM connectivity
pub async fn check_llm_health() -> Result<String, String> {
    let endpoint = std::env::var("INTERNAL_LLM_ENDPOINT")
        .unwrap_or_else(|_| "https://llm.chutes.ai/v1/chat/completions".to_string());
    
    let token = std::env::var("CHUTES_API_TOKEN")
        .or_else(|_| std::env::var("INTERNAL_LLM_TOKEN"))
        .map_err(|_| "No API token configured (CHUTES_API_TOKEN or INTERNAL_LLM_TOKEN)".to_string())?;
    
    log::info!("Checking LLM connectivity at: {}", endpoint);
    
    // Create a simple health check request with timeout
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    // Try a minimal request to check connectivity
    let test_payload = serde_json::json!({
        "model": "moonshotai/Kimi-K2-Thinking",
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 5
    });
    
    let result = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&test_payload)
        .send()
        .await;
    
    match result {
        Ok(response) => {
            if response.status().is_success() {
                log::info!("LLM health check passed");
                Ok(format!("LLM API is accessible at {}", endpoint))
            } else {
                let status = response.status();
                let error_text = response.text().await.unwrap_or_default();
                log::warn!("LLM health check failed with status {}: {}", status, error_text);
                Err(format!("LLM API returned status {}: {}", status, error_text))
            }
        }
        Err(e) => {
            log::warn!("LLM health check failed: {}", e);
            Err(format!("Failed to connect to LLM API: {}", e))
        }
    }
}

/// Check Qdrant connectivity
pub async fn check_qdrant_health() -> Result<String, String> {
    let qdrant_url = std::env::var("QDRANT_URL")
        .unwrap_or_else(|_| "http://localhost:6333".to_string());
    
    log::info!("Checking Qdrant connectivity at: {}", qdrant_url);
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let check_url = format!("{}/collections", qdrant_url);
    
    match client.get(&check_url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                log::info!("Qdrant health check passed");
                Ok(format!("Qdrant is accessible at {}", qdrant_url))
            } else {
                let msg = format!("Qdrant returned status {}", response.status());
                log::warn!("{}", msg);
                Err(msg)
            }
        }
        Err(e) => {
            let msg = format!("Failed to connect to Qdrant: {}", e);
            log::warn!("{}", msg);
            Err(msg)
        }
    }
}

/// Initialize all dependencies
pub async fn initialize_dependencies() -> StartupStatus {
    log::info!("Initializing IDE dependencies...");
    
    // Start Qdrant
    let qdrant_start_result = start_qdrant();
    let qdrant_message = match &qdrant_start_result {
        Ok(msg) => msg.clone(),
        Err(err) => {
            log::warn!("Qdrant startup: {}", err);
            err.clone()
        }
    };
    
    // Wait a bit for Qdrant to fully start
    if qdrant_start_result.is_ok() {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }
    
    // Check Qdrant health
    let qdrant_running = match check_qdrant_health().await {
        Ok(msg) => {
            log::info!("{}", msg);
            true
        }
        Err(err) => {
            log::warn!("Qdrant health check failed: {}", err);
            false
        }
    };
    
    // Check LLM connectivity
    let (llm_available, llm_message) = match check_llm_health().await {
        Ok(msg) => {
            log::info!("{}", msg);
            (true, msg)
        }
        Err(err) => {
            log::warn!("LLM health check failed: {}", err);
            (false, err)
        }
    };
    
    let status = StartupStatus {
        qdrant_running,
        qdrant_message,
        llm_available,
        llm_message,
    };
    
    log::info!(
        "Dependency initialization complete - Qdrant: {}, LLM: {}",
        status.qdrant_running,
        status.llm_available
    );
    
    status
}

/// Tauri command to manually restart Qdrant
#[tauri::command]
pub async fn restart_qdrant() -> Result<String, String> {
    log::info!("Manual Qdrant restart requested");
    
    // Stop existing process (best effort)
    #[cfg(unix)]
    {
        let _ = Command::new("pkill")
            .arg("-f")
            .arg("qdrant")
            .status();
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    
    // Start Qdrant
    start_qdrant()
}
