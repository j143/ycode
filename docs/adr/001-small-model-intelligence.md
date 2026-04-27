# ADR 001: Robust Agentic Architecture for Open-Source Models

## Status
Active

## Context
Standard agentic CLIs (Claude Code, Gemini CLI) rely on massive frontier models with high zero-shot reasoning. `ycode` targets open-source, locally-run models (e.g., Llama 3, Qwen 2.5 Coder). These models require a more structured "System of Intelligence" to reach a 95%+ execution success rate.

## Decisions

### 1. Two-Layer UI & State Management
*   **Layer 1 (Conversation)**: Natural language chat and explicit reasoning (`think` blocks).
*   **Layer 2 (Activity/Mission Control)**: Structured tracking of tool execution, background processes, and persistent state.
*   **Rationale**: Separates "Human-Agent Interaction" from "Agent-Environment Action," reducing cognitive noise in the main context window.

### 2. Plan-as-State Architecture
*   **Mechanism**: A dedicated `manage_plan` tool allows the agent to set and update a persistent roadmap.
*   **Persistence**: The plan is stored in the system state rather than relying on the volatile chat history.
*   **Rationale**: Prevents "Intent Decay" where the model forgets the ultimate objective while focused on specific technical tasks.

### 3. Pre-emptive Context Injection
*   **Mechanism**: The system scans user prompts for file paths and automatically `cat`s them into the context before the model generates a response.
*   **Rationale**: Saves "turns" and prevents hallucinations by grounding the model in the actual code before it attempts an edit.

### 4. High-Fidelity Environment Feedback
*   **Fuzzy Edit Recovery**: If a surgical edit fails, the system performs a fuzzy search and returns the top 3 matching lines as "Suggestions."
*   **Symbolic Mapping**: The `get_type_definitions` tool provides a macro view of project data structures (interfaces, classes) to prevent logic errors.
*   **Rationale**: Provides the agent with the same "Symbolic Precision" that a human developer gets from an IDE.

### 5. Deterministic Guardrails
*   **Auto-Linting**: The system automatically executes `npm run build` (or similar) after file modifications.
*   **Strict Output Enforcement**: The system intercepts assistant messages containing code blocks without tool calls and forces the agent to use the appropriate tool.
*   **Rationale**: Prevents the "Chat-as-Output" failure where models provide code as text rather than performing the action.

### 6. Mandatory Planning for Creation
*   **Mechanism**: Any task that modifies or creates files is considered "complex" and requires a `manage_plan` call.
*   **Rationale**: Ensures the agent considers the implications (location, name, configuration) before writing data.

## Consequences
*   **Execution Rate**: Moves the model from "Guess-and-Check" to "Plan-and-Verify," significantly increasing reliability.
*   **Transparency**: The user has a live view of the agent's progress via the Mission Control UI.
*   **Speed**: Faster perceived time-to-completion by eliminating redundant "What's in this file?" turns.
