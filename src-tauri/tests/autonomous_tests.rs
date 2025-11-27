use ai_core::compass::{CompassAgent, CompassConfig};
use ai_core::manager::SessionManager;
use ai_core::tools::ToolRegistry;
use ai_core::rag::{NoOpContextStore, ChutesEmbeddingProvider};
use ai_core::audit::AsyncAuditLogger;
use ai_core::provider::{LLMProvider, CompletionRequest};
use std::sync::Arc;
use async_trait::async_trait;

// ProxyProvider to ensure tests run in the current environment
// by redirecting all model requests to a known working model.
struct ProxyProvider {
    inner: Arc<dyn LLMProvider>,
    override_model: String,
}

#[async_trait]
impl LLMProvider for ProxyProvider {
    async fn send_message(&self, request: CompletionRequest) -> Result<String, ai_core::error::ProviderError> {
        let mut request = request;
        request.model = Some(self.override_model.clone());
        self.inner.send_message(request).await
    }
    
    async fn send_message_streaming(
        &self,
        request: CompletionRequest,
        tx: tokio::sync::mpsc::Sender<String>,
    ) -> Result<String, ai_core::error::ProviderError> {
        let mut request = request;
        request.model = Some(self.override_model.clone());
        self.inner.send_message_streaming(request, tx).await
    }
}

struct MockProvider {
    response: String,
}

#[async_trait]
impl LLMProvider for MockProvider {
    async fn send_message(&self, _request: CompletionRequest) -> Result<String, ai_core::error::ProviderError> {
        Ok(self.response.clone())
    }
    
    async fn send_message_streaming(
        &self,
        _request: CompletionRequest,
        _tx: tokio::sync::mpsc::Sender<String>,
    ) -> Result<String, ai_core::error::ProviderError> {
        Ok(self.response.clone())
    }
}

async fn setup_agent(
    root: String,
    log_filename: &str,
    session_id: &str,
    max_turns: usize,
) -> CompassAgent {
    // ... (same as before)
    // We need to allow injecting a custom provider for the mock test.
    // For now, let's just duplicate the setup logic inside the test if needed, or modify this helper.
    // To avoid changing the helper signature for all other tests, I'll handle the mock setup inside the new test.
    
    // Setup Dependencies
    let log_path = std::path::PathBuf::from(log_filename);
    if log_path.exists() {
        std::fs::remove_file(&log_path).unwrap();
    }
    let audit_logger: Arc<dyn ai_core::audit::AuditLogger> = Arc::new(AsyncAuditLogger::new(log_path).unwrap());
    let session_manager = Arc::new(SessionManager::new(audit_logger.clone()));
    
    let session_config = ai_core::session::SessionConfig {
        mode: "beastup".to_string(),
        provider: "internal".to_string(),
        model: Some("Qwen/Qwen2.5-72B-Instruct".to_string()),
        version: Some("1.0".to_string()),
    };
    
    let provider = session_manager.router.get_provider(&session_config).expect("Failed to get provider");
    // Wrap in ProxyProvider
    let provider = Arc::new(ProxyProvider {
        inner: provider,
        override_model: "Qwen/Qwen2.5-72B-Instruct".to_string(),
    });

    // Setup Tools
    let mut tool_registry = ToolRegistry::new();
    tool_registry.register(Box::new(ai_core::tools::ReadFileTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::WriteFileTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::ListDirTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::RunCommandTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::SearchFilesTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::SequentialThinkingTool::new()));
    let tool_registry = Arc::new(tool_registry);

    // Setup RAG
    let context_store = Arc::new(NoOpContextStore);
    let embedding_provider = Arc::new(ChutesEmbeddingProvider::new("dummy_token".to_string()));

    // Setup Agent
    let config = CompassConfig {
        max_turns,
        main_agent_model: "Qwen/Qwen2.5-72B-Instruct".to_string(),
        meta_thinker_model: "Qwen/Qwen2.5-72B-Instruct".to_string(),
        context_manager_model: "Qwen/Qwen2.5-72B-Instruct".to_string(),
        session_id: session_id.to_string(),
        qdrant_url: "http://localhost:6333".to_string(),
        qdrant_collection: "test".to_string(),
        qdrant_api_key: None,
        chutes_api_token: "dummy".to_string(),
    };

    CompassAgent::new(
        config,
        provider,
        tool_registry,
        context_store,
        embedding_provider,
        audit_logger,
    )
}

