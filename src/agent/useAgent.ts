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
      // Environmental Grounding
      let groundContext = `[ENVIRONMENT]\nCWD: ${ambientInfo.dir}\n`;
      try {
        const rootFiles = await executeTool('ls', { path: '.' });
        if (Array.isArray(rootFiles)) {
           groundContext += `Root Files: ${rootFiles.map((f: any) => f.name).join(', ')}\n`;
        }
      } catch(e) {}

      const fileRegex = /(?:^|\s)([\w\-\./]+\.(?:ts|tsx|js|jsx|json|md|yaml|yml|sh|txt|toml))(?:\s|$)/g;
      const matches = [...userPrompt.matchAll(fileRegex)];
      let injectedContext = '';
      if (matches.length > 0 && !externalContext) {
        for (const match of matches) {
          const filePath = match[1];
          if (filePath.includes('.') && !filePath.includes('node_modules')) {
            try {
              const result = await executeTool('cat', { path: filePath });
              if (result && result.content) {
                injectedContext += `\n\n--- Content of ${filePath} ---\n${result.content}\n--- End of ${filePath} ---`;
              }
            } catch (e) { /* ignore */ }
          }
        }
      }
      const finalPromptForModel = `${groundContext}\nUser Request: ${userPrompt}${injectedContext ? `\n\n[PRE-EMPTIVE CONTEXT]${injectedContext}` : ''}`;
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
      } as any) as any;

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

      // [CODE-FIRST PARSER] 
      const codeBlockRegex = /```([a-z_]+)\s*(.*)\n([\s\S]*?)(?:```|$)/gi;
      let blockMatch;
      const parsedToolCalls: {name: string, args: any}[] = [];

      while ((blockMatch = codeBlockRegex.exec(fullContent)) !== null) {
        const toolName = blockMatch[1].toLowerCase();
        const lineArg = blockMatch[2].trim();
        const blockContent = blockMatch[3].trim();

        let args: any = {};
        switch (toolName) {
          case 'write': args = { path: lineArg, content: blockContent }; break;
          case 'bash': args = { command: blockContent, background: lineArg.includes('bg') }; break;
          case 'plan': args = { action: 'set', steps: blockContent.split('\n').map(s => s.trim().replace(/^[\d\-\.\*☑☐\s]+/, '')) }; break;
          case 'think': args = { thought: blockContent }; break;
          case 'ls':
          case 'cat':
          case 'rm':
          case 'mkdir':
          case 'get_type_definitions': args = { path: lineArg, dir: lineArg }; break;
          case 'search': args = { pattern: lineArg }; break;
          case 'done': args = { message: blockContent }; break;
          case 'subagent': args = { task: lineArg || blockContent }; break;
          case 'edit':
             // Parse Search/Replace blocks
             const edits = [];
             const editBlocks = blockContent.split(/<<<< SEARCH|==== REPLACE|>>>>/);
             for(let i=1; i<editBlocks.length; i+=3) {
               edits.push({ old_string: editBlocks[i].trim(), new_string: editBlocks[i+1].trim() });
             }
             args = { path: lineArg, edits };
             break;
          default:
            // Maybe it's just a regular code block (typescript, python, etc)
            continue;
        }
        parsedToolCalls.push({ name: toolName === 'plan' ? 'manage_plan' : toolName, args });
      }

      // Legacy fallback for XML
      if (parsedToolCalls.length === 0) {
        const xmlRegex = /<tool_call\s+name="([^"]+)">([\s\S]*?)(?:<\/tool_call>|$)/gi;
        let xmlMatch;
        while ((xmlMatch = xmlRegex.exec(fullContent)) !== null) {
          try { parsedToolCalls.push({ name: xmlMatch[1], args: JSON.parse(xmlMatch[2].trim()) }); } catch(e) {}
        }
      }

      if (parsedToolCalls.length > 0) {
        let anyExecuted = false;
        let finalResult = null;

        for (const toolCall of parsedToolCalls) {
          const actionId = Math.random().toString(36).substring(7);
          const newAction: Action = { id: actionId, name: toolCall.name, args: toolCall.args, status: 'pending' };
          if (!externalContext) setActions(prev => [...prev, newAction]);

          const isReadOnly = ['ls', 'cat', 'search', 'think', 'subagent', 'manage_plan', 'get_type_definitions'].includes(toolCall.name);
          let allowed = isReadOnly || isAutoMode;

          if (!allowed) {
            allowed = await new Promise<boolean>(resolve => {
              setPendingToolCall({ name: toolCall.name, args: toolCall.args, resolve });
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

            let toolResult = await executeTool(toolCall.name, toolCall.args, runSubagentInternal);
            
            // Auto-Linting
            if ((toolCall.name === 'edit' || toolCall.name === 'write') && !toolResult.error) {
               const lintResult = await executeTool('bash', { command: 'npm run build' });
               if (lintResult.error || (lintResult.stderr && lintResult.stderr.includes('error'))) {
                 toolResult = { success: false, error: 'Build failed after changes.', details: lintResult.stderr || lintResult.error };
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
