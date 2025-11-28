use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use reqwest::Client;
use serde_json::json;
use uuid::Uuid;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::num::NonZeroUsize;
use lru::LruCache;
use crate::utils::SecretString;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteChunk {
    pub text: String,
    pub turn: usize,
    pub source: String, // "note" or "history"
    pub score: f32,
}

#[async_trait]
pub trait ContextStore: Send + Sync {
    async fn upsert_notes(&self, session_id: &str, notes: &[NoteChunk], embedding_provider: &Arc<dyn EmbeddingProvider>) -> Result<(), String>;
    async fn retrieve_notes(&self, session_id: &str, query: &str, top_k: usize, embedding_provider: &Arc<dyn EmbeddingProvider>) -> Result<Vec<NoteChunk>, String>;
    /// Delete all notes for a session (cleanup)
    async fn delete_session_notes(&self, session_id: &str) -> Result<usize, String>;
}

#[async_trait]
pub trait EmbeddingProvider: Send + Sync {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, String>;
}

pub struct ChutesEmbeddingProvider {
    client: Client,
    api_token: SecretString,

}

impl ChutesEmbeddingProvider {
    pub fn new(api_token: String) -> Self {
        Self {
            client: Client::new(),
            api_token: SecretString::new(api_token),

        }
    }
}

#[async_trait]
impl EmbeddingProvider for ChutesEmbeddingProvider {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
        let url = "https://chutes-qwen-qwen3-embedding-8b.chutes.ai/v1/embeddings";
        
        // Batch all texts into a single request
        let response = self.client.post(url)
            .header("Authorization", format!("Bearer {}", self.api_token.expose_secret()))
            .json(&json!({
                "input": texts,
                "model": null
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            return Err(format!("Embedding API error: {}", response.status()));
        }

        let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        
        // Parse embeddings in order
        if let Some(data_array) = body.get("data").and_then(|d| d.as_array()) {
            let mut embeddings = Vec::new();
            for data_item in data_array {
                if let Some(embedding) = data_item.get("embedding").and_then(|e| serde_json::from_value(e.clone()).ok()) {
                    embeddings.push(embedding);
                } else {
                    return Err("Failed to parse embedding from response".to_string());
                }
            }
            Ok(embeddings)
        } else {
            Err("Invalid response format from embedding API".to_string())
        }
    }
}

pub struct QdrantContextStore {
    client: Client,
    url: String,
    collection: String,
    api_key: Option<SecretString>,
    collection_ensured: Arc<AtomicBool>,
    query_cache: Arc<Mutex<LruCache<String, Vec<f32>>>>,
}

impl QdrantContextStore {
    pub fn new(url: String, collection: String, api_key: Option<String>) -> Self {
        Self {
            client: Client::new(),
            url,
            collection,
            api_key: api_key.map(SecretString::new),
            collection_ensured: Arc::new(AtomicBool::new(false)),
            query_cache: Arc::new(Mutex::new(LruCache::new(NonZeroUsize::new(100).unwrap()))),
        }
    }