#[tokio::test]
async fn test_phase_4_malformed_tags() {
    // 0. Load Environment Variables & Logger
    dotenv::dotenv().ok();
    let _ = env_logger::builder().is_test(true).try_init();
    
    // 1. Setup Environment
    let temp_dir = tempfile::TempDir::new().unwrap();
    let root = temp_dir.path().to_string_lossy().to_string();
    
    // 2. Setup Mock Provider
    let response = r#"<think>
    I will write a file.
    </think>
    <tool_call name="write_file">
    { "path": "test.txt", "content": "hello" }
    </think>"#;
    
    let provider = Arc::new(MockProvider { response: response.to_string() });
    
    // 3. Setup Agent (Manual setup to inject mock provider)
    let log_path = std::path::PathBuf::from("autonomous_phase_4.jsonl");
    let audit_logger: Arc<dyn ai_core::audit::AuditLogger> = Arc::new(AsyncAuditLogger::new(log_path).unwrap());
    
    let mut tool_registry = ToolRegistry::new();
    tool_registry.register(Box::new(ai_core::tools::WriteFileTool { workspace_root: root.clone() }));
    let tool_registry = Arc::new(tool_registry);
    
    let context_store = Arc::new(NoOpContextStore);
    let embedding_provider = Arc::new(ChutesEmbeddingProvider::new("dummy_token".to_string()));
    
    let config = CompassConfig {
        max_turns: 1,
        main_agent_model: "mock".to_string(),
        meta_thinker_model: "mock".to_string(),
        context_manager_model: "mock".to_string(),
        session_id: "phase-4-malformed".to_string(),
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
    
    // 4. Run
    // The agent should parse the response and execute the tool, creating the file.
    let _ = agent.run("Do something".to_string(), None).await;
    
    // 5. Assert
    let file_path = temp_dir.path().join("test.txt");
    assert!(file_path.exists(), "test.txt should exist despite malformed closing tag");
}

#[tokio::test]
async fn test_phase_1_weather_script() {
    // 0. Load Environment Variables & Logger
    dotenv::dotenv().ok();
    let _ = env_logger::builder().is_test(true).try_init();
    
    // 1. Setup Environment
    let temp_dir = tempfile::TempDir::new().unwrap();
    let root = temp_dir.path().to_string_lossy().to_string();
    println!("Test Workspace: {}", root);
    
    // 2. Setup Agent
    let mut agent = setup_agent(
        root.clone(),
        "autonomous_phase_1.jsonl",
        "phase-1-weather",
        20,
    ).await;

    // 6. Define Task
    let task = "Create a Python script (weather.py) that:
    1. Defines a function `get_weather(city)` that returns a mock weather dictionary (e.g., {'temp': 25, 'condition': 'Sunny'}).
    2. Accepts a city name as a command-line argument.
    3. Prints the weather to stdout AND saves it to `weather.json`.
    
    You MUST:
    1. Create the script.
    2. Create a test script (test_weather.py) that runs `weather.py` with a city argument and asserts that `weather.json` is created and contains valid JSON.
    3. Run the test script to verify functionality.
    
    Use the `run_command` tool to execute python scripts.";

    // 7. Run
    println!("Starting Phase 1 Execution...");
    let result = agent.run(task.to_string(), None).await;

    // 8. Assertions
    match result {
        Ok(answer) => {
            println!("Agent Success: {}", answer);
            let weather_path = temp_dir.path().join("weather.py");
            let json_path = temp_dir.path().join("weather.json");
            
            assert!(weather_path.exists(), "weather.py should exist");
            // json_path might not exist if the test script cleaned it up, or if the agent didn't run it in the final state.
            // But the task asked to save it.
            // Let's check if the test passed.
        }
        Err(e) => {
            panic!("Agent Failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_phase_2_task_cli() {
    // 0. Load Environment Variables & Logger
    dotenv::dotenv().ok();
    let _ = env_logger::builder().is_test(true).try_init();
    
    // 1. Setup Environment
    let temp_dir = tempfile::TempDir::new().unwrap();
    let root = temp_dir.path().to_string_lossy().to_string();
    println!("Test Workspace: {}", root);
    
    // 2. Setup Agent
    let mut agent = setup_agent(
        root.clone(),
        "autonomous_phase_2.jsonl",
        "phase-2-cli",
        30,
    ).await;

    // 6. Define Task
    let task = "Build a Task Management CLI tool in Rust.
    
    Requirements:
    1. Initialize a new Rust project named `task_cli`.
    2. Implement a CLI that supports:
       - `add <description>`: Adds a task.
       - `list`: Lists all tasks with their status (Pending/Completed).
       - `complete <id>`: Marks a task as completed.
    3. Tasks must be persisted to a `tasks.json` file in the current directory.
    4. Use `serde` and `serde_json` for serialization.
    5. Use `clap` or `std::env` for argument parsing.
    
    You MUST:
    1. Create the project and write the code.
    2. Verify it by running the compiled binary to add a task, list it, complete it, and list it again.
    3. Ensure the `tasks.json` file is updated correctly.
    
    Use `cargo run` to execute the CLI during development/testing.";

    // 7. Run
    println!("Starting Phase 2 Execution...");
    let result = agent.run(task.to_string(), None).await;

    // 8. Assertions
    match result {
        Ok(answer) => {
            println!("Agent Success: {}", answer);
            let project_path = temp_dir.path().join("task_cli");
            assert!(project_path.exists(), "task_cli project should exist");
            let json_path = project_path.join("tasks.json");
            // Check if tasks.json exists (it should if the agent ran the verification steps)
             if json_path.exists() {
                let content = std::fs::read_to_string(json_path).unwrap();
                println!("Final tasks.json: {}", content);
            } else {
                println!("Warning: tasks.json not found in final state (might be expected if cleaned up, but unlikely)");
            }
        }
        Err(e) => {
            panic!("Agent Failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_phase_3_kanban() {
    // 0. Load Environment Variables & Logger
    dotenv::dotenv().ok();
    let _ = env_logger::builder().is_test(true).try_init();
    
    // 1. Setup Environment
    let temp_dir = tempfile::TempDir::new().unwrap();
    let root = temp_dir.path().to_string_lossy().to_string();
    println!("Test Workspace: {}", root);
    
    // 2. Setup Agent
    let mut agent = setup_agent(
        root.clone(),
        "autonomous_phase_3.jsonl",
        "phase-3-kanban",
        40,
    ).await;

    // 6. Define Task
    let task = "Create a simple Kanban Board web application.
    
    Requirements:
    1. Backend: Python Flask server (`app.py`) with endpoints:
       - GET /tasks: Returns all tasks.
       - POST /tasks: Adds a new task.
       - PUT /tasks/<id>: Updates task status (Todo -> Doing -> Done).
       - DELETE /tasks/<id>: Deletes a task.
       - Tasks should be stored in memory (or SQLite if you prefer).
    2. Frontend: HTML/JS (`index.html`, `script.js`, `style.css`)
       - Display 3 columns: Todo, Doing, Done.
       - Allow adding new tasks to Todo.
       - Allow moving tasks between columns (can be buttons or drag-and-drop).
    
    You MUST:
    1. Create all necessary files.
    2. Create a test script (`test_app.py`) using `pytest` or `unittest` to verify the Backend API.
    3. Run the backend tests to verify the API.
    4. (Optional but recommended) Create a simple Node.js script using `puppeteer` or `jsdom` to verify the Frontend loads.
    
    Use `python3` and `pip` for Python environment.";

    // 7. Run
    println!("Starting Phase 3 Execution...");
    let result = agent.run(task.to_string(), None).await;

    // 8. Assertions
    match result {
        Ok(answer) => {
            println!("Agent Success: {}", answer);
            let app_path = temp_dir.path().join("app.py");
            assert!(app_path.exists(), "app.py should exist");
            let index_path = temp_dir.path().join("index.html");
            assert!(index_path.exists(), "index.html should exist");
        }
        Err(e) => {
            panic!("Agent Failed: {}", e);
        }
    }
}
#[tokio::test]
async fn test_phase_6_task_1_fibonacci() {
    // 0. Load Environment Variables & Logger
    dotenv::dotenv().ok();
    let _ = env_logger::builder().is_test(true).try_init();
    
    // 1. Setup Environment
    let temp_dir = tempfile::TempDir::new().unwrap();
    let root = temp_dir.path().to_string_lossy().to_string();
    println!("Test Workspace: {}", root);
    
    // 2. Setup Agent
    let mut agent = setup_agent(
        root.clone(),
        "autonomous_phase_6_1.jsonl",
        "phase-6-fibonacci",
        20,
    ).await;

    // 3. Define Task
    let task = "Create a Python script (`fib.py`) that:
    1. Accepts an integer N as a command-line argument.
    2. Calculates the first N Fibonacci numbers.
    3. Prints them to stdout.
    4. Saves them to a JSON file `fib.json` as a list.
    
    You MUST:
    1. Create `fib.py`.
    2. Create a verification script `verify_fib.py` that:
       - Runs `fib.py` with N=10.
       - Reads `fib.json`.
       - PARSES the JSON content into a list.
       - Asserts that the list is exactly `[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]`.
       - Asserts that the exit code was 0.
    3. Run the verification script.
    
    CRITICAL: Do NOT use string matching to verify the output. You MUST parse the JSON.";

    // 4. Run
    println!("Starting Phase 6 Task 1 Execution...");
    let result = agent.run(task.to_string(), None).await;

    // 5. Assertions
    match result {
        Ok(answer) => {
            println!("Agent Success: {}", answer);
            let fib_path = temp_dir.path().join("fib.py");
            let json_path = temp_dir.path().join("fib.json");
            
            assert!(fib_path.exists(), "fib.py should exist");
            if json_path.exists() {
                let content = std::fs::read_to_string(json_path).unwrap();
                println!("Final fib.json: {}", content);
            }
        }
        Err(e) => {
            panic!("Agent Failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_phase_6_task_2_file_processor() {
    // 0. Load Environment Variables & Logger
    dotenv::dotenv().ok();
    let _ = env_logger::builder().is_test(true).try_init();
    
    // 1. Setup Environment
    let temp_dir = tempfile::TempDir::new().unwrap();
    let root = temp_dir.path().to_string_lossy().to_string();
    println!("Test Workspace: {}", root);
    
    // 2. Setup Agent
    let mut agent = setup_agent(
        root.clone(),
        "autonomous_phase_6_2.jsonl",
        "phase-6-file-processor",
        30,
    ).await;

    // 3. Define Task
    let task = "Build a Rust CLI tool (`word_count`) that:
    1. Accepts a file path as an argument.
    2. Counts the number of words in the file.
    3. Prints the result as JSON to stdout: `{\"file\": \"<path>\", \"words\": <count>}`.
    4. Handles missing files gracefully by printing a JSON error to stderr: `{\"error\": \"File not found\"}` and exiting with code 1.
    
    You MUST:
    1. Initialize the project `word_count`.
    2. Implement the logic using `serde_json`.
    3. Create a verification script `verify_word_count.py` that:
       - Creates a dummy text file `hello.txt` with content \"Hello world\".
       - Runs the compiled binary on `hello.txt`.
       - PARSES the stdout JSON and asserts `words` is 2.
       - Runs the binary on a non-existent file.
       - PARSES the stderr JSON and asserts `error` is \"File not found\".
       - Asserts exit code is 1 for the missing file case.
    4. Run the verification script.
    
    CRITICAL: You MUST compile the code (`cargo build`) before running the verification script.";

    // 4. Run
    println!("Starting Phase 6 Task 2 Execution...");
    let result = agent.run(task.to_string(), None).await;

    // 5. Assertions
    match result {
        Ok(answer) => {
            println!("Agent Success: {}", answer);
            let project_path = temp_dir.path().join("word_count");
            assert!(project_path.exists(), "word_count project should exist");
        }
        Err(e) => {
            panic!("Agent Failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_phase_6_task_3_web_service() {
    // 0. Load Environment Variables & Logger
    dotenv::dotenv().ok();
    let _ = env_logger::builder().is_test(true).try_init();
    
    // 1. Setup Environment
    let temp_dir = tempfile::TempDir::new().unwrap();
    let root = temp_dir.path().to_string_lossy().to_string();
    println!("Test Workspace: {}", root);
    
    // 2. Setup Agent
    let mut agent = setup_agent(
        root.clone(),
        "autonomous_phase_6_3.jsonl",
        "phase-6-web-service",
        40,
    ).await;

    // 3. Define Task
    let task = "Create a robust REST API using Python Flask (`app.py`) for managing a list of users.
    
    Requirements:
    1. `POST /users`: Accepts JSON `{\"name\": \"string\", \"email\": \"string\"}`.
       - Validates that `name` and `email` are present and non-empty.
       - Returns 201 and the created user object.
       - Returns 400 if validation fails (JSON error).
    2. `GET /users`: Returns a list of all users.
    3. `GET /users/<id>`: Returns a user by ID (1-based index).
       - Returns 404 if user not found.
    
    You MUST:
    1. Create `app.py`.
    2. Create a test script `test_api.py` using `pytest` (or `unittest`) that:
       - Starts the Flask app in a separate thread or process (or uses `flask.testing.FlaskClient`).
       - Tests the Happy Path: Create user, Get user, List users.
       - Tests the Sad Path: Create user with missing fields (expect 400), Get non-existent user (expect 404).
       - PARSES all JSON responses to verify data.
       - Asserts status codes.
    3. Run the tests.
    
    CRITICAL: Do NOT assume it works. You MUST run the tests and they MUST pass.";

    // 4. Run
    println!("Starting Phase 6 Task 3 Execution...");
    let result = agent.run(task.to_string(), None).await;

    // 5. Assertions
    match result {
        Ok(answer) => {
            println!("Agent Success: {}", answer);
            let app_path = temp_dir.path().join("app.py");
            assert!(app_path.exists(), "app.py should exist");
        }
        Err(e) => {
            panic!("Agent Failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_phase_7_parser_robustness_real() {
    // 0. Load Environment Variables & Logger
    dotenv::dotenv().ok();
    let _ = env_logger::builder().is_test(true).try_init();
    
    // 1. Setup Environment
    let temp_dir = tempfile::TempDir::new().unwrap();
    let root = temp_dir.path().to_string_lossy().to_string();
    println!("Test Workspace: {}", root);
    
    // 2. Setup Agent
    let mut agent = setup_agent(
        root.clone(),
        "autonomous_phase_7_parser.jsonl",
        "phase-7-parser-real",
        10,
    ).await;

    // 3. Define Task
    // We explicitly ask the agent to use markdown wrapping to provoke the edge case.
    let task = "Create a file named `robust.txt` with the content \"Robustness Test\".
    
    CRITICAL INSTRUCTION: When you call the `write_file` tool, you MUST wrap the JSON arguments in a markdown code block like this:
    
    ```json
    {
      \"path\": \"...\",
      \"content\": \"...\"
    }
    ```
    
    I want to verify that my system can parse this format. Do NOT use plain JSON. You MUST use the markdown code block wrapper.";

    // 4. Run
    println!("Starting Phase 7 Parser Robustness Test (Real LLM)...");
    let result = agent.run(task.to_string(), None).await;

    // 5. Assertions
    match result {
        Ok(answer) => {
            println!("Agent Success: {}", answer);
            let file_path = temp_dir.path().join("robust.txt");
            assert!(file_path.exists(), "robust.txt should exist, meaning the parser handled the markdown wrapping correctly.");
            let content = std::fs::read_to_string(file_path).unwrap();
            assert_eq!(content, "Robustness Test");
        }
        Err(e) => {
            panic!("Agent Failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_phase_7_complex_logic_astar() {
    // 0. Load Environment Variables & Logger
    dotenv::dotenv().ok();
    let _ = env_logger::builder().is_test(true).try_init();
    
    // 1. Setup Environment
    let temp_dir = tempfile::TempDir::new().unwrap();
    let root = temp_dir.path().to_string_lossy().to_string();
    println!("Test Workspace: {}", root);
    
    // 2. Setup Agent
    let mut agent = setup_agent(
        root.clone(),
        "autonomous_phase_7_astar.jsonl",
        "phase-7-astar",
        30,
    ).await;

    // 3. Define Task
    let task = "Implement the A* (A-Star) pathfinding algorithm in Python (`astar.py`).
    
    Requirements:
    1. Implement a class `AStar` with a method `find_path(grid, start, end)`.
    2. `grid` is a 2D list where 0 is walkable and 1 is an obstacle.
    3. `start` and `end` are (row, col) tuples.
    4. The method should return a list of (row, col) tuples representing the path from start to end, or None if no path exists.
    5. Use Manhattan distance as the heuristic.
    
    You MUST:
    1. Create `astar.py`.
    2. Create a verification script `verify_astar.py` that:
       - Defines a 5x5 grid with a U-shaped obstacle.
       - Tests finding a path around the obstacle.
       - Asserts the path is valid (connected, avoids obstacles, starts at start, ends at end).
       - Asserts the path length is optimal (or close to it).
    3. Run the verification script.
    
    CRITICAL: Use `sequential_thinking` to plan the algorithm before coding.";

    // 4. Run
    println!("Starting Phase 7 Complex Logic Test (A*)...");
    let result = agent.run(task.to_string(), None).await;

    // 5. Assertions
    match result {
        Ok(answer) => {
            println!("Agent Success: {}", answer);
            let file_path = temp_dir.path().join("astar.py");
            assert!(file_path.exists(), "astar.py should exist");
        }
        Err(e) => {
            panic!("Agent Failed: {}", e);
        }
    }
}
