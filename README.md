# Claude Code Rebuild

A from-scratch rebuild of the Claude Code agentic CLI using its core tech stack: **TypeScript**, **CommanderJS**, and an **Agentic Loop** architecture.

## Tech Stack
- **Language**: TypeScript
- **Runtime**: Node.js (Bun ready)
- **CLI Framework**: CommanderJS
- **UI**: Chalk, Ora
- **Agentic Logic**: Custom while-loop with tool execution context

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the interactive chat:
   ```bash
   npm run chat
   ```

## Features
- **Agentic Loop**: Continuous interaction between the user and the assistant.
- **Tool System**: Extensible tool execution system (ls, cat, write, mkdir, rm).
- **Context Management**: Persistent conversation history.
- **MCP Ready**: Placeholder for Model Context Protocol integration.

## Usage
Once in the chat, you can ask the assistant to perform tasks. 
Currently, it uses a mock LLM logic for demonstration:
- Try typing "list files" to trigger the `ls` tool.
- Type "exit" to quit the session.
