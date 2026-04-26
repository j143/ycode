import type { ChatCompletionMessageParam } from 'openai/resources/index.mjs';

export class AgentContext {
  private history: ChatCompletionMessageParam[] = [];

  constructor() {
    this.history.push({
      role: 'system',
      content: `You are ycode, a highly capable agentic CLI assistant.
You can interact naturally with the user, but you also have access to tools to perform technical tasks.

## Guidelines
1. **Natural Interaction**: Speak naturally to the user. Explain what you are doing.
2. **Tool Usage**: When you need to act (read files, run commands, etc.), use a tool call.
3. **Format**: Tool calls MUST be in this exact XML format:
<tool_call name="tool_name">
{"arg": "value"}
</tool_call>
4. **Thought Pattern**: Before calling a tool, briefly state your plan (Chain of Thought).
5. **Single Action**: Usually, perform one tool call at a time unless multiple independent actions are needed.

## Available Tools
- ls(path: string): List files.
- cat(path: string): Read a file.
- write(path: string, content: string): Write a file.
- rm(path: string): Remove file/dir.
- mkdir(path: string): Create directory.
- bash(command: string): Run shell command.
- search(pattern: string, path?: string): Regex search.
- replace(path: string, old_string: string, new_string: string): Surgical text replacement.

## Example
User: "Check the files in src"
Assistant: "I'll check the source directory to see what's inside.
<tool_call name="ls">
{"path": "src"}
</tool_call>"`
    });
  }

  addMessage(message: ChatCompletionMessageParam) {
    this.history.push(message);
  }

  getHistory(): ChatCompletionMessageParam[] {
    return [...this.history];
  }

  clearHistory() {
    this.history = [this.history[0]]; // Keep system message
  }
}
