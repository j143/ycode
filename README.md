# ycode

An agentic CLI designed for local-first software engineering. It implements the "Agentic Loop" architecture—planning, executing, and verifying tasks—using open-source models (via Ollama/Groq) to provide a private, cost-free alternative to paywalled coding assistants.

## The Core Concept: The Loop
ycode operates on a continuous feedback loop:
1. **Perceive**: Receives user intent and current project context.
2. **Reason**: The LLM decides which tools are necessary (ls, cat, write, etc.).
3. **Act**: Executes the tool after user verification.
4. **Observe**: Injects the tool's output back into the conversation for the next reasoning step.

## Technical Stack
- **Runtime**: Node.js (TypeScript)
- **Engine**: OpenAI SDK (Universal bridge for local/open endpoints)
- **Tooling**: Built-in filesystem primitives with a manual permission model.
- **Testing**: Vitest integration for behavioral evaluations (Evals).

## Getting Started

### 1. Prerequisites
Ensure you have a local model runner like [Ollama](https://ollama.com/) or a free API key from [Groq](https://console.groq.com/).

### 2. Configuration
Create a `.env` file (or copy from `.env.example`):
```bash
# Example for local Ollama
API_BASE_URL=http://localhost:11434/v1
API_KEY=ollama
MODEL_NAME=qwen2.5-coder:7b
```

### 3. Installation
```bash
npm install
npm run build
npm link # Optional: run 'ycode' from anywhere
```

## Usage Patterns

### Interactive Chat
Start the agentic session:
```bash
ycode chat
```

### Direct Instruction
Kickstart the loop with a specific prompt:
```bash
ycode chat "List the files in src and tell me what the project does"
```

### Common Tasks
- **Context Gathering**: "Read the README and summarize the setup."
- **Code Generation**: "Create a new utility in src/utils/math.ts that handles Fibonacci sequences."
- **Refactoring**: "Read src/index.ts and suggest improvements for the error handling."

## Security: The Permission Model
ycode follows a **Security-First** approach. For any tool that modifies the filesystem (`write`, `rm`, `mkdir`), the agent will pause and request explicit user confirmation.
```text
[Tool Call]: write({"path":"src/test.ts","content":"..."})
[Permission Request] Allow tool "write" with args {...}? (y/n): 
```

## Development & Testing
Run the integration suite and behavioral evals:
```bash
npm test
```
