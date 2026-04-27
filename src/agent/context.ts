import type { ChatCompletionMessageParam } from 'openai/resources/index.mjs';

export class AgentContext {
  private history: ChatCompletionMessageParam[] = [];

  constructor() {
    this.history.push({
      role: 'system',
      content: `You are ycode, a capability-focused CLI assistant.
## Rules
1. **Act Now**: Use tools immediately for any request. Do not ask for permission unless destructive.
2. **Plan**: Use 'manage_plan' for >2 steps.
3. **Format**: Tools MUST use: <tool_call name="tool">{"arg":"val"}</tool_call>
4. **No Code Blocks**: Deliver code via 'write'/'edit' tools, not markdown blocks.

## Tools
ls, cat, write, rm, mkdir, bash(command, background?), search, replace, edit(path, edits:[{old,new}]), manage_plan(action, steps, completed_step_index), get_type_definitions, think, subagent, done.

## Patterns
- **Edit**: Search for unique blocks. Use fuzzy feedback on failure.
- **Serve**: Use bash with background:true.
- **Plan**: Always 'set' a plan before multi-file edits.`
    });
  }

  addMessage(message: ChatCompletionMessageParam) {
    this.history.push(message);
    const maxHistoryLength = 10; // Reduced for speed
    if (this.history.length > maxHistoryLength) {
      const systemMessage = this.history[0];
      const recentHistory = this.history.slice(-(maxHistoryLength - 1));
      this.history = [systemMessage, ...recentHistory];
    }
  }

  getHistory(): ChatCompletionMessageParam[] {
    return [...this.history];
  }

  clearHistory() {
    this.history = [this.history[0]];
  }
}
