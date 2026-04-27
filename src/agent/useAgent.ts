import { useState, useRef, useCallback } from 'react';
import OpenAI from 'openai';
import { AgentContext } from './context.js';
import { executeTool } from '../tools/index.js';

const client = new OpenAI({
  apiKey: process.env.API_KEY || 'ollama',
  baseURL: process.env.API_BASE_URL || 'http://localhost:11434/v1',
  dangerouslyAllowBrowser: true 
});

function getModel() {
  return process.env.MODEL_NAME || 'qwen2.5-coder:1.5b';
}

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

interface PendingToolCall {
  name: string;
  args: any;
  resolve: (allowed: boolean) => void;
}

interface Action {
  id: string;
  name: string;
  args: any;
  status: 'pending' | 'running' | 'success' | 'error' | 'denied';
  result?: any;
}

export function useAgent(isAutoMode: boolean = false) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [pendingToolCall, setPendingToolCall] = useState<PendingToolCall | null>(null);
  const contextRef = useRef(new AgentContext());

  const addMessage = useCallback((msg: Message) => {
    setMessages(prev => [...prev, msg]);
    contextRef.current.addMessage(msg as any);
  }, []);

  const updateAction = useCallback((id: string, updates: Partial<Action>) => {
    setActions(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  }, []);

  const runTurn = useCallback(async (userPrompt?: string, externalContext?: AgentContext, depth: number = 0) => {
    if (depth > 5) {
      return { error: 'Maximum sub-agent recursion depth reached.' };
    }

    const currentContext = externalContext || contextRef.current;

    if (userPrompt) {
      // Pre-emptive Context Injection: Scan for file paths in the prompt
      const fileRegex = /(?:^|\s)((?:src|docs|test|utils|ui|agent|tools|mcp)\/[\w\-\./]+\.(?:ts|tsx|js|jsx|json|md|txt))(?:\s|$)/g;
      const matches = [...userPrompt.matchAll(fileRegex)];
      
      let injectedContext = '';
      if (matches.length > 0 && !externalContext) {
        for (const match of matches) {
          const filePath = match[1];
          try {
            const result = await executeTool('cat', { path: filePath });
            if (result && result.content) {
              injectedContext += `\n\n--- Content of ${filePath} ---\n${result.content}\n--- End of ${filePath} ---`;
            }
          } catch (e) { /* ignore read errors for pre-emptive injection */ }
        }
      }

      const finalPromptForModel = injectedContext 
        ? `${userPrompt}\n\n[PRE-EMPTIVE CONTEXT]\nI have automatically read the following files for you to help with your task:${injectedContext}`
        : userPrompt;

      if (!externalContext) {
        setMessages(prev => [...prev, { role: 'user', content: userPrompt }]);
      }
      currentContext.addMessage({ role: 'user', content: finalPromptForModel });
    }

    setIsThinking(true);
    setStreamingContent('');
    let fullContent = '';

    try {
      const stream = await client.chat.completions.create({
        model: getModel(),
        messages: currentContext.getHistory(),
        stream: true,
      });

      let lastUpdateTime = Date.now();
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          const now = Date.now();
          if (now - lastUpdateTime > 60) {
            setStreamingContent(fullContent);
            lastUpdateTime = now;
          }
        }
      }

      setStreamingContent(null);
      if (!externalContext) {
        setMessages(prev => [...prev, { role: 'assistant', content: fullContent }]);
      }
      currentContext.addMessage({ role: 'assistant', content: fullContent });
      setIsThinking(false);

      // Parse manual tool calls
      const toolCallRegex = /<tool_call name="([^"]+)">([\s\S]*?)<\/tool_call>/g;
      let match;
      const manualToolCalls = [];

      while ((match = toolCallRegex.exec(fullContent)) !== null) {
        manualToolCalls.push({
          name: match[1],
          argsRaw: match[2].trim()
        });
      }

      if (manualToolCalls.length > 0) {
        let anyExecuted = false;
        let finalResult = null;

        for (const toolCall of manualToolCalls) {
          let args = {};
          try {
            args = JSON.parse(toolCall.argsRaw);
          } catch (e) {
            continue;
          }

          const actionId = Math.random().toString(36).substring(7);
          const newAction: Action = {
            id: actionId,
            name: toolCall.name,
            args,
            status: 'pending'
          };
          
          if (!externalContext) setActions(prev => [...prev, newAction]);

          // Read-only tools auto-allow
          const isReadOnly = ['ls', 'cat', 'search', 'think', 'subagent'].includes(toolCall.name);
          let allowed = isReadOnly || isAutoMode;

          if (!allowed) {
            allowed = await new Promise<boolean>(resolve => {
              setPendingToolCall({ name: toolCall.name, args, resolve });
            });
            setPendingToolCall(null);
          }

          if (allowed) {
            if (!externalContext) updateAction(actionId, { status: 'running' });

            const runSubagentInternal = async (task: string) => {
              const subContext = new AgentContext();
              const parentHistory = currentContext.getHistory();
              const contextSummary = parentHistory.filter(m => m.role === 'user').slice(-3).map(m => m.content).join('\n');
              
              subContext.addMessage({ 
                role: 'user', 
                content: `Context from parent agent:\n${contextSummary}\n\nObjective: ${task}\n\nWork on this task and use the 'done' tool when you are finished.` 
              });
              
              let result: any = null;
              while (!result) {
                const turnResult = await runTurn(undefined, subContext, depth + 1);
                if (turnResult && (turnResult as any).status === "Task completed.") {
                  result = turnResult;
                } else if (turnResult && (turnResult as any).error) {
                  result = turnResult;
                } else if (!turnResult) {
                  const history = subContext.getHistory();
                  const lastAssistantMsg = history[history.length - 1];
                  result = { success: false, message: lastAssistantMsg.role === 'assistant' ? lastAssistantMsg.content : 'Sub-agent stopped.' };
                }
              }
              return result;
            };

            const toolResult = await executeTool(toolCall.name, args, runSubagentInternal);
            
            if (!externalContext) updateAction(actionId, { status: 'success', result: toolResult });
            currentContext.addMessage({ role: 'user', content: `[SYSTEM] Tool ${toolCall.name} returned: ${JSON.stringify(toolResult)}` });
            
            anyExecuted = true;
            if (toolCall.name === 'done') {
              finalResult = toolResult;
            }
          } else {
            if (!externalContext) updateAction(actionId, { status: 'denied' });
            currentContext.addMessage({ role: 'user', content: `[SYSTEM] Tool call ${toolCall.name} was denied by the user.` });
          }
        }
        
        if (finalResult) return finalResult;
        if (anyExecuted) return await runTurn(undefined, externalContext, depth);
      }
    } catch (error: any) {
      setIsThinking(false);
      return { error: error.message };
    }
  }, [isAutoMode, updateAction]);

  return {
    messages,
    actions,
    streamingContent,
    isThinking,
    pendingToolCall,
    runTurn
  };
}
