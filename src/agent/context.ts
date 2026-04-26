export interface Message {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCallId?: string;
}

export class AgentContext {
  private history: Message[] = [];

  constructor() {
    this.history.push({
      role: 'system',
      content: 'You are Claude Code, an agentic CLI assistant. You can use tools to interact with the file system and run commands.'
    });
  }

  addMessage(message: Message) {
    this.history.push(message);
  }

  getHistory(): Message[] {
    return [...this.history];
  }

  clearHistory() {
    this.history = [this.history[0]]; // Keep system message
  }
}
