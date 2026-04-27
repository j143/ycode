import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { useAgent } from '../agent/useAgent.js';
import { Markdown } from './components/Markdown.js';

const MessageItem = React.memo(({ msg, isLatest }: { msg: any; isLatest: boolean }) => {
  if (msg.content === '' && msg.role === 'assistant') return null;
  
  const isSystem = msg.content.startsWith('[SYSTEM]');
  const isAssistant = msg.role === 'assistant';
  const isUser = msg.role === 'user';

  if (isSystem) {
    return (
      <Box paddingLeft={1} marginBottom={0}>
        <Text dimColor italic>› {msg.content.replace('[SYSTEM] ', '')}</Text>
      </Box>
    );
  }

  if (isAssistant) {
    const thoughtMatch = msg.content.match(/<tool_call\s+name="think">([\s\S]*?)(?:<\/tool_call>|$)/i);
    
    // Robustly strip all tool calls (handles malformed/unclosed tags)
    const contentToDisplay = msg.content
      .replace(/<tool_call\s+name="[^"]+">([\s\S]*?)(?:<\/tool_call>|$)/gi, '')
      .trim();

    // If there is a thought, we show the block. 
    // If there is no content and no thought, we hide the entire assistant message.
    if (!contentToDisplay && !thoughtMatch) return null;

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box><Text bold color="magenta" dimColor={!isLatest}>ycode</Text></Box>
        <Box paddingLeft={1} flexDirection="column">
          {thoughtMatch && (
            <Box borderStyle="single" borderColor="blue" paddingX={1} marginBottom={0}>
              <Text italic color="blue" dimColor={!isLatest}>
                thought: {(() => {
                  const raw = thoughtMatch[1].trim();
                  try {
                    return JSON.parse(raw.endsWith('}') ? raw : raw + '}').thought;
                  } catch (e) {
                    return raw;
                  }
                })()}
              </Text>
            </Box>
          )}
          {contentToDisplay && (
            <Box>
              <Text dimColor={!isLatest}>
                <Markdown>{contentToDisplay}</Markdown>
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={0}>
      <Box><Text bold color="blue" dimColor={!isLatest}>user</Text></Box>
      <Box paddingLeft={1}>
        <Text dimColor={!isLatest}>{msg.content}</Text>
      </Box>
    </Box>
  );
});

const ActionItem = ({ action, isLatest }: { action: any; isLatest: boolean }) => {
  const statusColor = {
    pending: 'yellow',
    running: 'blue',
    success: 'green',
    error: 'red',
    denied: 'dim'
  }[action.status as string] || 'white';

  const icon = {
    pending: '○',
    running: '●',
    success: '✔',
    error: '✘',
    denied: '⊘'
  }[action.status as string] || '?';

  return (
    <Box flexDirection="column" marginBottom={0}>
      <Box flexDirection="row">
        <Text color={statusColor} dimColor={!isLatest}>{icon} </Text>
        <Text bold dimColor={!isLatest}>{action.name.toLowerCase()}</Text>
        <Text dimColor> {action.status}</Text>
      </Box>
      {isLatest && (
        <Box paddingLeft={2}>
           {action.name === 'edit' ? (
             <Text dimColor>file: {action.args.path}</Text>
           ) : action.name === 'bash' ? (
             <Text dimColor>cmd: {action.args.command}</Text>
           ) : null}
        </Box>
      )}
    </Box>
  );
};

export const App: React.FC<{ initialPrompt?: string }> = ({ initialPrompt }) => {
  const [isAutoMode, setIsAutoMode] = useState(false);
  const { messages, actions, streamingContent, isThinking, thinkingTime, pendingToolCall, ambientInfo, runTurn } = useAgent(isAutoMode);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const { exit } = useApp();

  useEffect(() => {
    if (initialPrompt) runTurn(initialPrompt);
  }, []);

  useInput((inputStr, key) => {
    if (pendingToolCall) return;
    if (key.upArrow) {
      if (historyIndex < history.length - 1) {
        const nextIndex = historyIndex + 1;
        setHistoryIndex(nextIndex);
        setInput(history[history.length - 1 - nextIndex] || '');
      }
    }
    if (key.downArrow) {
      if (historyIndex >= 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        if (nextIndex === -1) setInput('');
        else setInput(history[history.length - 1 - nextIndex] || '');
      }
    }
  });

  const handleSubmit = (value: string) => {
    if (value.toLowerCase() === 'exit') { exit(); return; }
    if (value.toLowerCase() === '/auto') { setIsAutoMode(prev => !prev); setInput(''); return; }
    if (pendingToolCall) { pendingToolCall.resolve(value.toLowerCase() === 'y'); setInput(''); return; }
    if (value.trim() !== '') setHistory(prev => [...prev, value]);
    setHistoryIndex(-1);
    const finalPrompt = value.trim() === '' ? 'Please continue.' : value;
    setInput('');
    runTurn(finalPrompt);
  };

  const conversationLayer = React.useMemo(() => (
    <Box flexDirection="column" width="65%" marginRight={2}>
      {messages.slice(-5).map((msg, i) => (
        <MessageItem key={i} msg={msg} isLatest={i === Math.min(messages.length, 5) - 1 && streamingContent === null} />
      ))}
      {streamingContent !== null && <MessageItem msg={{ role: 'assistant', content: streamingContent }} isLatest={true} />}
    </Box>
  ), [messages, streamingContent]);

  const activityLayer = React.useMemo(() => (
    <Box flexDirection="column" width="35%" paddingLeft={1} borderStyle="classic" borderColor="dim">
      <Text bold color="cyan">ACTIVITY</Text>
      
      <Box marginTop={1} flexDirection="column">
        {actions.filter(a => a.name !== 'manage_plan').slice(-6).map((action, i, arr) => (
          <ActionItem key={action.id} action={action} isLatest={i === arr.length - 1} />
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="blue" paddingX={1}>
        <Text bold color="blue">PLAN</Text>
        {actions.filter(a => a.name === 'manage_plan' && a.status === 'success').slice(-1).map(a => (
          <Box key={a.id} flexDirection="column">
            {a.result.plan.steps.map((step: string, idx: number) => (
              <Text key={idx} color={a.result.plan.completed.includes(idx) ? 'green' : 'white'} wrap="truncate">
                {a.result.plan.completed.includes(idx) ? '☑' : '☐'} {step.toLowerCase()}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  ), [actions]);

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={0} minHeight={12}>
      {/* Robust Status Bar */}
      <Box backgroundColor="white" paddingX={1} marginBottom={1}>
        <Text color="black" bold> YCODE </Text>
        <Text color="black"> {ambientInfo.dir} </Text>
        <Text color="black" dimColor>({ambientInfo.branch}) </Text>
        <Box flexGrow={1} />
        {isAutoMode && <Text color="red" bold> AUTO-MODE </Text>}
        {isThinking && <Text color="blue" bold> THINKING ({thinkingTime}s) </Text>}
      </Box>

      <Box flexDirection="row" flexGrow={1} marginBottom={1}>
        {conversationLayer}
        {activityLayer}
      </Box>

      {/* Action Overlay for Permissions */}
      {pendingToolCall && (
        <Box flexDirection="column" borderStyle="double" borderColor="yellow" paddingX={1} marginBottom={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold color="yellow">APPROVE ACTION</Text>
            <Text dimColor>[{pendingToolCall.name}]</Text>
          </Box>
          <Box paddingLeft={1} marginTop={1}>
             {pendingToolCall.name === 'edit' ? (
               <Box flexDirection="column">
                 <Text color="cyan">edit {pendingToolCall.args.path}</Text>
                 <Text color="red">- {pendingToolCall.args.edits[0]?.old_string.substring(0, 40)}...</Text>
                 <Text color="green">+ {pendingToolCall.args.edits[0]?.new_string.substring(0, 40)}...</Text>
               </Box>
             ) : (
               <Text dimColor>{JSON.stringify(pendingToolCall.args)}</Text>
             )}
          </Box>
          <Box marginTop={1}>
            <Text bold>Allow? (y/n) </Text>
            <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
          </Box>
        </Box>
      )}

      {/* Sticky Input Footer */}
      {!pendingToolCall && streamingContent === null && (
        <Box borderStyle="round" borderColor="blue" paddingX={1}>
          <Text bold color="blue">› </Text>
          <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} placeholder="Ask ycode..." />
        </Box>
      )}
    </Box>
  );
};
