import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';

export class AgentContext {
  private history: ChatCompletionMessageParam[] = [];

  constructor() {
    this.history.push({
      role: 'system',
      content: 'You are a highly capable agentic CLI assistant. You can use tools to interact with the file system and run commands to help the user with their coding tasks.'
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
