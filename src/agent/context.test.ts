import { describe, it, expect } from 'vitest';
import { AgentContext } from './context.js';

describe('AgentContext', () => {
  it('should initialize with a system message', () => {
    const context = new AgentContext();
    const history = context.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe('system');
  });

  it('should add messages to history', () => {
    const context = new AgentContext();
    context.addMessage({ role: 'user', content: 'hello' });
    const history = context.getHistory();
    expect(history).toHaveLength(2);
    expect(history[1]).toEqual({ role: 'user', content: 'hello' });
  });

  it('should clear history but keep system message', () => {
    const context = new AgentContext();
    context.addMessage({ role: 'user', content: 'hello' });
    context.clearHistory();
    const history = context.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe('system');
  });
});
