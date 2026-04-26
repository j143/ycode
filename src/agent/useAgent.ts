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
  return process.env.MODEL_NAME || 'tinyllama';
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

export function useAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
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
    let fullContent = '';
    
    // Add an empty assistant message that we will stream into
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

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
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMsg = newMessages[newMessages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.content = fullContent;
            }
            return newMessages;
          });
        }
      }

      contextRef.current.addMessage({ role: 'assistant', content: fullContent });
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
        for (const toolCall of manualToolCalls) {
          let args = {};
          try {
            args = JSON.parse(toolCall.argsRaw);
          } catch (e) {
            addMessage({ role: 'user', content: `[SYSTEM] Error parsing arguments for tool ${toolCall.name}.` });
            continue;
          }

          // Read-only tools auto-allow
          const isReadOnly = ['ls', 'cat', 'search'].includes(toolCall.name);
          let allowed = isReadOnly;

          if (!isReadOnly) {
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
            await runTurn();
          } else {
            addMessage({ role: 'user', content: `[SYSTEM] Tool call ${toolCall.name} was denied by the user.` });
          }
        }
      }
    } catch (error: any) {
      addMessage({ role: 'system', content: `Error: ${error.message}` });
      setIsThinking(false);
    }
  }, [addMessage]);

  return {
    messages,
    isThinking,
    pendingToolCall,
    runTurn
  };
}
