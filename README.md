# ycode

A from-scratch rebuild of the Claude Code agentic CLI using local and open-source models for accessibility.

## Tech Stack
- **Language**: TypeScript
- **Runtime**: Node.js
- **CLI Framework**: CommanderJS
- **LLM Orchestration**: OpenAI SDK (compatible with Ollama, Groq, OpenRouter)
- **UI**: Chalk, Ora

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   Copy `.env.example` to `.env` and adjust the settings. By default, it looks for a local Ollama instance.
   ```bash
   cp .env.example .env
   ```

3. Start the interactive chat:
   ```bash
   npm run chat
   ```

## Features
- **Agentic Loop**: Autonomous multi-step reasoning and execution.
- **Local-First**: Designed to work with Ollama (e.g., Qwen2.5-Coder, Llama 3).
- **Tool System**: Extensible tool execution system (ls, cat, write, mkdir, rm).
- **Open-Compatible**: Easily switch to Groq or OpenRouter for high-end free models.

