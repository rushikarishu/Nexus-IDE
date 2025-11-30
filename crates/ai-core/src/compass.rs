use std::sync::Arc;
use crate::provider::{LLMProvider, Message, Role, CompletionRequest};
use crate::tools::ToolRegistry;
use crate::rag::{ContextStore, EmbeddingProvider, NoteChunk};
use crate::task_router::TaskRouter;
use crate::task_manager::{TaskManager, TaskStatus};
use serde::{Deserialize, Serialize};


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompassConfig {
    pub max_turns: usize,
    pub main_agent_model: String,
    pub meta_thinker_model: String,
    pub context_manager_model: String,
    pub session_id: String,
    pub qdrant_url: String,
    pub qdrant_collection: String,
    pub qdrant_api_key: Option<String>,
    pub chutes_api_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextManager {
}

impl ContextManager {
    pub fn new() -> Self {
        Self {}
    }

    pub async fn initialize(&self, query: &str, session_id: &str, context_store: &Arc<dyn ContextStore>, embedding_provider: &Arc<dyn EmbeddingProvider>) -> Result<String, String> {
        // Optionally embed query as initial note
        let initial_note = NoteChunk {
            text: format!("Initial Task: {}", query),
            turn: 0,
            source: "init".to_string(),
            score: 1.0,
        };
        context_store.upsert_notes(session_id, &[initial_note], embedding_provider).await?;
        
        Ok(format!("Task: {}", query))
    }

    pub async fn update(
        &self, 
        query: &str, 
        history: &[StepResult], 
        decision: &MetaDecision, 
        session_id: &str,
        turn: usize,
        context_store: &Arc<dyn ContextStore>,
        embedding_provider: &Arc<dyn EmbeddingProvider>,
        provider: &Arc<dyn LLMProvider>,
        model: &str,
    ) -> Result<String, String> {
        // 1. Retrieve relevant notes (graceful fallback)
        let retrieved_notes = match context_store.retrieve_notes(session_id, query, 10, embedding_provider).await {
            Ok(notes) => notes,
            Err(e) => {
                // Log error if possible, or just ignore
                eprintln!("RAG Retrieve Warning: {}", e);
                Vec::new()
            }
        };
        let notes_str = retrieved_notes.iter().map(|n| format!("- {}", n.text)).collect::<Vec<String>>().join("\n");

        // Summarize history (last few steps only to save tokens?)
        // For now, keep full history but maybe truncate if too long in future
        let history_str = history.iter().enumerate().map(|(i, step)| {
            format!("Step {}:\nThought: {}\nAction: {}\nObservation: {}\n", i + 1, step.thought, step.action, step.observation)
        }).collect::<Vec<String>>().join("\n---\n");

        let feedback = match decision {
            MetaDecision::Reflect(f) => format!("Meta decision: REFLECT. Feedback: {}", f),
            MetaDecision::Pivot(f) => format!("Meta decision: PIVOT. Feedback: {}", f),
            MetaDecision::Verify(f) => format!("Meta decision: VERIFY. Feedback: {}", f),
            MetaDecision::Continue => "Meta decision: CONTINUE.".to_string(),
            MetaDecision::Stop(a) => format!("Meta decision: STOP. Candidate answer: {}", a),
        };

        let messages = vec![
             Message { 
                 role: Role::System, 
                 content: format!("You are the Context Manager (Model: {}). You transform full task history and research notes into a concise, execution-ready context for the Main Agent each turn.
Your tasks:
1. Integrate evidence from history and retrieved notes.
2. Prioritize verified, high-confidence findings and resolve minor inconsistencies.
3. Produce a clear, direct answer to the query.
4. Extract key findings to append to the permanent notes.

Guidelines:
- Use concise, authoritative natural language.
- If needed, include a one-line justification citing key evidence sources.
- Avoid hedging such as \"insufficient information\"; provide your strongest synthesis.
- Be strictly selective: include only information required for the next turn's tactical reasoning.
- Do not execute tasks; do not duplicate raw history—promote only salient facts and decisions.
- Keep the output compact (typically <= 200-300 tokens), with bullet lists over prose when possible.

Output Format:
Task: [One-sentence restatement of query]
Most-Recent Evidence:
- [Verified, relevant facts]
Critical Constraints & Corrections:
- [Formatting/grounding constraints]
- [Corrections to earlier mistakes]
Open Items:
- [Unresolved sub-questions or missing data (prioritized)]
Next Actions (Plan):
- [2-4 concrete steps aligned with decision]
Tool Hints (Optional):
- [Specific tools to use]
<new_notes>
- [Note 1]
- [Note 2]
</new_notes>
", model) 
             },
             Message { role: Role::User, content: format!("Task: {}\nHistory:\n{}\nRetrieved Notes:\n{}\n{}", query, history_str, notes_str, feedback) },
        ];

        let request = CompletionRequest {
            messages,
            context: None,
            system_prompt: None,
            temperature: Some(0.0),
            model: Some(model.to_string()),
        };

        let response = provider.send_message(request).await.map_err(|e| e.to_string())?;
        
        // Parse new notes
        let mut new_note_chunks = Vec::new();
        if let Some(start) = response.find("<new_notes>") {
            if let Some(end) = response.find("</new_notes>") {
                let notes_content = response[start+11..end].trim();
                for line in notes_content.lines() {
                    if line.trim().starts_with("- ") {
                        new_note_chunks.push(NoteChunk {
                            text: line.trim()[2..].to_string(),
                            turn: turn + 1,
                            source: "note".to_string(),
                            score: 1.0, // Default score
                        });
                    }
                }
            }
        }

        // Upsert new notes (graceful fallback)
        if !new_note_chunks.is_empty() {
            if let Err(e) = context_store.upsert_notes(session_id, &new_note_chunks, embedding_provider).await {
                eprintln!("RAG Upsert Warning: {}", e);
            }
        }

        // Remove new_notes tag from context to keep it clean for Main Agent
        let mut context = if let Some(start) = response.find("<new_notes>") {
            response[..start].trim().to_string()
        } else {
            response.clone()
        };

        // Append raw history window (last 2 turns) to context
        // This ensures the Main Agent sees the immediate results of its actions
        let start_index = if history.len() > 2 { history.len() - 2 } else { 0 };
        let recent_history = &history[start_index..];
        if !recent_history.is_empty() {
            context.push_str("\n\nRecent Execution History (Raw):\n");
            for (i, step) in recent_history.iter().enumerate() {
                context.push_str(&format!("Step {}:\nThought: {}\nAction: {}\nObservation: {}\n---\n", 
                    start_index + i + 1, step.thought, step.action, step.observation));
            }
        }
        
        Ok(context)
    }
}

use crate::audit::{AuditLogger, AuditLog};
use chrono::Utc;

pub struct CompassAgent {
    config: CompassConfig,
    main_agent: MainAgent,
    meta_thinker: MetaThinker,
    context_manager: ContextManager,
    answer_synthesizer: AnswerSynthesizer,
    provider: Arc<dyn LLMProvider>,
    context_store: Arc<dyn ContextStore>,
    embedding_provider: Arc<dyn EmbeddingProvider>,
    audit_logger: Arc<dyn AuditLogger>,
    task_router: TaskRouter,
    task_manager: TaskManager,
    pub history: Vec<StepResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CompassEvent {
    Step(StepResult),
    Decision(MetaDecision),
    ContextUpdate(String),
    Answer(String),
    Error(String),
}

impl CompassAgent {
    pub fn new(
        config: CompassConfig, 
        provider: Arc<dyn LLMProvider>, 
        tool_registry: Arc<ToolRegistry>,
        context_store: Arc<dyn ContextStore>,
        embedding_provider: Arc<dyn EmbeddingProvider>,
        audit_logger: Arc<dyn AuditLogger>,
    ) -> Self {
        Self {
            config: config.clone(),
            main_agent: MainAgent::new(tool_registry),
            meta_thinker: MetaThinker::new(),
            context_manager: ContextManager::new(),
            answer_synthesizer: AnswerSynthesizer::new(),
            provider,
            context_store,
            embedding_provider,
            audit_logger,
            task_router: TaskRouter::new(),
            task_manager: TaskManager::new(),
            history: Vec::new(),
        }
    }

    pub async fn run(&mut self, query: String, event_tx: Option<tokio::sync::mpsc::Sender<CompassEvent>>) -> Result<String, String> {
        let session_id = self.config.session_id.clone();
        
        self.audit_logger.log(AuditLog {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            session_id: session_id.clone(),
            actor: "system".to_string(),
            action: "compass_start".to_string(),
            details: serde_json::json!({ "query": query }),
        });

        // Initialize context (optionally embedding query)
        let mut context = self.context_manager.initialize(&query, &self.config.session_id, &self.context_store, &self.embedding_provider).await?;
        if let Some(tx) = &event_tx {
            let _ = tx.send(CompassEvent::ContextUpdate(context.clone())).await;
        }
        self.history.clear();

        // Create initial task
        let task_id = self.task_manager.create_task(query.clone(), None);
        self.task_manager.update_status(&task_id, TaskStatus::InProgress).unwrap();

        for turn in 0..self.config.max_turns {
            // Determine best model for current context
            let model_name = self.task_router.route(&context);
            let model_str = model_name.to_string();
            
            // Update task with assigned model
            let _ = self.task_manager.assign_model(&task_id, model_name);

            // 2. Main Agent executes tactical reasoning
            let step_result = self.main_agent.execute_turn(&context, &self.provider, &model_str).await?;
            self.history.push(step_result.clone());
            
            if let Some(tx) = &event_tx {
                let _ = tx.send(CompassEvent::Step(step_result.clone())).await;
            }

            self.audit_logger.log(AuditLog {
                id: uuid::Uuid::new_v4().to_string(),
                timestamp: Utc::now(),
                session_id: session_id.clone(),
                actor: "assistant".to_string(),
                action: "compass_step".to_string(),
                details: serde_json::json!({
                    "turn": turn,
                    "thought": step_result.thought,
                    "action": step_result.action,
                    "observation": step_result.observation,
                }),
            });

            // 3. Meta-Thinker monitors and decides
            let decision = self.meta_thinker.monitor(&self.history, &context, &self.provider, &self.config.meta_thinker_model).await?;
            
            if let Some(tx) = &event_tx {
                let _ = tx.send(CompassEvent::Decision(decision.clone())).await;
            }

            self.audit_logger.log(AuditLog {
                id: uuid::Uuid::new_v4().to_string(),
                timestamp: Utc::now(),
                session_id: session_id.clone(),
                actor: "system".to_string(),
                action: "compass_decision".to_string(),
                details: serde_json::json!({
                    "turn": turn,
                    "decision": format!("{:?}", decision),
                }),
            });

            match decision {
                MetaDecision::Stop(_) => {
                    // 4. Answer Synthesizer produces final answer
                    let notes_chunks = self.context_store.retrieve_notes(&self.config.session_id, &query, 20, &self.embedding_provider).await?;
                    let notes = Notes { content: notes_chunks.into_iter().map(|n| n.text).collect() };
                    
                    let final_answer = self.answer_synthesizer.synthesize(&query, &self.history, &notes, &self.provider, &self.config.main_agent_model).await;
                    
                    if let Ok(ref answer) = final_answer {
                        if let Some(tx) = &event_tx {
                            let _ = tx.send(CompassEvent::Answer(answer.clone())).await;
                        }
                        self.audit_logger.log(AuditLog {
                            id: uuid::Uuid::new_v4().to_string(),
                            timestamp: Utc::now(),
                            session_id: session_id.clone(),
                            actor: "assistant".to_string(),
                            action: "compass_complete".to_string(),
                            details: serde_json::json!({ "answer": answer }),
                        });
                    }
                    
                    self.task_manager.update_status(&task_id, TaskStatus::Completed).unwrap();
                    return final_answer;
                },
                MetaDecision::Continue | MetaDecision::Reflect(_) | MetaDecision::Pivot(_) | MetaDecision::Verify(_) => {
                    // 5. Context Manager updates context and notes
                    let new_context = self.context_manager.update(
                        &query, 
                        &self.history, 
                        &decision, 
                        &self.config.session_id,
                        turn,
                        &self.context_store,
                        &self.embedding_provider,
                        &self.provider,
                        &self.config.context_manager_model
                    ).await?;
                    context = new_context;
                    if let Some(tx) = &event_tx {
                        let _ = tx.send(CompassEvent::ContextUpdate(context.clone())).await;
                    }
                }
            }
        }

        self.audit_logger.log(AuditLog {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            session_id: session_id.clone(),
            actor: "system".to_string(),
            action: "compass_timeout".to_string(),
            details: serde_json::json!({ "max_turns": self.config.max_turns }),
        });
        
        let err_msg = "Max turns reached".to_string();
        self.task_manager.update_status(&task_id, TaskStatus::Failed).unwrap();
        if let Some(tx) = &event_tx {
            let _ = tx.send(CompassEvent::Error(err_msg.clone())).await;
        }

        Err(err_msg)
    }
}

struct MainAgent {
    tool_registry: Arc<ToolRegistry>,
}

impl MainAgent {
    pub fn new(tool_registry: Arc<ToolRegistry>) -> Self {
        Self { tool_registry }
    }

    pub async fn execute_turn(&self, context: &str, provider: &Arc<dyn LLMProvider>, model: &str) -> Result<StepResult, String> {
        // Generate tool descriptions
        let mut tool_descriptions = String::new();
        for tool in self.tool_registry.tools.values() {
            tool_descriptions.push_str(&format!("- {}: {}\n", tool.name(), tool.description()));
        }

        // Construct prompt with context
        let messages = vec![
            Message { 
                role: Role::System, 
                content: format!("You are the Main Agent (Model: {}). Your role is to execute the user's task through an iterative loop of reasoning, tool use, and observation.

You have access to the following tools:
{}
- sequential_thinking: A tool for dynamic step-by-step thinking. Use this to break down complex problems. Args: {{ \"thought\": \"string\", \"needs_more_thought\": boolean }}

At each step you must:
1. Read the current task context provided to you.
2. Decide on one action or tool call to perform.
3. Execute only one tool at a time (e.g., search, retrieve, write, verify).
4. Observe the result and update your reasoning.
5. Repeat until you believe the task is complete.

Guidelines:
- **SDLC Compliance**: You must follow a strict Software Development Life Cycle:
  1. **Plan**: Analyze the request and existing files. Plan your approach. Use the `sequential_thinking` tool to structure your plan if the task is complex.
  2. **Implement**: Write code, create files, and build the solution.
  3. **Verify**: Test your work. For web apps, YOU MUST write and run automated tests (e.g., using Puppeteer via `run_command`) to check for console errors, blank screens, and correct functionality.
- **Self-Correction**: If verification fails, analyze the error, fix the code, and verify again.
- **Browser Automation**: You have access to `node` and `npm`. Use them to install testing libraries (like `puppeteer`) and run verification scripts.
- Focus on tactical execution using the immediate, curated context provided.
- Be explicit in reasoning: explain why the chosen tool is relevant.
- Stop execution and return your final answer ONLY when verification passes.
- IMPORTANT: Do NOT use the \"functions.\" prefix for tool names. Use the tool name exactly as listed above (e.g., \"read_file\", not \"functions.read_file\").
- **JSON Escaping**: When using `write_file`, you MUST escape newlines in the content string as `\\n`. Do NOT use literal newlines in the JSON argument.
- **Closing Tags**: You MUST close every `<tool_call>` with `</tool_call>`. Do NOT use `</think>` to close a tool call.

**TRUTH-SEEKING & ROBUST VERIFICATION:**
- **Assume Nothing**: Do not assume your code works. You must PROVE it works with evidence.
- **Compile First**: If using a compiled language (Rust, Go, etc.), you MUST run the compiler/build step before running tests.
- **Robust Assertions**: When writing tests, do NOT rely on fragile string matching (e.g., `assert \"foo\" in stdout`).
  - **Parse Outputs**: You MUST parse structured outputs (JSON, XML) into objects and assert on data fields.
  - **Exit Codes**: Always check exit codes.
- **Negative Testing**: Where possible, verify that invalid inputs fail as expected.
- **Self-Correction**: If a tool fails, analyze the error message carefully. Do NOT blindly retry the same command. Fix the root cause.

**CRITICAL - Autonomous Execution:**
- **Execute ALL SDLC phases WITHOUT waiting for approval**
- Phase transitions are AUTOMATIC - proceed immediately after completing each phase
- **DO NOT create only a PLAN and stop** - you must IMPLEMENT the plan
- **DO NOT create only CODE and stop** - you must TEST the code
- **DO NOT create only TESTS and stop** - you must RUN the tests
- If you create a PLAN.md or design document, IMMEDIATELY proceed to implementation
- Planning is just Phase 1 - you must continue through all phases
- You are AUTONOMOUS - no human approval needed between phases

**Task Completion Checklist** (ALL must be true before stopping):
- [ ] All required code files created
- [ ] All tests written AND executed (not just created)
- [ ] All tests passed successfully
- [ ] All documentation created (README.md, etc.)
- [ ] All SDLC phases completed (Plan → Implement → Test → Document → Verify)

Output Format:
<think>
Your reasoning here.
</think>
<tool_call name=\"tool_name\">
{{ \"arg\": \"value\" }}
</tool_call>
", model, tool_descriptions) 
            },
            Message { role: Role::User, content: context.to_string() },
        ];

        let request = CompletionRequest {
            messages,
            context: None,
            system_prompt: None,
            temperature: Some(0.0),
            model: Some(model.to_string()),
        };

        let response = provider.send_message(request).await.map_err(|e| e.to_string())?;
        
        // Parse response for tool calls
        let (thought, tool_calls) = self.parse_response(&response);
        
        let observation = if !tool_calls.is_empty() {
            let mut observations = Vec::new();
            for (name, args) in tool_calls {
                let obs = if let Some(tool) = self.tool_registry.get(&name) {
                    match serde_json::from_str(&args) {
                        Ok(parsed_args) => tool.execute(parsed_args).unwrap_or_else(|e| format!("Error: {}", e)),
                        Err(e) => format!("Error parsing arguments for tool '{}': {}", name, e),
                    }
                } else {
                    format!("Error: Tool '{}' not found", name)
                };
                observations.push(obs);
            }
            observations.join("\n\n")
        } else {
            "No tool call found. Waiting for next instruction.".to_string()
        };
        
        Ok(StepResult {
            thought,
            action: response, // Store full response as action for now
            observation,
        })
    }

    fn parse_response(&self, response: &str) -> (String, Vec<(String, String)>) {
        let thought_start = response.find("<think>").map(|i| i + 7);
        let thought_end = response.find("</think>");
        
        let thought = if let (Some(start), Some(end)) = (thought_start, thought_end) {
            response[start..end].trim().to_string()
        } else {
            // Fallback: grab text before first tool call
            let tool_start = response.find("<tool_call name=")
                .or_else(|| response.find("<|tool_call_begin|>"));
                
            if let Some(start) = tool_start {
                response[..start].trim().to_string()
            } else {
                // If no tool call, the whole response is thought/text
                response.trim().to_string()
            }
        };

        let mut tool_calls = Vec::new();
        let mut current_pos = 0;

        while let Some(start) = response[current_pos..].find("<tool_call name=\"") {
            let start_idx = current_pos + start;
            let prefix = "<tool_call name=\"";
            
            let name_start = start_idx + prefix.len();
            if let Some(name_end_rel) = response[name_start..].find("\"") {
                let name_end = name_start + name_end_rel;
                let name = response[name_start..name_end].to_string();
                
                if let Some(content_start_rel) = response[name_end..].find(">") {
                    let content_start = name_end + content_start_rel + 1;
                    
                    // Try to find closing tag
                    let tool_end_idx = response[content_start..].find("</tool_call>")
                        .or_else(|| response[content_start..].find("</think>"));

                    let args = if let Some(tool_end_rel) = tool_end_idx {
                        let tool_end = content_start + tool_end_rel;
                        // Determine which tag was found to advance current_pos correctly
                        let tag_len = if response[tool_end..].starts_with("</tool_call>") {
                            "</tool_call>".len()
                        } else {
                            "</think>".len()
                        };
                        current_pos = tool_end + tag_len;
                        clean_tool_args(&response[content_start..tool_end])
                    } else {
                        // Fallback: If no closing tag, take until end of string or next tool call
                        // This handles truncated responses or missing closing tags
                        let rest = &response[content_start..];
                        // If there's another tool call starting, stop there
                        if let Some(next_tool) = rest.find("<tool_call") {
                             current_pos = content_start + next_tool;
                             clean_tool_args(&rest[..next_tool])
                        } else {
                             current_pos = response.len();
                             clean_tool_args(rest)
                        }
                    };
                    
                    tool_calls.push((name, args));
                } else {
                     break; // Malformed
                }
            } else {
                break; // Malformed
            }
        }

        // Also try native format if no XML calls found (or mixed?)
        // For now, let's assume one format per response.
        if tool_calls.is_empty() {
             if let Some(start) = response.find("<|tool_call_begin|>") {
                let name_start = start + "<|tool_call_begin|>".len();
                if let Some(name_end) = response[name_start..].find(":") { // Find separator before ID
                    let name_end = name_start + name_end;
                    let raw_name = response[name_start..name_end].trim();
                    let name = raw_name.strip_prefix("functions.").unwrap_or(raw_name).to_string();

                    let args_start_marker = "<|tool_call_argument_begin|>";
                    if let Some(args_start) = response.find(args_start_marker) {
                        let args_start = args_start + args_start_marker.len();
                        if let Some(args_end) = response.find("<|tool_call_end|>") {
                            let args = clean_tool_args(&response[args_start..args_end]);
                            tool_calls.push((name, args));
                        }
                    }
                }
            }
        }

        (thought, tool_calls)
    }
}

fn clean_tool_args(args: &str) -> String {
    let args = args.trim();
    if args.starts_with("```") {
        if let Some(end_fence) = args.rfind("```") {
            if end_fence > 0 {
                // Find newline after first fence (e.g. ```json\n)
                if let Some(newline_pos) = args[..end_fence].find('\n') {
                    return args[newline_pos+1..end_fence].trim().to_string();
                }
                // If no newline (e.g. ```{...}```), just strip first 3 chars
                return args[3..end_fence].trim().to_string();
            }
        }
    }
    args.to_string()
}

struct MetaThinker {
}

impl MetaThinker {
    pub fn new() -> Self {
        Self {}
    }

    pub async fn monitor(
        &self,
        history: &[StepResult],
        context_brief: &str,
        provider: &Arc<dyn LLMProvider>,
        model: &str,
    ) -> Result<MetaDecision, String> {
        // Construct prompt with history and current context brief
        let history_str = history.iter().enumerate().map(|(i, step)| {
            format!("Step {}:\nThought: {}\nAction: {}\nObservation: {}\n", i + 1, step.thought, step.action, step.observation)
        }).collect::<Vec<String>>().join("\n---\n");

        let messages = vec![
             Message { 
                 role: Role::System, 
                 content: format!("You are the Meta-Thinker (Model: {}). You conceptually run asynchronously in parallel to the Main Agent. Your job is to monitor execution for strategic anomalies and completion signals.
Your tasks:
1. Continuously observe the Main Agent's actions and outputs.
2. Detect anomalies such as repeated failures, contradictions, or wasted effort.
3. Detect signals that suggest the task may be complete.
4. When triggered, decide whether to:
    - CONTINUE: persist with the current plan.
    - REFLECT: request a focused self-correction on recent mistakes.
    - PIVOT: redirect to a new strategy when the current approach is a dead end.
    - VERIFY: request explicit verification of a specific claim or intermediate result.
    - STOP: terminate execution and return the final answer.

Guidelines:
- Your monitoring is lightweight and only activates when necessary.
- Issue intervention or stopping signals explicitly when you detect risk of compounding errors or when the answer is already sufficient.
- Do not duplicate the Main Agent's work; focus on higher-level judgment.

**CRITICAL - STOP Decision Criteria:**
- **ONLY issue STOP when ALL deliverables are created AND verified**
- Planning completion (PLAN.md) is NOT task completion
- You must see ACTUAL CODE FILES created (e.g., calculator.py, not just planning docs)
- You must see TESTS EXECUTED with real output (e.g., pytest ran successfully, not just test files created)
- You must see DOCUMENTATION created (README.md with actual content)
- **DO NOT STOP** if agent just finished planning or design phase
- **DO NOT STOP** if agent says \"ready for approval\" or \"ready for review\"
- **Agent works autonomously** - no human approval needed between SDLC phases
- Only STOP when verification passes and user's original request is fully satisfied

**Loop & Anomaly Detection:**
- If the agent tries the same tool with same args 3 times -> PIVOT
- If the agent is stuck in a loop of errors -> REFLECT
- If the agent is planning for > 3 turns without implementing -> PIVOT
- If the agent is not using `sequential_thinking` for complex tasks -> REFLECT

**Examples of PREMATURE stops to AVOID:**
- ❌ \"PLAN.md created, ready for approval\" → CONTINUE (need implementation!)
- ❌ \"Design complete, ready to implement\" → CONTINUE (need code!)
- ❌ \"Code written, ready to test\" → CONTINUE (need to run tests!)
- ❌ \"Tests created, ready to verify\" → CONTINUE (need to execute tests!)

**Examples of VALID stops:**
- ✅ \"All files created, tests executed and passed, README exists\" → STOP
- ✅ \"Verification complete, all requirements met\" → STOP

Output Format:
<decision>CONTINUE</decision>
OR
<decision>REFLECT</decision>
<feedback>Your feedback here (e.g., strategy drift, dead loop, local correction needed).</feedback>
OR
<decision>PIVOT</decision>
<feedback>Why the current strategy is a dead end and how to pivot.</feedback>
OR
<decision>VERIFY</decision>
<feedback>What must be verified and why (e.g., recompute a quantity, re-check a source).</feedback>
OR
<decision>STOP</decision>
<answer>The final answer here.</answer>
", model) 
             },
             Message { role: Role::User, content: format!("Context this turn:\n{}\n\nHistory so far:\n{}", context_brief, history_str) },
        ];
        
        let request = CompletionRequest {
            messages,
            context: None,
            system_prompt: None,
            temperature: Some(0.0),
            model: Some(model.to_string()),
        };

        let response = provider.send_message(request).await.map_err(|e| e.to_string())?;

        if response.contains("<decision>STOP</decision>") {
            let start = response.find("<answer>").map(|i| i + 8).unwrap_or(0);
            let end = response.find("</answer>").unwrap_or(response.len());
            let answer = response[start..end].trim().to_string();
            Ok(MetaDecision::Stop(answer))
        } else if response.contains("<decision>PIVOT</decision>") {
            let start = response.find("<feedback>").map(|i| i + 10).unwrap_or(0);
            let end = response.find("</feedback>").unwrap_or(response.len());
            let feedback = response[start..end].trim().to_string();
            Ok(MetaDecision::Pivot(feedback))
        } else if response.contains("<decision>VERIFY</decision>") {
            let start = response.find("<feedback>").map(|i| i + 10).unwrap_or(0);
            let end = response.find("</feedback>").unwrap_or(response.len());
            let feedback = response[start..end].trim().to_string();
            Ok(MetaDecision::Verify(feedback))
        } else if response.contains("<decision>REFLECT</decision>") {
            let start = response.find("<feedback>").map(|i| i + 10).unwrap_or(0);
            let end = response.find("</feedback>").unwrap_or(response.len());
            let feedback = response[start..end].trim().to_string();
            Ok(MetaDecision::Reflect(feedback))
        } else {
            Ok(MetaDecision::Continue)
        }
    }
}





#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub thought: String,
    pub action: String,
    pub observation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MetaDecision {
    Continue,
    Stop(String),
    Reflect(String),
    Pivot(String),
    Verify(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notes {
    pub content: Vec<String>,
}

struct AnswerSynthesizer {}

impl AnswerSynthesizer {
    pub fn new() -> Self {
        Self {}
    }

    pub async fn synthesize(&self, query: &str, history: &[StepResult], notes: &Notes, provider: &Arc<dyn LLMProvider>, model: &str) -> Result<String, String> {
        let history_str = history.iter().enumerate().map(|(i, step)| {
            format!("Step {}:\nThought: {}\nAction: {}\nObservation: {}\n", i + 1, step.thought, step.action, step.observation)
        }).collect::<Vec<String>>().join("\n---\n");
        
        let notes_str = notes.content.join("\n");

        let messages = vec![
            Message {
                role: Role::System,
                content: "You are the Answer Synthesizer. Your goal is to produce a final, comprehensive answer to the user's query based on the accumulated notes and the final execution trace.

Output Format:
<answer>
Your final answer here.
</answer>".to_string()
            },
            Message {
                role: Role::User,
                content: format!("Query: {}\n\nNotes:\n{}\n\nFinal Trace:\n{}", query, notes_str, history_str)
            }
        ];

        let request = CompletionRequest {
            messages,
            context: None,
            system_prompt: None,
            temperature: Some(0.0),
            model: Some(model.to_string()),
        };

        let response = provider.send_message(request).await.map_err(|e| e.to_string())?;
        
        let start = response.find("<answer>").map(|i| i + 8).unwrap_or(0);
        let end = response.find("</answer>").unwrap_or(response.len());
        Ok(response[start..end].trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use crate::error::ProviderError;
    use crate::rag::{ContextStore, NoteChunk, EmbeddingProvider};
    use tokio::sync::Mutex;


    struct MockProvider {
        responses: Mutex<Vec<String>>,
    }

    impl MockProvider {
        fn new(responses: Vec<String>) -> Self {
            Self {
                responses: Mutex::new(responses),
            }
        }
    }

    #[async_trait]
    impl LLMProvider for MockProvider {
        async fn send_message(&self, _request: CompletionRequest) -> Result<String, ProviderError> {
            let mut responses = self.responses.lock().await;
            if !responses.is_empty() {
                Ok(responses.remove(0))
            } else {
                Ok("".to_string())
            }
        }
        
        async fn send_message_streaming(
            &self,
            _request: CompletionRequest,
            _tx: tokio::sync::mpsc::Sender<String>,
        ) -> Result<String, ProviderError> {
            Ok("".to_string())
        }
    }

    #[test]
    fn test_parse_response_with_wrong_closing_tag() {
        let tool_registry = Arc::new(ToolRegistry::new());
        let agent = MainAgent::new(tool_registry);
        
        let response = r#"<think>
Some reasoning here.
</think>
<tool_call name="write_file">
{ "path": "style.css", "content": "body {}" }
</think>"#;

        let (thought, tool_calls) = agent.parse_response(response);
        
        assert_eq!(thought, "Some reasoning here.");
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].0, "write_file");
        
        // This should fail if the parser includes </think> in the args
        let parsed: serde_json::Value = serde_json::from_str(&tool_calls[0].1).expect("Failed to parse args as JSON");
        assert_eq!(parsed["path"], "style.css");
    }

    struct MockContextStore;
    #[async_trait]
    impl ContextStore for MockContextStore {
        async fn upsert_notes(&self, _session_id: &str, _notes: &[NoteChunk], _embedding_provider: &Arc<dyn EmbeddingProvider>) -> Result<(), String> {
            Ok(())
        }
        async fn retrieve_notes(&self, _session_id: &str, _query: &str, _top_k: usize, _embedding_provider: &Arc<dyn EmbeddingProvider>) -> Result<Vec<NoteChunk>, String> {
            Ok(vec![NoteChunk { text: "Mock note".to_string(), turn: 0, source: "mock".to_string(), score: 1.0 }])
        }
        async fn delete_session_notes(&self, _session_id: &str) -> Result<usize, String> {
            Ok(0)
        }
    }

    struct MockEmbeddingProvider;
    #[async_trait]
    impl EmbeddingProvider for MockEmbeddingProvider {
        async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
            Ok(vec![vec![0.0; 1024]; texts.len()])
        }
    }

    use crate::audit::NoOpLogger;

    #[tokio::test]
    async fn test_compass_flow() {
        let responses = vec![
            // Context Manager initialize (upsert) - no LLM call in initialize for now, but if there was...
            // Main Agent thought and action
            "<think>I need to search.</think><tool_call name=\"test_tool\">{\"arg\":\"test\"}</tool_call>".to_string(),
            // Meta-Thinker decision
            "<decision>CONTINUE</decision>".to_string(),
            // Context Manager update (with new notes)
            "Task: Test\nMost-Recent Evidence:\n- Done\n<new_notes>\n- Note 1\n</new_notes>".to_string(),
            // Main Agent thought and action (stop)
            "<think>I am done.</think>".to_string(),
            // Meta-Thinker decision (stop)
            "<decision>STOP</decision>".to_string(),
            // Answer Synthesizer
            "<answer>42</answer>".to_string(),
        ];

        let provider = Arc::new(MockProvider::new(responses));
        let mut tool_registry = ToolRegistry::new();
        
        struct TestTool;
        impl crate::tools::Tool for TestTool {
            fn name(&self) -> &str { "test_tool" }
            fn description(&self) -> &str { "Test tool" }
            fn execute(&self, _args: serde_json::Value) -> Result<String, String> {
                Ok("Tool executed".to_string())
            }
        }
        tool_registry.register(Box::new(TestTool));

        let config = CompassConfig {
            max_turns: 5,
            main_agent_model: "test".to_string(),
            meta_thinker_model: "test".to_string(),
            context_manager_model: "test".to_string(),
            session_id: "test-session".to_string(),
            qdrant_url: "http://localhost:6333".to_string(),
            qdrant_collection: "test".to_string(),
            qdrant_api_key: None,
            chutes_api_token: "test".to_string(),
        };

        let mut agent = CompassAgent::new(
            config, 
            provider, 
            Arc::new(tool_registry),
            Arc::new(MockContextStore),
            Arc::new(MockEmbeddingProvider),
            Arc::new(NoOpLogger)
        );
        let result = agent.run("Test query".to_string(), None).await;

        assert_eq!(result.unwrap(), "42");
    }
    #[tokio::test]
    async fn test_compass_native_tool_call() {
        let responses = vec![
            // Main Agent thought and action (native format)
            "<|tool_calls_section_begin|> <|tool_call_begin|> test_tool:call_1 <|tool_call_argument_begin|> {\"arg\":\"native\"} <|tool_call_end|> <|tool_calls_section_end|>".to_string(),
            // Meta-Thinker decision
            "<decision>STOP</decision>".to_string(),
            // Answer Synthesizer
            "<answer>Native tool worked</answer>".to_string(),
        ];

        let provider = Arc::new(MockProvider::new(responses));
        let mut tool_registry = ToolRegistry::new();
        
        struct TestTool;
        impl crate::tools::Tool for TestTool {
            fn name(&self) -> &str { "test_tool" }
            fn description(&self) -> &str { "Test tool" }
            fn execute(&self, args: serde_json::Value) -> Result<String, String> {
                if args["arg"] == "native" {
                    Ok("Native tool executed".to_string())
                } else {
                    Err("Wrong args".to_string())
                }
            }
        }
        tool_registry.register(Box::new(TestTool));

        let config = CompassConfig {
            max_turns: 5,
            main_agent_model: "test".to_string(),
            meta_thinker_model: "test".to_string(),
            context_manager_model: "test".to_string(),
            session_id: "test-session-native".to_string(),
            qdrant_url: "http://localhost:6333".to_string(),
            qdrant_collection: "test".to_string(),
            qdrant_api_key: None,
            chutes_api_token: "test".to_string(),
        };

        let mut agent = CompassAgent::new(
            config, 
            provider, 
            Arc::new(tool_registry),
            Arc::new(MockContextStore),
            Arc::new(MockEmbeddingProvider),
            Arc::new(NoOpLogger)
        );
        
        let result = agent.run("Test query".to_string(), None).await;
        assert_eq!(result.unwrap(), "Native tool worked");
    }

    #[tokio::test]
    async fn test_compass_missing_think_tag() {
        let responses = vec![
            // Main Agent thought (implicit) and action
            "I think I should search. <tool_call name=\"test_tool\">{\"arg\":\"implicit\"}</tool_call>".to_string(),
            // Meta-Thinker decision
            "<decision>STOP</decision>".to_string(),
            // Answer Synthesizer
            "<answer>Found it</answer>".to_string(),
        ];

        let provider = Arc::new(MockProvider::new(responses));
        let mut tool_registry = ToolRegistry::new();
        
        struct TestTool;
        impl crate::tools::Tool for TestTool {
            fn name(&self) -> &str { "test_tool" }
            fn description(&self) -> &str { "Test tool" }
            fn execute(&self, _args: serde_json::Value) -> Result<String, String> {
                Ok("Executed".to_string())
            }
        }
        tool_registry.register(Box::new(TestTool));

        let config = CompassConfig {
            max_turns: 5,
            main_agent_model: "test".to_string(),
            meta_thinker_model: "test".to_string(),
            context_manager_model: "test".to_string(),
            session_id: "test-session-implicit".to_string(),
            qdrant_url: "mock".to_string(),
            qdrant_collection: "test".to_string(),
            qdrant_api_key: None,
            chutes_api_token: "test".to_string(),
        };

        let mut agent = CompassAgent::new(
            config, 
            provider, 
            Arc::new(tool_registry),
            Arc::new(MockContextStore),
            Arc::new(MockEmbeddingProvider),
            Arc::new(NoOpLogger)
        );
        
        let result = agent.run("Test query".to_string(), None).await;
        assert_eq!(result.unwrap(), "Found it");
        
        // Verify the thought was captured
        assert_eq!(agent.history[0].thought, "I think I should search.");
    }

}
