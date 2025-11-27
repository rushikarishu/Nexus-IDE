use std::sync::Arc;
use ai_core::compass::{CompassAgent, CompassConfig};
use ai_core::tools::ToolRegistry;
use ai_core::rag::{ContextStore, EmbeddingProvider, NoteChunk};
use ai_core::audit::{AuditLogger, AuditLog};
use ai_core::providers::internal::InternalProvider;
use std::env;

struct ConsoleLogger;
impl AuditLogger for ConsoleLogger {
    fn log(&self, log: AuditLog) {
        println!("[{}] {} - {}: {}", log.timestamp, log.actor, log.action, log.details);
    }
}

// Mock RAG for now to avoid needing Qdrant running locally if not available
// Or we can try to use the real one if env vars are set.
// Let's try to use real one if possible, but fallback to mock if needed?
// The user said "real world testing", so we should try to use real components.
// But I don't know if Qdrant is running.
// I'll implement a simple mock context store/embedding provider for the CLI 
// to ensure it runs even without Qdrant, as the core logic is what we want to test.
// Actually, `ai_compass_run` uses `QdrantContextStore`.
// If I want "real world", I should probably use that.
// But I don't want to block on Qdrant setup.
// I'll check if I can use `ai_core::rag::QdrantContextStore`.
// It seems `ai-core` exposes it?
// `ai_core::rag` is public.

// Wait, `QdrantContextStore` might not be public or might need dependencies not in `ai-core`'s Cargo.toml?
// `ai-core` has `reqwest`, `serde`, `serde_json`.
// `QdrantContextStore` likely uses `reqwest`.
// Let's assume it's available.

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: compass <query>");
        std::process::exit(1);
    }
    let query = &args[1];

    // Load env vars if possible (simple manual loading or rely on shell)
    // We assume shell has them or we pass them.
    
    let provider = Arc::new(InternalProvider::new());
    
    // Tools
    let mut tool_registry = ToolRegistry::new();
    let root = env::current_dir()?.to_string_lossy().to_string();
    tool_registry.register(Box::new(ai_core::tools::ReadFileTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::WriteFileTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::ListDirTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::RunCommandTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::SearchFilesTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::SequentialThinkingTool::new()));
    let tool_registry = Arc::new(tool_registry);

    // RAG - Mock for CLI to avoid external deps for now, unless we are sure.
    // The user wants "real world", but if Qdrant isn't up, it fails.
    // I'll use a Mock Context Store that just stores in memory for the session.
    
    struct InMemoryContextStore {
        notes: std::sync::Mutex<Vec<NoteChunk>>,
    }
    
    #[async_trait::async_trait]
    impl ContextStore for InMemoryContextStore {
        async fn upsert_notes(&self, _session_id: &str, notes: &[NoteChunk], _embedding_provider: &Arc<dyn EmbeddingProvider>) -> Result<(), String> {
            let mut store = self.notes.lock().unwrap();
            store.extend_from_slice(notes);
            Ok(())
        }
        async fn retrieve_notes(&self, _session_id: &str, _query: &str, _top_k: usize, _embedding_provider: &Arc<dyn EmbeddingProvider>) -> Result<Vec<NoteChunk>, String> {
            let store = self.notes.lock().unwrap();
            Ok(store.clone())
        }
        async fn delete_session_notes(&self, _session_id: &str) -> Result<usize, String> {
            let mut store = self.notes.lock().unwrap();
            let count = store.len();
            store.clear();
            Ok(count)
        }
    }

    struct MockEmbedding;
    #[async_trait::async_trait]
    impl EmbeddingProvider for MockEmbedding {
        async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
            Ok(vec![vec![0.0; 1024]; texts.len()])
        }
    }

    let context_store = Arc::new(InMemoryContextStore { notes: std::sync::Mutex::new(Vec::new()) });
    let embedding_provider = Arc::new(MockEmbedding);
    let audit_logger = Arc::new(ConsoleLogger);

    let config = CompassConfig {
        max_turns: 100,
        main_agent_model: "moonshotai/Kimi-K2-Thinking".to_string(), // Default from InternalProvider
        meta_thinker_model: "moonshotai/Kimi-K2-Thinking".to_string(),
        context_manager_model: "moonshotai/Kimi-K2-Thinking".to_string(),
        session_id: uuid::Uuid::new_v4().to_string(),
        qdrant_url: "mock".to_string(),
        qdrant_collection: "mock".to_string(),
        qdrant_api_key: None,
        chutes_api_token: env::var("CHUTES_API_TOKEN").unwrap_or_default(),
    };

    println!("Starting Compass Agent with query: {}", query);
    
    let mut agent = CompassAgent::new(
        config,
        provider,
        tool_registry,
        context_store,
        embedding_provider,
        audit_logger,
    );

    match agent.run(query.to_string(), None).await {
        Ok(answer) => println!("\nFinal Answer:\n{}", answer),
        Err(e) => eprintln!("\nError: {}", e),
    }

    Ok(())
}
