use ailoy::{
    agent::AgentBuilder,
    lang_model::ResponseFormat,
    message::{Message, Part, Role},
    to_value,
};
use serde::Deserialize;
use tokio_stream::StreamExt;

const ROUTER_INSTRUCTION: &str = r#"Your objective is to choose the most appropriate agent(s) to answer the user's query.

## Candidate agents
- `trivial`: A simple agent that has no additional features, just LLM.
- `rag`: Specialized in answering users' questions. It can use external sources or internal knowledge if needed.
- `deep_research`: Can create structured reports for given topics.
- `cowork`: Plans and executes tasks, including exploring/editing files, running code, and producing downloadable artifacts.

## Rules

### Selecting agents
Route to `trivial` only for trivial tasks: greetings, pure noise, or refusals to act.
Route to `rag` for direct questions that can be answered in a single turn.
If you think searching for materials or references is necessary, always use `rag` instead of `trivial`.
Route to `deep_research` when the user expects:
 - a structured report,
 - extensive comparison,
 - literature or research synthesis,
 - or investigation across many sources or topics.
`cowork` is the only agent that can control the local file system. Therefore, if access to local files is required, route to `cowork`.
We believe `cowork` has the most powerful capabilities, including other agent's capabilities. Therefore, tasks that may be difficult for other agents to solve should be routed to `cowork`.

### Response
Use the user's input as-is for the query to be routed.
Correct it only when there is an obvious typo.
The `reason` must be written in the language the user used in the query.

## Pipelining
If the user's query involves more than one objective, decompose it into sub-queries and pipeline one agent's result to other agents.
When pipelining is applied, the downstream agent treats the generated sub-query as the user's input. The preceding agent's input and output are appended to that input as prior context.
You have to pipeline them only if a pipelining path is available. If none exists, you may find the closest agent.
Do not pipeline a query that has a single intent, even when it is list-like, lengthy, or asks about multiple items. Assign it to one agent as-is.
Each sub-query is the corresponding part of the user's request, kept close to the original wording.

Available pipelines are:
- `rag` → `cowork`
- `deep_research` → `cowork`

Prefer a single agent whenever possible.
Pipelines should be rare and only used when the request clearly contains multiple separable objectives that map naturally to different agents.

## Response format
Always respond with a single JSON object containing a `steps` array. Each step has `agent`, `query`, and `reason` fields.

When a single agent handles the whole request, return one step whose `query` is the user's original request kept close to the original wording.

When a pipeline applies, return one step per stage in execution order.

```
{"steps": [{"agent": "<selected agent name>", "query": "...", "reason": "..."}, ...]}
```
"#;

#[derive(Debug, Deserialize)]
pub struct Step {
    pub agent: String,
    #[serde(rename = "query")]
    pub input: String,

    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Plan {
    pub steps: Vec<Step>,
}

pub async fn run_gpt_router_agent(user_input: impl Into<String>) -> anyhow::Result<Plan> {
    run_router_agent("openai/gpt-5.4-nano", user_input).await
}

pub async fn run_claude_router_agent(user_input: impl Into<String>) -> anyhow::Result<Plan> {
    run_router_agent("anthropic/claude-haiku-4-5", user_input).await
}

async fn run_router_agent(model: &str, user_input: impl Into<String>) -> anyhow::Result<Plan> {
    let user_input: String = user_input.into();
    let schema = to_value!({
        "type": "object",
        "properties": {
            "steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "agent": { "type": "string", "description": "Agent assigned to this step" },
                        "query": { "type": "string", "description": "Sub-request for the agent" },
                        "reason": { "type": "string", "description": "Short reason for assigning this step to the agent" }
                    },
                    "required": ["agent", "query", "reason"],
                    "additionalProperties": false
                }
            }
        },
        "required": ["steps"],
        "additionalProperties": false
    });
    let mut agent = AgentBuilder::new(model)
        .instruction(ROUTER_INSTRUCTION)
        .response_format(ResponseFormat::json_schema(schema)?)
        .build()?;

    let msg = Message::new(Role::User).with_contents([Part::text(user_input)]);
    let mut stream = agent.run(msg);
    while let Some(event) = stream.next().await {
        let _ = event?;
    }
    drop(stream);

    let last = agent
        .get_history()
        .iter()
        .rev()
        .find(|m| m.role == Role::Assistant)
        .ok_or_else(|| anyhow::anyhow!("router produced no assistant message"))?;

    let raw = last
        .contents
        .iter()
        .filter_map(|p| p.as_text())
        .collect::<Vec<_>>()
        .join("");

    let plan: Plan = serde_json::from_str(&raw)?;
    Ok(plan)
}
