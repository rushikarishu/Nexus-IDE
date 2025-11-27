use ai_core::compass::{CompassAgent, CompassConfig};
use ai_core::manager::SessionManager;
use ai_core::router::ProviderRouter;
use ai_core::tools::ToolRegistry;
use ai_core::rag::{NoOpContextStore, ChutesEmbeddingProvider};
use ai_core::audit::NoOpLogger;
use std::sync::Arc;
use std::sync::RwLock;

#[tokio::test]
async fn test_compass_iteration_1_calculator() {
    // 0. Load Environment Variables & Logger
    dotenv::dotenv().ok();
    let _ = env_logger::builder().is_test(true).try_init();
    
    // 1. Setup Environment
    let temp_dir = tempfile::TempDir::new().unwrap();
    let root = temp_dir.path().to_string_lossy().to_string();
    
    // 2. Setup Dependencies
    // Use AsyncAuditLogger to capture agent behavior
    let log_path = std::path::PathBuf::from("compass_evaluation.jsonl");
    // Remove old log if exists
    if log_path.exists() {
        std::fs::remove_file(&log_path).unwrap();
    }
    let audit_logger: Arc<dyn ai_core::audit::AuditLogger> = Arc::new(ai_core::audit::AsyncAuditLogger::new(log_path).unwrap());
    let session_manager = Arc::new(SessionManager::new(audit_logger.clone()));
    
    // We need a provider.
    let session_config = ai_core::session::SessionConfig {
        mode: "beastup".to_string(),
        provider: "internal".to_string(),
        model: Some("Qwen/Qwen2.5-72B-Instruct".to_string()),
        version: Some("1.0".to_string()),
    };
    
    let provider = session_manager.router.get_provider(&session_config).expect("Failed to get provider");

    // 3. Setup Tools
    let mut tool_registry = ToolRegistry::new();
    tool_registry.register(Box::new(ai_core::tools::ReadFileTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::WriteFileTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::ListDirTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::RunCommandTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::SearchFilesTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::SequentialThinkingTool::new()));
    let tool_registry = Arc::new(tool_registry);

    // 4. Setup RAG (Mock/NoOp for now to focus on core logic)
    let context_store = Arc::new(NoOpContextStore);
    let embedding_provider = Arc::new(ChutesEmbeddingProvider::new("dummy_token".to_string()));

    // 5. Setup Agent
    let config = CompassConfig {
        max_turns: 15, // Give it enough turns
        main_agent_model: "Qwen/Qwen2.5-72B-Instruct".to_string(),
        meta_thinker_model: "Qwen/Qwen2.5-72B-Instruct".to_string(),
        context_manager_model: "Qwen/Qwen2.5-72B-Instruct".to_string(),
        session_id: "test-session-1".to_string(),
        qdrant_url: "http://localhost:6333".to_string(),
        qdrant_collection: "test".to_string(),
        qdrant_api_key: None,
        chutes_api_token: "dummy".to_string(),
    };

    let mut agent = CompassAgent::new(
        config,
        provider,
        tool_registry,
        context_store,
        embedding_provider,
        audit_logger,
    );

    // 6. Define Task
    let task = "Create a Python calculator CLI (calculator.py) that supports add, subtract, multiply, and divide. 
    It should take arguments like: python calculator.py add 5 3. 
    You MUST write a test script (test_calculator.py) and run it to verify functionality.
    Ensure you handle division by zero.";

    // 7. Run
    println!("Starting Agent Execution...");
    let result = agent.run(task.to_string(), None).await;

    // 8. Assertions
    match result {
        Ok(answer) => {
            println!("Agent Success: {}", answer);
            // Verify files exist
            let calc_path = temp_dir.path().join("calculator.py");
            let test_path = temp_dir.path().join("test_calculator.py");
            
            assert!(calc_path.exists(), "calculator.py should exist");
            assert!(test_path.exists(), "test_calculator.py should exist");
            
            // Verify content
            let calc_content = std::fs::read_to_string(calc_path).unwrap();
            assert!(calc_content.contains("def add"), "Should contain add function");
            assert!(calc_content.contains("def divide"), "Should contain divide function");
        }
        Err(e) => {
            panic!("Agent Failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_compass_iteration_2_node_server() {
    // 0. Load Environment Variables & Logger
    dotenv::dotenv().ok();
    let _ = env_logger::builder().is_test(true).try_init();
    
    // 1. Setup Environment
    let temp_dir = tempfile::TempDir::new().unwrap();
    let root = temp_dir.path().to_string_lossy().to_string();
    
    // 2. Setup Dependencies
    // Use AsyncAuditLogger to capture agent behavior
    let log_path = std::path::PathBuf::from("compass_evaluation_iter2.jsonl");
    // Remove old log if exists
    if log_path.exists() {
        std::fs::remove_file(&log_path).unwrap();
    }
    let audit_logger: Arc<dyn ai_core::audit::AuditLogger> = Arc::new(ai_core::audit::AsyncAuditLogger::new(log_path).unwrap());
    let session_manager = Arc::new(SessionManager::new(audit_logger.clone()));
    
    // We need a provider.
    let session_config = ai_core::session::SessionConfig {
        mode: "beastup".to_string(),
        provider: "internal".to_string(),
        model: Some("Qwen/Qwen2.5-72B-Instruct".to_string()),
        version: Some("1.0".to_string()),
    };
    
    let provider = session_manager.router.get_provider(&session_config).expect("Failed to get provider");

    // 3. Setup Tools
    let mut tool_registry = ToolRegistry::new();
    tool_registry.register(Box::new(ai_core::tools::ReadFileTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::WriteFileTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::ListDirTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::RunCommandTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::SearchFilesTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::SequentialThinkingTool::new()));
    let tool_registry = Arc::new(tool_registry);

    // 4. Setup RAG (Mock/NoOp for now)
    let context_store = Arc::new(NoOpContextStore);
    let embedding_provider = Arc::new(ChutesEmbeddingProvider::new("dummy_token".to_string()));

    // 5. Setup Agent
    let config = CompassConfig {
        max_turns: 30, // More turns for npm install etc.
        main_agent_model: "Qwen/Qwen2.5-72B-Instruct".to_string(),
        meta_thinker_model: "Qwen/Qwen2.5-72B-Instruct".to_string(),
        context_manager_model: "Qwen/Qwen2.5-72B-Instruct".to_string(),
        session_id: "test-session-2".to_string(),
        qdrant_url: "http://localhost:6333".to_string(),
        qdrant_collection: "test".to_string(),
        qdrant_api_key: None,
        chutes_api_token: "dummy".to_string(),
    };

    let mut agent = CompassAgent::new(
        config,
        provider,
        tool_registry,
        context_store,
        embedding_provider,
        audit_logger,
    );

    // 6. Define Task
    let task = "Create a simple Node.js Express server (server.js).
    It should have two endpoints:
    1. GET /health - returns JSON { \"status\": \"ok\" }
    2. POST /echo - returns the JSON body sent to it.
    
    You MUST:
    1. Create package.json with necessary dependencies (express).
    2. Install dependencies using npm.
    3. Create the server file.
    4. Create a test script (test_server.js) using 'node' built-in assert or a simple script to verify the endpoints work.
    5. Run the tests to verify functionality.
    
    IMPORTANT: 
    - Ensure `server.js` exports the app (`module.exports = app;`).
    - ONLY listen on a port if the file is run directly (check `if (require.main === module)`).
    - This ensures `test_server.js` can import the app without starting a persistent server process that hangs the test.
    
    Ensure the server runs on port 3000 when executed directly.";

    // 7. Run
    println!("Starting Agent Execution (Iteration 2)...");
    let result = agent.run(task.to_string(), None).await;

    // 8. Assertions
    match result {
        Ok(answer) => {
            println!("Agent Success: {}", answer);
            // Verify files exist
            let server_path = temp_dir.path().join("server.js");
            let package_path = temp_dir.path().join("package.json");
            let test_path = temp_dir.path().join("test_server.js");
            
            assert!(server_path.exists(), "server.js should exist");
            assert!(package_path.exists(), "package.json should exist");
            assert!(test_path.exists(), "test_server.js should exist");
            
            // Verify content
            let package_content = std::fs::read_to_string(package_path).unwrap();
            assert!(package_content.contains("express"), "package.json should contain express");
            
            let server_content = std::fs::read_to_string(server_path).unwrap();
            assert!(server_content.contains("/health"), "server.js should have /health endpoint");
            assert!(server_content.contains("/echo"), "server.js should have /echo endpoint");
        }
        Err(e) => {
            panic!("Agent Failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_compass_iteration_3_sqlite_api() {
    // 0. Load Environment Variables & Logger
    dotenv::dotenv().ok();
    let _ = env_logger::builder().is_test(true).try_init();
    
    // 1. Setup Environment
    let temp_dir = tempfile::TempDir::new().unwrap();
    let root = temp_dir.path().to_string_lossy().to_string();
    
    // 2. Setup Dependencies
    let log_path = std::path::PathBuf::from("compass_evaluation_iter3.jsonl");
    if log_path.exists() {
        std::fs::remove_file(&log_path).unwrap();
    }
    let audit_logger: Arc<dyn ai_core::audit::AuditLogger> = Arc::new(ai_core::audit::AsyncAuditLogger::new(log_path).unwrap());
    let session_manager = Arc::new(SessionManager::new(audit_logger.clone()));
    
    let session_config = ai_core::session::SessionConfig {
        mode: "beastup".to_string(),
        provider: "internal".to_string(),
        model: Some("Qwen/Qwen2.5-72B-Instruct".to_string()),
        version: Some("1.0".to_string()),
    };
    
    let provider = session_manager.router.get_provider(&session_config).expect("Failed to get provider");
    let provider = Arc::new(ProxyProvider {
        inner: provider,
        override_model: "Qwen/Qwen2.5-72B-Instruct".to_string(),
    });

    // 3. Setup Tools
    let mut tool_registry = ToolRegistry::new();
    tool_registry.register(Box::new(ai_core::tools::ReadFileTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::WriteFileTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::ListDirTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::RunCommandTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::SearchFilesTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::SequentialThinkingTool::new()));
    let tool_registry = Arc::new(tool_registry);

    // 4. Setup RAG (Mock/NoOp for now)
    let context_store = Arc::new(NoOpContextStore);
    let embedding_provider = Arc::new(ChutesEmbeddingProvider::new("dummy_token".to_string()));

    // 5. Setup Agent
    let config = CompassConfig {
        max_turns: 30,
        main_agent_model: "Qwen/Qwen2.5-72B-Instruct".to_string(),
        meta_thinker_model: "Qwen/Qwen2.5-72B-Instruct".to_string(),
        context_manager_model: "Qwen/Qwen2.5-72B-Instruct".to_string(),
        session_id: "test-session-3".to_string(),
        qdrant_url: "http://localhost:6333".to_string(),
        qdrant_collection: "test".to_string(),
        qdrant_api_key: None,
        chutes_api_token: "dummy".to_string(),
    };

    let mut agent = CompassAgent::new(
        config,
        provider,
        tool_registry,
        context_store,
        embedding_provider,
        audit_logger,
    );

    // 6. Define Task
    let task = "Create a Task Management REST API using Node.js, Express, and SQLite.
    
    Files to create:
    1. `package.json`: Dependencies (`express`, `sqlite3`, `mocha`, `chai`, `supertest`).
    2. `server.js`:
       - Initialize SQLite database `tasks.db`.
       - Create table `tasks` (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, status TEXT DEFAULT 'pending').
       - Endpoints:
         - POST /tasks: Create task (body: { title }). Returns created task.
         - GET /tasks: List all tasks. Returns array of tasks.
         - PUT /tasks/:id: Update task status (body: { status }). Returns updated task.
         - DELETE /tasks/:id: Delete task. Returns 204 or 200.
       - Export app (`module.exports = app;`).
       - IMPORTANT: Listen on port 3000 ONLY if run directly (`if (require.main === module)`).
    3. `test_api.js`: Integration tests using `mocha`, `chai`, `supertest`.
       - Test the full lifecycle: Create -> List -> Update -> Delete.
       - Verify that data is actually persisted (e.g., Create, then List to see it).

    You MUST:
    1. Initialize project and install dependencies.
    2. Create the server and database logic.
    3. Create and run the tests to verify functionality.";

    // 7. Run
    println!("Starting Agent Execution (Iteration 3)...");
    let result = agent.run(task.to_string(), None).await;

    // 8. Assertions
    match result {
        Ok(answer) => {
            println!("Agent Success: {}", answer);
            // Verify files exist
            let server_path = temp_dir.path().join("server.js");
            let package_path = temp_dir.path().join("package.json");
            let test_path = temp_dir.path().join("test_api.js");
            
            assert!(server_path.exists(), "server.js should exist");
            assert!(package_path.exists(), "package.json should exist");
            assert!(test_path.exists(), "test_api.js should exist");
            
            // Verify content
            let package_content = std::fs::read_to_string(package_path).unwrap();
            assert!(package_content.contains("sqlite3"), "package.json should contain sqlite3");
            
            let server_content = std::fs::read_to_string(server_path).unwrap();
            assert!(server_content.contains("CREATE TABLE"), "server.js should create table");
            assert!(server_content.contains("INSERT INTO"), "server.js should have insert logic");
        }
        Err(e) => {
            panic!("Agent Failed: {}", e);
        }
    }
}
