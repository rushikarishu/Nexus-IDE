use tauri::{AppHandle, Emitter, State};
use std::sync::Arc;
use std::path::Path;
use tokio::sync::mpsc;
use ai_core::manager::SessionManager;
use ai_core::session::SessionConfig;
use ai_core::provider::{Message, CompletionRequest};
use ai_core::error::ProviderError;

use crate::AppState;

/// Generate a unified diff between old content and new content
fn generate_diff(old_content: &str, new_content: &str, file_path: &str) -> String {
    let old_lines: Vec<&str> = old_content.lines().collect();
    let new_lines: Vec<&str> = new_content.lines().collect();
    
    let mut diff = String::new();
    diff.push_str(&format!("--- a/{}\n", file_path));
    diff.push_str(&format!("+++ b/{}\n", file_path));
    
    // Simple line-by-line diff (not optimal but functional)
    let max_lines = old_lines.len().max(new_lines.len());
    let mut in_hunk = false;
    let mut hunk_start_old = 0;
    let mut hunk_start_new = 0;
    let mut hunk_lines: Vec<String> = Vec::new();
    
    for i in 0..max_lines {
        let old_line = old_lines.get(i).copied();
        let new_line = new_lines.get(i).copied();
        
        match (old_line, new_line) {
            (Some(o), Some(n)) if o == n => {
                if in_hunk {
                    hunk_lines.push(format!(" {}", o));
                }
            }
            (Some(o), Some(n)) => {
                if !in_hunk {
                    in_hunk = true;
                    hunk_start_old = i + 1;
                    hunk_start_new = i + 1;
                }
                hunk_lines.push(format!("-{}", o));
                hunk_lines.push(format!("+{}", n));
            }
            (Some(o), None) => {
                if !in_hunk {
                    in_hunk = true;
                    hunk_start_old = i + 1;
                    hunk_start_new = i + 1;
                }
                hunk_lines.push(format!("-{}", o));
            }
            (None, Some(n)) => {
                if !in_hunk {
                    in_hunk = true;
                    hunk_start_old = i + 1;
                    hunk_start_new = i + 1;
                }
                hunk_lines.push(format!("+{}", n));
            }
            (None, None) => {}
        }
    }
    
    if !hunk_lines.is_empty() {
        diff.push_str(&format!(
            "@@ -{},{} +{},{} @@\n",
            hunk_start_old,
            old_lines.len(),
            hunk_start_new,
            new_lines.len()
        ));
        for line in hunk_lines {
            diff.push_str(&line);
            diff.push('\n');
        }
    }
    
    if diff.lines().count() <= 2 {
        // No actual changes
        return "No changes detected".to_string();
    }
    
    diff
}

/// Generate diff for a write_file proposal
fn generate_file_diff(workspace_root: &str, file_path: &str, new_content: &str) -> Option<String> {
    let full_path = Path::new(workspace_root).join(file_path);
    
    let old_content = if full_path.exists() {
        std::fs::read_to_string(&full_path).unwrap_or_default()
    } else {
        String::new()
    };
    
    if old_content.is_empty() && !new_content.is_empty() {
        // New file
        let mut diff = format!("--- /dev/null\n+++ b/{}\n@@ -0,0 +1,{} @@\n", file_path, new_content.lines().count());
        for line in new_content.lines() {
            diff.push_str(&format!("+{}\n", line));
        }
        return Some(diff);
    }
    
    Some(generate_diff(&old_content, new_content, file_path))
}

/// Parsed tool call result
struct ParsedToolCall {
    text_before: String,
    tool_name: String,
    args: serde_json::Value,
}

