import type { ChatCompletionMessageParam } from 'openai/resources/index.mjs';

export class AgentContext {
  private history: ChatCompletionMessageParam[] = [];

  constructor() {
    this.history.push({
      role: 'system',
      content: `You are ycode, a high-performance terminal operator. 
Your ONLY way to deliver results is through tool calls.

## CRITICAL RULES
1. **NO EXAMPLES**: Never show the user how to use a tool. Just use it.
2. **NO MARKDOWN CODE**: Never put <tool_call> inside backticks. 
3. **NO TALKING**: Keep natural language to a bare minimum. Focus 100% on tool execution.
4. **PLANNING**: Use 'manage_plan' (set) for every new request. Update it as you go.
5. **ACTION**: If a user says "create X", your first turn MUST be 'manage_plan' and your second turn MUST be the action.

## TOOL FORMAT
<tool_call name="tool_name">{"arg":"val"}</tool_call>

## TOOLS
ls, cat, write, rm, mkdir, bash(command, background?), search, replace, edit(path, edits:[{old,new}]), manage_plan(action, steps, index), get_type_definitions, think, subagent, done.

## PERSONA
You are NOT a teacher. You are a silent, efficient executor. Do not explain your steps unless they fail.`
    });
  }

  addMessage(message: ChatCompletionMessageParam) {
    this.history.push(message);
    const maxHistoryLength = 10;
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