    async fn ensure_collection(&self, vector_size: usize) -> Result<(), String> {
        // Check cache first
        if self.collection_ensured.load(Ordering::Acquire) {
            return Ok(());
        }
        
        let url = format!("{}/collections/{}", self.url, self.collection);
        let mut request = self.client.get(&url);
        if let Some(key) = &self.api_key {
            request = request.header("api-key", key.expose_secret());
        }
        
        let response = request.send().await.map_err(|e| e.to_string())?;
        
        if response.status().as_u16() == 404 {
            // Create collection
            let create_url = format!("{}/collections/{}", self.url, self.collection);
            let mut create_request = self.client.put(&create_url);
            if let Some(key) = &self.api_key {
                create_request = create_request.header("api-key", key.expose_secret());
            }
            
            create_request.json(&json!({
                "vectors": {
                    "size": vector_size,
                    "distance": "Cosine"
                },
                "hnsw_config": {
                    "m": 16,
                    "ef_construct": 100
                }
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

            // Create payload index for session_id
            let index_url = format!("{}/collections/{}/index", self.url, self.collection);
            let mut index_request = self.client.put(&index_url);
            if let Some(key) = &self.api_key {
                index_request = index_request.header("api-key", key.expose_secret());
            }
            
            index_request.json(&json!({
                "field_name": "session_id",
                "field_schema": "keyword"
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        }
        
        // Mark as ensured (cache)
        self.collection_ensured.store(true, Ordering::Release);
        Ok(())
    }
}

#[async_trait]
impl ContextStore for QdrantContextStore {
    async fn upsert_notes(&self, session_id: &str, notes: &[NoteChunk], embedding_provider: &Arc<dyn EmbeddingProvider>) -> Result<(), String> {
        if notes.is_empty() {
            return Ok(());
        }

        let texts: Vec<String> = notes.iter().map(|n| n.text.clone()).collect();
        let embeddings = embedding_provider.embed(&texts).await?;

        // Ensure collection exists (cached after first call)
        if let Some(first) = embeddings.first() {
             self.ensure_collection(first.len()).await?;
        }

        let upsert_url = format!("{}/collections/{}/points", self.url, self.collection);
        let mut points = Vec::new();

        for (i, note) in notes.iter().enumerate() {
            points.push(json!({
                "id": Uuid::new_v4().to_string(),
                "vector": embeddings[i],
                "payload": {
                    "session_id": session_id,
                    "text": note.text,
                    "turn": note.turn,
                    "source": note.source
                }
            }));
        }

        let mut request = self.client.put(&upsert_url);
        if let Some(key) = &self.api_key {
            request = request.header("api-key", key.expose_secret());
        }

        let response = request.json(&json!({
            "points": points
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            return Err(format!("Qdrant upsert error: {}", response.status()));
        }

        Ok(())
    }

    async fn retrieve_notes(&self, session_id: &str, query: &str, top_k: usize, embedding_provider: &Arc<dyn EmbeddingProvider>) -> Result<Vec<NoteChunk>, String> {
        // 1. Check cache for query embedding
        let cached_embedding = {
            let mut cache = self.query_cache.lock().unwrap();
            cache.get(query).cloned()
        };

        let query_vector = if let Some(embedding) = cached_embedding {
            embedding
        } else {
            // Embed query
            let embeddings = embedding_provider.embed(&[query.to_string()]).await?;
            let embedding = embeddings.first().ok_or("Failed to generate embedding for query")?.clone();
            
            // Update cache
            let mut cache = self.query_cache.lock().unwrap();
            cache.put(query.to_string(), embedding.clone());
            
            embedding
        };

        // 2. Search Qdrant
        let search_url = format!("{}/collections/{}/points/search", self.url, self.collection);
        let mut request = self.client.post(&search_url);
        if let Some(key) = &self.api_key {
            request = request.header("api-key", key.expose_secret());
        }

        let response = request.json(&json!({
            "vector": query_vector,
            "limit": top_k,
            "filter": {
                "must": [
                    { "key": "session_id", "match": { "value": session_id } }
                ]
            },
            "with_payload": true
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            return Err(format!("Qdrant search error: {}", response.status()));
        }

        let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        
        let mut results = Vec::new();
        if let Some(points) = body.get("result").and_then(|r| r.as_array()) {
            for point in points {
                if let Some(payload) = point.get("payload") {
                    let text = payload.get("text").and_then(|t| t.as_str()).unwrap_or("").to_string();
                    let turn = payload.get("turn").and_then(|t| t.as_u64()).unwrap_or(0) as usize;
                    let source = payload.get("source").and_then(|s| s.as_str()).unwrap_or("unknown").to_string();
                    let score = point.get("score").and_then(|s| s.as_f64()).unwrap_or(0.0) as f32;

                    results.push(NoteChunk {
                        text,
                        turn,
                        source,
                        score,
                    });
                }
            }
        }

        Ok(results)
    }
    
    async fn delete_session_notes(&self, session_id: &str) -> Result<usize, String> {
        // Use Qdrant's delete by filter API
        let delete_url = format!("{}/collections/{}/points/delete", self.url, self.collection);
        let mut request = self.client.post(&delete_url);
        if let Some(key) = &self.api_key {
            request = request.header("api-key", key.expose_secret());
        }

        let response = request.json(&json!({
            "filter": {
                "must": [
                    { "key": "session_id", "match": { "value": session_id } }
                ]
            }
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            return Err(format!("Qdrant delete error: {}", response.status()));
        }
        
        // Qdrant doesn't return count in delete response, so we return 0
        // In production you might want to query count before delete
        log::info!("Deleted notes for session: {}", session_id);
        Ok(0)
    }
}

pub struct NoOpContextStore;

#[async_trait]
impl ContextStore for NoOpContextStore {
    async fn upsert_notes(&self, _session_id: &str, _notes: &[NoteChunk], _embedding_provider: &Arc<dyn EmbeddingProvider>) -> Result<(), String> {
        Ok(())
    }
    async fn retrieve_notes(&self, _session_id: &str, _query: &str, _top_k: usize, _embedding_provider: &Arc<dyn EmbeddingProvider>) -> Result<Vec<NoteChunk>, String> {
        Ok(Vec::new())
    }
    async fn delete_session_notes(&self, _session_id: &str) -> Result<usize, String> {
        Ok(0)
    }
}