/// Parse tool calls from LLM response. Supports multiple formats:
/// 1. TOOL_CALL: { "tool": "name", "args": {...} }
/// 2. <|tool_call_begin|> functions.name:id <|tool_call_argument_begin|> {...} <|tool_call_end|>
/// 3. <tool_call name="name">{...}</tool_call>
fn parse_tool_call(response: &str) -> Option<ParsedToolCall> {
    // Try TOOL_CALL: format first
    if let Some(idx) = response.find("TOOL_CALL: ") {
        let text_before = response[..idx].trim().to_string();
        let json_str = response[idx + "TOOL_CALL: ".len()..].trim();
        
        // Try to find the end of the JSON object
        let json_str = extract_json_object(json_str);
        
        if let Ok(tool_call) = serde_json::from_str::<serde_json::Value>(&json_str) {
            let tool_name = tool_call["tool"].as_str()?.to_string();
            let args = tool_call["args"].clone();
            return Some(ParsedToolCall { text_before, tool_name, args });
        }
    }
    
    // Try native format: <|tool_call_begin|> functions.name:id <|tool_call_argument_begin|> {...} <|tool_call_end|>
    if let Some(start) = response.find("<|tool_call_begin|>") {
        let mut text_before = response[..start].trim().to_string();
        // Clean up section markers from text
        text_before = text_before
            .replace("<|tool_calls_section_begin|>", "")
            .replace("<|tool_calls_section_end|>", "")
            .trim()
            .to_string();
        
        let name_start = start + "<|tool_call_begin|>".len();
        let name_end = response[name_start..].find(':').map(|i| name_start + i)?;
        let raw_name = response[name_start..name_end].trim();
        let tool_name = raw_name.strip_prefix("functions.").unwrap_or(raw_name).to_string();
        
        let args_start_marker = "<|tool_call_argument_begin|>";
        let args_start = response.find(args_start_marker).map(|i| i + args_start_marker.len())?;
        let args_end = response.find("<|tool_call_end|>")?;
        let args_str = response[args_start..args_end].trim();
        
        if let Ok(args) = serde_json::from_str::<serde_json::Value>(args_str) {
            return Some(ParsedToolCall { text_before, tool_name, args });
        }
    }
    
    // Try XML format: <tool_call name="name">{...}</tool_call>
    if let Some(start) = response.find("<tool_call name=\"") {
        let text_before = response[..start].trim().to_string();
        
        let prefix = "<tool_call name=\"";
        let name_start = start + prefix.len();
        let name_end = response[name_start..].find('"').map(|i| name_start + i)?;
        let tool_name = response[name_start..name_end].to_string();
        
        let content_start = response[name_end..].find('>').map(|i| name_end + i + 1)?;
        let content_end = response.find("</tool_call>")?;
        let args_str = response[content_start..content_end].trim();
        
        if let Ok(args) = serde_json::from_str::<serde_json::Value>(args_str) {
            return Some(ParsedToolCall { text_before, tool_name, args });
        }
    }
    
    None
}

/// Extract a JSON object from a string (handles trailing text after the JSON)
fn extract_json_object(s: &str) -> String {
    let s = s.trim();
    if !s.starts_with('{') {
        return s.to_string();
    }
    
    let mut brace_count = 0;
    let mut in_string = false;
    let mut escape = false;
    
    for (i, c) in s.char_indices() {
        if escape {
            escape = false;
            continue;
        }
        
        match c {
            '\\' if in_string => escape = true,
            '"' => in_string = !in_string,
            '{' if !in_string => brace_count += 1,
            '}' if !in_string => {
                brace_count -= 1;
                if brace_count == 0 {
                    return s[..=i].to_string();
                }
            }
            _ => {}
        }
    }
    
    s.to_string()
}

#[derive(serde::Serialize, Clone)]
struct AiStreamChunk {
    session_id: String,
    chunk: String,
    done: bool,
}

#[derive(serde::Serialize, Clone)]
struct AiStreamError {
    session_id: String,
    error: String,
}

#[tauri::command]
pub async fn ai_create_session(
    config: SessionConfig,
    state: State<'_, Arc<SessionManager>>,
    app_state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    tracing::info!(mode = %config.mode, "Creating AI session");
    // Version check
    // Version is now part of SessionConfig and will be handled by the backend logic if needed.
    
    let root = {
        let roots = app_state.workspace_roots.read().map_err(|e| e.to_string())?;
        roots.first().ok_or("Workspace root not set")?.clone()
    };
        
    Ok(state.create_session(config, root))
}

