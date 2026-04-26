import { useState, useRef, useCallback } from 'react';
import OpenAI from 'openai';
import { AgentContext } from './context.js';
import { executeTool } from '../tools/index.js';

const client = new OpenAI({
  apiKey: process.env.API_KEY || 'ollama',
  baseURL: process.env.API_BASE_URL || 'http://localhost:11434/v1',
  dangerouslyAllowBrowser: true // Ink runs in Node, but some OpenAI SDK versions check this
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

export function useAgent(isAutoMode: boolean = false) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [pendingToolCall, setPendingToolCall] = useState<PendingToolCall | null>(null);
  const contextRef = useRef(new AgentContext());

  const addMessage = useCallback((msg: Message) => {
    setMessages(prev => [...prev, msg]);
    contextRef.current.addMessage(msg as any);
  }, []);

  const runTurn = useCallback(async (userPrompt?: string) => {
    if (userPrompt) {
      addMessage({ role: 'user', content: userPrompt });
    }

    setIsThinking(true);
    setStreamingContent('');
    let fullContent = '';

    try {
      const stream = await client.chat.completions.create({
        model: getModel(),
        messages: contextRef.current.getHistory(),
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          setStreamingContent(fullContent);
        }
      }

      setStreamingContent(null);
      addMessage({ role: 'assistant', content: fullContent });
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
        let isDone = false;

        for (const toolCall of manualToolCalls) {
          let args = {};
          try {
            args = JSON.parse(toolCall.argsRaw);
          } catch (e) {
            addMessage({ role: 'user', content: `[SYSTEM] Error parsing arguments for tool ${toolCall.name}.` });
            continue;
          }

          if (toolCall.name === 'done') {
            isDone = true;
          }

          // Read-only tools auto-allow
          const isReadOnly = ['ls', 'cat', 'search', 'think'].includes(toolCall.name);
          let allowed = isReadOnly || isAutoMode;

          if (!allowed) {
            allowed = await new Promise<boolean>(resolve => {
              setPendingToolCall({ name: toolCall.name, args, resolve });
            });
            setPendingToolCall(null);
          }

          if (allowed) {
            const toolResult = await executeTool(toolCall.name, args);
            addMessage({ 
              role: 'user', 
              content: `[SYSTEM] Tool ${toolCall.name} returned: ${JSON.stringify(toolResult)}` 
            });
            anyExecuted = true;
          } else {
            addMessage({ role: 'user', content: `[SYSTEM] Tool call ${toolCall.name} was denied by the user.` });
          }
        }
        
        // After executing all tool calls, continue the turn automatically if not done
        if (anyExecuted && !isDone) {
           await runTurn();
        }
      }
    } catch (error: any) {
      addMessage({ role: 'system', content: `Error: ${error.message}` });
      setIsThinking(false);
    }
  }, [addMessage]);

  return {
    messages,
    streamingContent,
    isThinking,
    pendingToolCall,
    runTurn
  };
}
