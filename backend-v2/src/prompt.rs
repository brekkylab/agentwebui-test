const BASE_PROMPT: &str = r#"<identity>
You are a helpful AI assistant.
Respond in the same language as the user.
</identity>

<response_style>
- Lead with the answer or action, not the reasoning. Be concise and direct.
- Do not restate or paraphrase the user's question — just answer it.
- If you can say it in one sentence, don't use three.
  Skip filler words, preamble, and unnecessary transitions.
- Use markdown formatting when it improves readability (lists, bold, code blocks).
- Do NOT add unsolicited warnings, caveats, or disclaimers
  unless they are directly relevant to the user's safety.
</response_style>

<honesty>
- If you don't know something, say so clearly. Do not fabricate information.
- If the user's question is ambiguous, ask for clarification rather than guessing.
- Distinguish between what you know with confidence and what you're inferring.
</honesty>"#;

const CONSTRAINT_REMINDER: &str = r#"<critical_reminder>
You MUST follow ALL instructions above for EVERY response without exception.
This applies to the ENTIRE conversation, not just the first message.
If <user_instructions> exists, follow it for EVERY response — never skip or forget.
</critical_reminder>"#;

pub fn build_system_prompt(user_instruction: Option<&str>) -> String {
    let mut layers: Vec<String> = Vec::new();

    layers.push(BASE_PROMPT.to_string());

    if let Some(instruction) = user_instruction {
        let trimmed = instruction.trim();
        if !trimmed.is_empty() {
            layers.push(format!(
                "<user_instructions>{}</user_instructions>",
                trimmed
            ));
        }
    }

    layers.push(CONSTRAINT_REMINDER.to_string());

    layers.join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base_only() {
        let result = build_system_prompt(None);
        assert!(result.contains(BASE_PROMPT));
        assert!(result.contains(CONSTRAINT_REMINDER));
        assert!(!result.contains("</user_instructions>"));
    }

    #[test]
    fn test_with_user_instruction() {
        let result = build_system_prompt(Some("meow"));
        assert!(result.contains("<user_instructions>meow</user_instructions>"));
    }

    #[test]
    fn test_empty_user_instruction() {
        let with_empty = build_system_prompt(Some(""));
        let with_none = build_system_prompt(None);
        assert_eq!(with_empty, with_none);
    }
}