#[tauri::command]
pub async fn ai_send_prompt(
    session_id: String,
    prompt: String,
    state: State<'_, Arc<SessionManager>>,
    app_state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    tracing::info!(session_id = %session_id, prompt_len = prompt.len(), "Sending AI prompt");
    let session = state.get_session(&session_id).ok_or_else(|| {
        serde_json::to_string(&ProviderError::Configuration("Session not found".to_string())).unwrap()
    })?;

    // Get provider
    let provider = state.router.get_provider(&session.config).map_err(|e| {
        serde_json::to_string(&e).unwrap()
    })?;

    // Add user message to history
    let user_msg = Message {
        role: ai_core::provider::Role::User,
        content: prompt,
    };
    state.add_message(&session_id, user_msg.clone()).map_err(|e| e.to_string())?;

    // Create request
    // NOTE: We must include the just-added user_msg. The `session` variable above is a snapshot 
    // from *before* we added the message.
    let mut messages = session.history.clone();
    messages.push(user_msg);

    let system_prompt = "You are SupaDev, an AI coding assistant.
You have access to the following tools:
- read_file: Reads the content of a file. Args: { \"path\": \"string\" }
- write_file: Writes content to a file. Args: { \"path\": \"string\", \"content\": \"string\" }
- list_dir: Lists files in a directory. Args: { \"path\": \"string\" }
- run_command: Runs a shell command. Args: { \"command\": \"string\" }
- search_files: Searches for a string in files. Args: { \"query\": \"string\", \"path\": \"string\" (optional) }

To use a tool, you MUST output a line starting with \"TOOL_CALL: \" followed by the JSON representation of the tool call.
Example: TOOL_CALL: { \"tool\": \"write_file\", \"args\": { \"path\": \"src/index.html\", \"content\": \"<html>...</html>\" } }

Do not output the tool call inside a code block. Output it as raw text on its own line.
When you want to create or modify files, use the write_file tool. Do not just print the code.
When you need to explore the project structure, use list_dir.
When you need to find code, use search_files.
When you need to run tests or install dependencies, use run_command.";

    let request = CompletionRequest {
        messages,
        context: None, // TODO: Add context
        system_prompt: Some(system_prompt.to_string()),
        temperature: Some(0.7),
        model: session.config.model.clone(),
    };

    // Call provider
    let response = provider.send_message(request).await.map_err(|e| {
        serde_json::to_string(&e).unwrap()
    })?;

    // Check for tool call in any supported format
    if let Some(parsed) = parse_tool_call(&response) {
        let text_part = &parsed.text_before;
        let tool_name = parsed.tool_name;
        let args = parsed.args;
        
        // If there is text before the tool call, add it as an assistant message
        if !text_part.is_empty() {
            let assistant_msg = Message {
                role: ai_core::provider::Role::Assistant,
                content: text_part.to_string(),
            };
            state.add_message(&session_id, assistant_msg).map_err(|e| {
                serde_json::to_string(&ProviderError::Server(e)).unwrap()
            })?;
        }

        // Policy Check
        let mode = session.config.mode.as_str();
        if let Some(policy) = &session.policy {
            // In beastup mode, we override the policy to be permissive for now
            if mode != "beastup" && !policy.is_tool_allowed(&tool_name) {
                let rejection_msg = Message {
                    role: ai_core::provider::Role::System,
                    content: format!("Tool '{}' is not allowed by current policy.", tool_name),
                };
                state.add_message(&session_id, rejection_msg).map_err(|e| e.to_string())?;
                return Ok(format!("{}\nTool execution denied by policy.", text_part));
            }

            if mode == "beastup" || !policy.requires_approval(&tool_name) {
                // Auto-execute
                let tool = session.tool_registry.get(&tool_name).ok_or("Tool not found")?;
                let result = tool.execute(args.clone()).map_err(|e| e.to_string())?;
                
                let tool_msg = Message {
                    role: ai_core::provider::Role::Tool,
                    content: format!("Tool '{}' executed automatically. Result: {}", tool_name, result),
                };
                state.add_message(&session_id, tool_msg).map_err(|e| e.to_string())?;
                return Ok(format!("{}\nTool '{}' executed automatically.", text_part, tool_name));
            }
        }

        // Create Proposal (if approval required or no policy set - default to safe)
        // Generate diff for write_file proposals
        let diff = if tool_name == "write_file" {
            let workspace_root = {
                let roots = app_state.workspace_roots.read().map_err(|e| e.to_string())?;
                roots.first().cloned().unwrap_or_default()
            };
            let file_path = args["path"].as_str().unwrap_or("");
            let content = args["content"].as_str().unwrap_or("");
            generate_file_diff(&workspace_root, file_path, content)
        } else {
            None
        };
        
        let proposal = ai_core::tools::Proposal {
            id: uuid::Uuid::new_v4().to_string(),
            tool_name: tool_name.clone(),
            args: args.clone(),
            status: ai_core::tools::ProposalStatus::Pending,
            diff,
        };
        
        state.add_proposal(&session_id, proposal).map_err(|e| e.to_string())?;
        
        let assistant_msg = Message {
            role: ai_core::provider::Role::Assistant,
            content: format!("I propose to run tool '{}'. Please approve.", tool_name),
        };
        state.add_message(&session_id, assistant_msg).map_err(|e| {
            serde_json::to_string(&ProviderError::Server(e)).unwrap()
        })?;
        
        // Return the text part so the frontend displays the conversation
        return Ok(text_part.to_string());
    }

    // Add assistant message
    let assistant_msg = Message {
        role: ai_core::provider::Role::Assistant,
        content: response.clone(),
    };
    state.add_message(&session_id, assistant_msg).map_err(|e| {
        serde_json::to_string(&ProviderError::Server(e)).unwrap()
    })?;

    Ok(response)
}

/// Streaming variant of ai_send_prompt.
///
/// This command emits `ai_stream_chunk` events while the provider
/// generates a response, then returns the final response string.
#[tauri::command]
pub async fn ai_send_prompt_streaming(
    session_id: String,
    prompt: String,
    state: State<'_, Arc<SessionManager>>,
    app_state: State<'_, Arc<AppState>>,
    app_handle: AppHandle,
) -> Result<String, String> {
    tracing::info!(session_id = %session_id, prompt_len = prompt.len(), "Sending AI prompt (streaming)");
    let session = state.get_session(&session_id).ok_or_else(|| {
        serde_json::to_string(&ProviderError::Configuration("Session not found".to_string())).unwrap()
    })?;

    // Get provider
    let provider = state.router.get_provider(&session.config).map_err(|e| {
        serde_json::to_string(&e).unwrap()
    })?;

    // Add user message to history
    let user_msg = Message {
        role: ai_core::provider::Role::User,
        content: prompt,
    };
    state.add_message(&session_id, user_msg.clone()).map_err(|e| e.to_string())?;

    // Create request including the just-added user message
    let mut messages = session.history.clone();
    messages.push(user_msg);

    let system_prompt = "You are SupaDev, an AI coding assistant.
You have access to the following tools:
- read_file: Reads the content of a file. Args: { \"path\": \"string\" }
- write_file: Writes content to a file. Args: { \"path\": \"string\", \"content\": \"string\" }
- list_dir: Lists files in a directory. Args: { \"path\": \"string\" }
- run_command: Runs a shell command. Args: { \"command\": \"string\" }
- search_files: Searches for a string in files. Args: { \"query\": \"string\", \"path\": \"string\" (optional) }

To use a tool, you MUST output a line starting with \"TOOL_CALL: \" followed by the JSON representation of the tool call.
Example: TOOL_CALL: { \"tool\": \"write_file\", \"args\": { \"path\": \"src/index.html\", \"content\": \"<html>...</html>\" } }

Do not output the tool call inside a code block. Output it as raw text on its own line.
When you want to create or modify files, use the write_file tool. Do not just print the code.
When you need to explore the project structure, use list_dir.
When you need to find code, use search_files.
When you need to run tests or install dependencies, use run_command.";

    // Streaming channel
    let (tx, mut rx) = mpsc::channel::<String>(32);
    let session_id_for_task = session_id.clone();
    let app_handle_for_stream = app_handle.clone();

    // Forward chunks to frontend via Tauri events
    tauri::async_runtime::spawn(async move {
        while let Some(chunk) = rx.recv().await {
            let payload = AiStreamChunk {
                session_id: session_id_for_task.clone(),
                chunk,
                done: false,
            };

            if let Err(e) = app_handle_for_stream.emit("ai_stream_chunk", payload) {
                log::warn!("Failed to emit ai_stream_chunk event: {}", e);
                break;
            }
        }

        // Signal completion
        let done_payload = AiStreamChunk {
            session_id: session_id_for_task,
            chunk: String::new(),
            done: true,
        };
        let _ = app_handle_for_stream.emit("ai_stream_chunk", done_payload);
    });

    let mut current_response = String::new();
    let mut turns = 0;
    let max_turns = 10; // Cap at 10 turns to prevent infinite loops

    loop {
        turns += 1;
        if turns > max_turns {
            break;
        }

        // Update request messages from session history
        // We need to fetch the latest history because tool results might have been added
        let session = state.get_session(&session_id).ok_or("Session lost during execution")?;
        let messages = session.history.clone();
        // Note: The initial user message was already added to history at the start of the function
        
        // If this is not the first turn, we don't need to add the user message again, 
        // as it's already in the history.
        
        let request = CompletionRequest {
            messages,
            context: None,
            system_prompt: Some(system_prompt.to_string()),
            temperature: Some(0.7),
            model: session.config.model.clone(),
        };

        // Call provider with streaming hook
        // We clone tx so the channel stays open for subsequent turns
        let response = provider.send_message_streaming(request, tx.clone()).await.map_err(|e| {
            let serialized = serde_json::to_string(&e).unwrap();
            let _ = app_handle.emit(
                "ai_stream_error",
                AiStreamError {
                    session_id: session_id.clone(),
                    error: serialized.clone(),
                },
            );
            serialized
        })?;

        // Check for tool call in any supported format
        if let Some(parsed) = parse_tool_call(&response) {
            let text_part = &parsed.text_before;
            let tool_name = parsed.tool_name;
            let args = parsed.args;
            
            // If there is text before the tool call, add it as an assistant message
            if !text_part.is_empty() {
                let assistant_msg = Message {
                    role: ai_core::provider::Role::Assistant,
                    content: text_part.to_string(),
                };
                state.add_message(&session_id, assistant_msg).map_err(|e| {
                    serde_json::to_string(&ProviderError::Server(e)).unwrap()
                })?;
                current_response.push_str(text_part);
                current_response.push('\n');
            }

            let mode = session.config.mode.as_str();
            if let Some(policy) = &session.policy {
                if mode != "beastup" && !policy.is_tool_allowed(&tool_name) {
                    let rejection_msg = Message {
                        role: ai_core::provider::Role::System,
                        content: format!("Tool '{}' is not allowed by current policy.", tool_name),
                    };
                    state.add_message(&session_id, rejection_msg).map_err(|e| e.to_string())?;
                    current_response.push_str("\nTool execution denied by policy.");
                    break;
                }

                if mode == "beastup" || !policy.requires_approval(&tool_name) {
                    let tool = session.tool_registry.get(&tool_name).ok_or("Tool not found")?;
                    let result = tool.execute(args.clone()).map_err(|e| e.to_string())?;

                    let tool_msg = Message {
                        role: ai_core::provider::Role::Tool,
                        content: format!("Tool '{}' executed automatically. Result: {}", tool_name, result),
                    };
                    state.add_message(&session_id, tool_msg).map_err(|e| e.to_string())?;
                    
                    current_response.push_str(&format!("Tool '{}' executed automatically.\n", tool_name));
                    
                    // LOOP: Continue to next iteration to feed result back to LLM
                    continue;
                }
            }

            // Generate diff for write_file proposals
            let diff = if tool_name == "write_file" {
                let workspace_root = {
                    let roots = app_state.workspace_roots.read().map_err(|e| e.to_string())?;
                    roots.first().cloned().unwrap_or_default()
                };
                let file_path = args["path"].as_str().unwrap_or("");
                let content = args["content"].as_str().unwrap_or("");
                generate_file_diff(&workspace_root, file_path, content)
            } else {
                None
            };

            let proposal = ai_core::tools::Proposal {
                id: uuid::Uuid::new_v4().to_string(),
                tool_name: tool_name.clone(),
                args: args.clone(),
                status: ai_core::tools::ProposalStatus::Pending,
                diff,
            };

            state.add_proposal(&session_id, proposal).map_err(|e| e.to_string())?;

            let assistant_msg = Message {
                role: ai_core::provider::Role::Assistant,
                content: format!("I propose to run tool '{}'. Please approve.", tool_name),
            };
            state.add_message(&session_id, assistant_msg).map_err(|e| {
                serde_json::to_string(&ProviderError::Server(e)).unwrap()
            })?;

            // If we are here, it means we are waiting for user approval, so we break the loop
            current_response.push_str(&text_part);
            break;
        }

        // No tool call, just a normal response
        let assistant_msg = Message {
            role: ai_core::provider::Role::Assistant,
            content: response.clone(),
        };
        state.add_message(&session_id, assistant_msg).map_err(|e| {
            serde_json::to_string(&ProviderError::Server(e)).unwrap()
        })?;

        current_response.push_str(&response);
        break;
    }

    Ok(current_response)
}

#[tauri::command]
pub async fn ai_list_proposals(
    session_id: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<Vec<ai_core::tools::Proposal>, String> {
    // tracing::debug!(session_id = %session_id, "Listing proposals");
    state.get_proposals(&session_id)
}

#[tauri::command]
pub async fn ai_approve_tool(
    session_id: String,
    proposal_id: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<String, String> {
    tracing::info!(session_id = %session_id, proposal_id = %proposal_id, "Approving tool");
    // 1. Get session and proposal
    let session = state.get_session(&session_id).ok_or("Session not found")?;
    let proposal = session.proposals.get(&proposal_id).ok_or("Proposal not found")?.clone();

    // 2. Execute tool
    let tool = session.tool_registry.get(&proposal.tool_name).ok_or("Tool not found")?;
    let result = tool.execute(proposal.args.clone()).map_err(|e| e.to_string())?;

    // 3. Update proposal status
    state.update_proposal_status(&session_id, &proposal_id, ai_core::tools::ProposalStatus::Executed)?;

    // 4. Add result to history
    let tool_msg = Message {
        role: ai_core::provider::Role::Tool,
        content: format!("Tool '{}' executed successfully. Result: {}", proposal.tool_name, result),
    };
    state.add_message(&session_id, tool_msg).map_err(|e| e.to_string())?;

    Ok("Tool executed".to_string())
}

#[tauri::command]
pub async fn ai_reject_tool(
    session_id: String,
    proposal_id: String,
    state: State<'_, Arc<SessionManager>>,
) -> Result<String, String> {
    tracing::info!(session_id = %session_id, proposal_id = %proposal_id, "Rejecting tool");
    state.update_proposal_status(&session_id, &proposal_id, ai_core::tools::ProposalStatus::Rejected)?;
    
    // Add rejection message
    let msg = Message {
        role: ai_core::provider::Role::User,
        content: "Tool execution rejected by user.".to_string(),
    };
    state.add_message(&session_id, msg).map_err(|e| e.to_string())?;

    Ok("Tool rejected".to_string())
}

#[tauri::command]
pub async fn ai_compass_run(
    query: String,
    session_id: Option<String>,
    model: Option<String>,
    state: State<'_, Arc<SessionManager>>,
    app_state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    tracing::info!(query_len = query.len(), "Running Compass agent");
    // 1. Setup configuration for provider routing
    let compass_session_id = session_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // Use a simple SessionConfig just to reuse the ProviderRouter.
    // We keep this local and do not register a full SupaDev/BeastUp session.
    let session_config = SessionConfig {
        // COMPASS is our autonomous "BeastUp" agent, so we route as BeastUp.
        mode: "beastup".to_string(),
        provider: "internal".to_string(),
        model: model.clone(),  // Pass None if not specified, allowing provider fallback
        version: Some("1.0".to_string()),
    };

    // 2. Get Provider
    let provider = state.router.get_provider(&session_config).map_err(|e| {
        serde_json::to_string(&e).unwrap_or_else(|_| e.to_string())
    })?;

    // 3. Setup Tools (reuse workspace root)
    let root = {
        let roots = app_state.workspace_roots.read().map_err(|e| e.to_string())?;
        roots.first().ok_or("Workspace root not set")?.clone()
    };
        
    let mut tool_registry = ai_core::tools::ToolRegistry::new();
    tool_registry.register(Box::new(ai_core::tools::ReadFileTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::WriteFileTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::ListDirTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::RunCommandTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::SearchFilesTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::SequentialThinkingTool::new()));
    let tool_registry = Arc::new(tool_registry);

    // 4. Setup RAG Components (from Env)
    let qdrant_url = std::env::var("QDRANT_URL").map_err(|_| "Missing QDRANT_URL env var".to_string())?;
    let qdrant_collection = std::env::var("QDRANT_COLLECTION").map_err(|_| "Missing QDRANT_COLLECTION env var".to_string())?;
    let qdrant_api_key = std::env::var("QDRANT_API_KEY").ok();
    let chutes_api_token = std::env::var("CHUTES_API_TOKEN").map_err(|_| "Missing CHUTES_API_TOKEN env var".to_string())?;

    let context_store: Arc<dyn ai_core::rag::ContextStore> = if let Ok(client) = reqwest::Client::builder().timeout(std::time::Duration::from_secs(1)).build() {
        let check_url = format!("{}/collections", qdrant_url);
        if client.get(&check_url).send().await.is_ok() {
            Arc::new(ai_core::rag::QdrantContextStore::new(qdrant_url.clone(), qdrant_collection.clone(), qdrant_api_key.clone()))
        } else {
            log::warn!("Qdrant unavailable. Running without long-term memory.");
            Arc::new(ai_core::rag::NoOpContextStore)
        }
    } else {
        Arc::new(ai_core::rag::NoOpContextStore)
    };

    let embedding_provider = Arc::new(ai_core::rag::ChutesEmbeddingProvider::new(chutes_api_token.clone()));

    // 5. Setup Compass Agent
    // Use the provided model or fall back to the internal provider's default
    let model_to_use = model.unwrap_or_else(|| "moonshotai/Kimi-K2-Thinking".to_string());
    let compass_config = ai_core::compass::CompassConfig {
        max_turns: 10,
        main_agent_model: model_to_use.clone(),
        meta_thinker_model: model_to_use.clone(),
        context_manager_model: model_to_use.clone(),
        session_id: compass_session_id.clone(),
        qdrant_url,
        qdrant_collection,
        qdrant_api_key,
        chutes_api_token,
    };

    let mut agent = ai_core::compass::CompassAgent::new(
        compass_config,
        provider,
        tool_registry,
        context_store,
        embedding_provider,
        state.audit_logger.clone(),
    );

    // 6. Run
    agent.run(query, None).await
}

#[tauri::command]
pub async fn ai_compass_run_streaming(
    query: String,
    session_id: Option<String>,
    model: Option<String>,
    state: State<'_, Arc<SessionManager>>,
    app_state: State<'_, Arc<AppState>>,
    app_handle: AppHandle,
) -> Result<String, String> {
    tracing::info!(query_len = query.len(), "Running Compass agent (streaming)");
    // 1. Setup configuration for provider routing
    let compass_session_id = session_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let session_config = SessionConfig {
        mode: "beastup".to_string(),
        provider: "internal".to_string(),
        model: model.clone(),  // Pass None if not specified, allowing provider fallback
        version: Some("1.0".to_string()),
    };

    // 2. Get Provider
    let provider = state.router.get_provider(&session_config).map_err(|e| {
        serde_json::to_string(&e).unwrap_or_else(|_| e.to_string())
    })?;

    // 3. Setup Tools
    let root = {
        let roots = app_state.workspace_roots.read().map_err(|e| e.to_string())?;
        roots.first().ok_or("Workspace root not set")?.clone()
    };
        
    let mut tool_registry = ai_core::tools::ToolRegistry::new();
    tool_registry.register(Box::new(ai_core::tools::ReadFileTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::WriteFileTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::ListDirTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::RunCommandTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::SearchFilesTool { workspace_root: root.clone() }));
    tool_registry.register(Box::new(ai_core::tools::SequentialThinkingTool::new()));
    let tool_registry = Arc::new(tool_registry);

    // 4. Setup RAG Components
    let qdrant_url = std::env::var("QDRANT_URL").map_err(|_| "Missing QDRANT_URL env var".to_string())?;
    let qdrant_collection = std::env::var("QDRANT_COLLECTION").map_err(|_| "Missing QDRANT_COLLECTION env var".to_string())?;
    let qdrant_api_key = std::env::var("QDRANT_API_KEY").ok();
    let chutes_api_token = std::env::var("CHUTES_API_TOKEN").map_err(|_| "Missing CHUTES_API_TOKEN env var".to_string())?;

    let context_store: Arc<dyn ai_core::rag::ContextStore> = if let Ok(client) = reqwest::Client::builder().timeout(std::time::Duration::from_secs(1)).build() {
        let check_url = format!("{}/collections", qdrant_url);
        if client.get(&check_url).send().await.is_ok() {
            Arc::new(ai_core::rag::QdrantContextStore::new(qdrant_url.clone(), qdrant_collection.clone(), qdrant_api_key.clone()))
        } else {
            let _ = app_handle.emit("compass_event", serde_json::json!({
                "session_id": compass_session_id.clone(),
                "event": ai_core::compass::CompassEvent::Error("Qdrant unavailable. Running without long-term memory.".to_string())
            }));
            Arc::new(ai_core::rag::NoOpContextStore)
        }
    } else {
        Arc::new(ai_core::rag::NoOpContextStore)
    };

    let embedding_provider = Arc::new(ai_core::rag::ChutesEmbeddingProvider::new(chutes_api_token.clone()));

    // 5. Setup Compass Agent
    // Use the provided model or fall back to the internal provider's default
    let model_to_use = model.unwrap_or_else(|| "moonshotai/Kimi-K2-Thinking".to_string());
    let compass_config = ai_core::compass::CompassConfig {
        max_turns: 10,
        main_agent_model: model_to_use.clone(),
        meta_thinker_model: model_to_use.clone(),
        context_manager_model: model_to_use.clone(),
        session_id: compass_session_id.clone(),
        qdrant_url,
        qdrant_collection,
        qdrant_api_key,
        chutes_api_token,
    };

    let mut agent = ai_core::compass::CompassAgent::new(
        compass_config,
        provider,
        tool_registry,
        context_store,
        embedding_provider,
        state.audit_logger.clone(),
    );

    // 6. Setup Streaming Channel
    let (tx, mut rx) = mpsc::channel::<ai_core::compass::CompassEvent>(32);
    let app_handle_clone = app_handle.clone();
    let session_id_clone = compass_session_id.clone();

    // 7. Spawn Event Forwarder
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            let _ = app_handle_clone.emit("compass_event", serde_json::json!({
                "session_id": session_id_clone,
                "event": event
            }));
        }
    });

    // 8. Run Agent
    agent.run(query, Some(tx)).await
}

#[derive(serde::Serialize)]
pub struct RagStatus {
    pub qdrant: bool,
    pub chutes: bool,
}

#[tauri::command]
pub async fn get_rag_status() -> Result<RagStatus, String> {
    let qdrant_url = std::env::var("QDRANT_URL").unwrap_or_default();
    let chutes_token = std::env::var("CHUTES_API_TOKEN").unwrap_or_default();

    // Simple check: are env vars present?
    // Ideally we would ping the services, but for now this is a start.
    // We can try a simple HTTP request to Qdrant if we want to be more robust.
    
    let qdrant_ok = !qdrant_url.is_empty(); // && ping_qdrant(&qdrant_url).await;
    let chutes_ok = !chutes_token.is_empty();

    Ok(RagStatus {
        qdrant: qdrant_ok,
        chutes: chutes_ok,
    })
}
