# ADR 001: Small Model Intelligence & Robust CLI Architecture

## Status
Proposed

## Context
Unlike Claude Code or Gemini CLI, `ycode` targets open-source, locally-run models (e.g., Llama 3 8B, Qwen 2.5 Coder 7B). These models have lower reasoning capabilities and slower processing speeds on consumer hardware compared to massive frontier models.

## Decision
We will implement a "System of Intelligence" that surrounds the LLM with deterministic guardrails and specialized layers to ensure speed and reliability.

### 1. Two-Layer UI Architecture
*   **Conversation Layer**: Natural language interaction and explicit reasoning (thoughts).
*   **Activity Layer**: Structured tracking of tool state, execution, and results.
*   **Rationale**: Reduces cognitive load and separates "what the agent says" from "what the agent does."

### 2. Multi-Model Orchestration (Future)
*   Use ultra-small models (1B - 3B) for tool selection and speculation.
*   Use larger models (7B+) only for complex code generation or final summaries.

### 3. Pre-emptive Context Injection
*   Automatically fetch file contents mentioned in user prompts before the model sees them.
*   Inject project metadata (git branch, directory structure) into every turn to ground the model.

### 4. Deterministic Guardrails
*   **Auto-Linting**: Automatically run project-specific checks (e.g., `tsc`) after edits.
*   **Action Templates**: Provide structured examples for common tasks (serving, testing) to prevent syntax errors in tool calls.

## Consequences
*   **Positive**: Higher success rate for complex tasks on small models; faster perceived response times.
*   **Negative**: Higher complexity in the agent loop; potentially more API calls to the local LLM runner.
