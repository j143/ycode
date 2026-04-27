import { useState, useRef, useCallback, useEffect } from 'react';
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
  const [thinkingTime, setThinkingTime] = useState(0);
  const [pendingToolCall, setPendingToolCall] = useState<PendingToolCall | null>(null);
  const [ambientInfo, setAmbientInfo] = useState({ branch: '', dir: '' });
  const contextRef = useRef(new AgentContext());
  const thinkingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchAmbientInfo = async () => {
      try {
        const branchRes = await executeTool('bash', { command: 'git rev-parse --abbrev-ref HEAD' });
        const dirRes = await executeTool('bash', { command: 'basename $(pwd)' });
        setAmbientInfo({ 
          branch: branchRes.stdout?.trim() || 'no-git', 
          dir: dirRes.stdout?.trim() || 'unknown' 
        });
      } catch (e) { /* ignore */ }
    };
    fetchAmbientInfo();
  }, []);

  const startThinking = useCallback(() => {
    setIsThinking(true);
    setThinkingTime(0);
    thinkingTimerRef.current = setInterval(() => {
      setThinkingTime(t => t + 1);
    }, 1000);
  }, []);

  const stopThinking = useCallback(() => {
    setIsThinking(false);
    if (thinkingTimerRef.current) {
      clearInterval(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
  }, []);

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
      // ... (pre-emptive injection logic unchanged)
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
          } catch (e) { /* ignore */ }
        }
      }
      const finalPromptForModel = injectedContext ? `${userPrompt}\n\n[PRE-EMPTIVE CONTEXT]\nI have automatically read the following files for you to help with your task:${injectedContext}` : userPrompt;
      if (!externalContext) setMessages(prev => [...prev, { role: 'user', content: userPrompt }]);
      currentContext.addMessage({ role: 'user', content: finalPromptForModel });
    }

    startThinking();
    setStreamingContent('');
    let fullContent = '';

    try {
      const stream = await client.chat.completions.create({
        model: getModel(),
        messages: currentContext.getHistory(),
        stream: true,
        num_ctx: 4096,
        temperature: 0.1,
      } as any) as any; // Cast to any to bypass standard check but maintain loopability

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
      if (!externalContext) setMessages(prev => [...prev, { role: 'assistant', content: fullContent }]);
      currentContext.addMessage({ role: 'assistant', content: fullContent });
      stopThinking();

      // [STRICT PARSING] Check for tool calls even if wrapped in markdown (and then warn)
      const sanitizedContent = fullContent.replace(/```xml\n?|```/g, '');
      const toolCallRegex = /<tool_call name="([^"]+)">([\s\S]*?)<\/tool_call>/g;
      let match;
      const manualToolCalls = [];

      while ((match = toolCallRegex.exec(sanitizedContent)) !== null) {
        manualToolCalls.push({ name: match[1], argsRaw: match[2].trim() });
      }

      // [STRICT OUTPUT ENFORCEMENT]
      const usingBackticks = /```/.test(fullContent);
      if (usingBackticks && manualToolCalls.length > 0) {
        const hint = "[SYSTEM] DO NOT wrap tool calls in markdown backticks. Always provide them as raw text. Please try again correctly.";
        currentContext.addMessage({ role: 'user', content: hint });
        return await runTurn(undefined, externalContext, depth);
      }

      const hasCodeBlock = /```[\s\S]*?```/.test(fullContent);
      if (hasCodeBlock && manualToolCalls.length === 0 && !externalContext) {
        const hint = "[SYSTEM] You provided a code block but no tool call. Use 'write' or 'edit' to deliver code. DO NOT just show it to me. Try again.";
        currentContext.addMessage({ role: 'user', content: hint });
        return await runTurn(undefined, externalContext, depth);
      }

      if (manualToolCalls.length > 0) {
        let anyExecuted = false;
        let finalResult = null;

        for (const toolCall of manualToolCalls) {
          let args = {};
          try {
            args = JSON.parse(toolCall.argsRaw);
          } catch (e) { continue; }

          const actionId = Math.random().toString(36).substring(7);
          const newAction: Action = { id: actionId, name: toolCall.name, args, status: 'pending' };
          if (!externalContext) setActions(prev => [...prev, newAction]);

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
              subContext.addMessage({ role: 'user', content: `Context from parent agent:\n${contextSummary}\n\nObjective: ${task}\n\nWork on this task and use the 'done' tool when you are finished.` });
              let result: any = null;
              while (!result) {
                const turnResult = await runTurn(undefined, subContext, depth + 1);
                if (turnResult && (turnResult as any).status === "Task completed.") result = turnResult;
                else if (turnResult && (turnResult as any).error) result = turnResult;
                else if (!turnResult) {
                  const history = subContext.getHistory();
                  const lastAssistantMsg = history[history.length - 1];
                  result = { success: false, message: lastAssistantMsg.role === 'assistant' ? lastAssistantMsg.content : 'Sub-agent stopped.' };
                }
              }
              return result;
            };

            let toolResult = await executeTool(toolCall.name, args, runSubagentInternal);
            
            // Deterministic Guardrail: Auto-Linting after edit/write
            if ((toolCall.name === 'edit' || toolCall.name === 'write') && !toolResult.error) {
               if (!externalContext) updateAction(actionId, { status: 'running' });
               const lintResult = await executeTool('bash', { command: 'npm run build' });
               if (lintResult.error || (lintResult.stderr && lintResult.stderr.includes('error'))) {
                 toolResult = { 
                   success: false, 
                   error: 'Build failed after changes. Please fix the following errors:',
                   details: lintResult.stderr || lintResult.error 
                 };
               }
            }

            if (!externalContext) updateAction(actionId, { status: toolResult.error ? 'error' : 'success', result: toolResult });
            currentContext.addMessage({ role: 'user', content: `[SYSTEM] Tool ${toolCall.name} returned: ${JSON.stringify(toolResult)}` });
            
            anyExecuted = true;
            if (toolCall.name === 'done') finalResult = toolResult;
          } else {
            if (!externalContext) updateAction(actionId, { status: 'denied' });
            currentContext.addMessage({ role: 'user', content: `[SYSTEM] Tool call ${toolCall.name} was denied by the user.` });
          }
        }
        
        if (finalResult) return finalResult;
        if (anyExecuted) return await runTurn(undefined, externalContext, depth);
      }
    } catch (error: any) {
      stopThinking();
      return { error: error.message };
    }
  }, [isAutoMode, updateAction, startThinking, stopThinking]);

  return {
    messages,
    actions,
    streamingContent,
    isThinking,
    thinkingTime,
    pendingToolCall,
    ambientInfo,
    runTurn
  };
}
