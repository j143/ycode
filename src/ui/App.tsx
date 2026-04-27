import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { useAgent } from '../agent/useAgent.js';
import { Markdown } from './components/Markdown.js';

const MessageItem = React.memo(({ msg }: { msg: any }) => {
  if (msg.content === '' && msg.role === 'assistant') return null;
  
  const isSystem = msg.content.startsWith('[SYSTEM]');
  const isAssistant = msg.role === 'assistant';
  const isUser = msg.role === 'user';

  // Contextual rendering for tool results
  if (isSystem) {
    const toolMatch = msg.content.match(/\[SYSTEM\] Tool (\w+) returned: (.*)/);
    if (toolMatch) {
      const [, toolName, resultStr] = toolMatch;
      let result;
      try { result = JSON.parse(resultStr); } catch (e) { result = resultStr; }

      return (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1} borderStyle="round" borderColor="dim" paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold color="green">✓ {toolName.toUpperCase()}</Text>
            <Text dimColor>Result</Text>
          </Box>
          <Box marginTop={1}>
            <Text italic dimColor>
              {typeof result === 'object' 
                ? JSON.stringify(result).length > 200 
                  ? JSON.stringify(result).substring(0, 200) + '... (truncated)'
                  : JSON.stringify(result)
                : result}
            </Text>
          </Box>
        </Box>
      );
    }

    return (
      <Box paddingLeft={2} marginBottom={1}>
        <Text dimColor italic>{msg.content}</Text>
      </Box>
    );
  }

  // Contextual rendering for Assistant thoughts vs actions
  if (isAssistant) {
    const thoughtMatch = msg.content.match(/<tool_call name="think">([\s\S]*?)<\/tool_call>/);
    
    // Strip ALL tool calls from the chat layer display content
    const contentToDisplay = msg.content.replace(/<tool_call name="[^"]+">([\s\S]*?)<\/tool_call>/g, '').trim();

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="magenta">ycode</Text>
        </Box>
        <Box paddingLeft={2} flexDirection="column">
          {thoughtMatch && (
            <Box borderStyle="single" borderColor="blue" paddingX={1} marginBottom={1}>
              <Text italic color="blue">Thought: {JSON.parse(thoughtMatch[1].trim()).thought}</Text>
            </Box>
          )}
          {contentToDisplay && (
            <Markdown>{contentToDisplay}</Markdown>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="blue">You</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text>{msg.content}</Text>
      </Box>
    </Box>
  );
});

const ActionItem = ({ action }: { action: any }) => {
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
    success: '✓',
    error: '✗',
    denied: '⊘'
  }[action.status as string] || '?';

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1} borderStyle="round" borderColor={statusColor}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={statusColor} bold>{icon} {action.name.toUpperCase()}</Text>
        <Text dimColor italic>{action.status}</Text>
      </Box>
      <Box paddingLeft={2} marginTop={1}>
        {action.name === 'edit' ? (
          <Text dimColor>File: {action.args.path} ({action.args.edits?.length || 0} changes)</Text>
        ) : action.name === 'bash' ? (
          <Text dimColor>Cmd: {action.args.command}</Text>
        ) : (
          <Text dimColor>{JSON.stringify(action.args).substring(0, 50)}</Text>
        )}
      </Box>
      {action.status === 'success' && action.result && (
         <Box marginTop={1} paddingLeft={2}>
           <Text color="green" dimColor>
             Result: {JSON.stringify(action.result).substring(0, 100)}...
           </Text>
         </Box>
      )}
    </Box>
  );
};

export const App: React.FC<{ initialPrompt?: string }> = ({ initialPrompt }) => {
  const [isAutoMode, setIsAutoMode] = useState(false);
  const { messages, actions, streamingContent, isThinking, pendingToolCall, runTurn } = useAgent(isAutoMode);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const { exit } = useApp();

  useEffect(() => {
    if (initialPrompt) {
      runTurn(initialPrompt);
    }
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
        if (nextIndex === -1) {
          setInput('');
        } else {
          setInput(history[history.length - 1 - nextIndex] || '');
        }
      }
    }
  });

  const handleSubmit = (value: string) => {
    if (value.toLowerCase() === 'exit') {
      exit();
      return;
    }

    if (value.toLowerCase() === '/auto') {
      setIsAutoMode(prev => !prev);
      setInput('');
      return;
    }

    if (pendingToolCall) {
      const allowed = value.toLowerCase() === 'y';
      pendingToolCall.resolve(allowed);
      setInput('');
      return;
    }

    if (value.trim() !== '') {
      setHistory(prev => [...prev, value]);
    }
    setHistoryIndex(-1);

    const finalPrompt = value.trim() === '' ? 'Please continue.' : value;
    setInput('');
    runTurn(finalPrompt);
  };

  return (
    <Box flexDirection="column" padding={1} minHeight={10}>
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold>YCODE</Text>
        <Box marginLeft={2}><Text dimColor>Local Agentic CLI</Text></Box>
        <Box flexGrow={1} />
        {isAutoMode && <Box><Text bold color="red">[AUTO-MODE ON]</Text></Box>}
      </Box>

      <Box flexDirection="row" flexGrow={1} marginBottom={1}>
        {/* Layer 1: Conversation */}
        <Box flexDirection="column" width="65%" marginRight={2}>
          <Box flexDirection="column" flexGrow={1}>
            {messages.map((msg, i) => (
              <MessageItem key={i} msg={msg} />
            ))}
            {streamingContent !== null && (
              <MessageItem msg={{ role: 'assistant', content: streamingContent }} />
            )}
          </Box>
        </Box>

        {/* Layer 2: Activity / Actions */}
        <Box flexDirection="column" width="35%" borderStyle="double" borderColor="dim" paddingX={1}>
          <Text bold color="cyan">ACTIVITY</Text>
          <Box flexDirection="column" marginTop={1}>
            {actions.slice(-5).map((action) => (
              <ActionItem key={action.id} action={action} />
            ))}
            {actions.length === 0 && (
              <Text dimColor italic>No actions yet.</Text>
            )}
          </Box>
        </Box>
      </Box>

      {/* Tool Permission */}
      {pendingToolCall && (
        <Box flexDirection="column" borderStyle="double" borderColor="yellow" paddingX={1} marginBottom={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold color="yellow">PERMISSION REQUESTED</Text>
            <Text dimColor>[{pendingToolCall.name}]</Text>
          </Box>
          <Box flexDirection="column" marginTop={1} paddingLeft={2}>
             {pendingToolCall.name === 'edit' ? (
               <Box flexDirection="column">
                 <Text bold color="cyan">Editing: {pendingToolCall.args.path}</Text>
                 {pendingToolCall.args.edits.map((e: any, idx: number) => (
                   <Box key={idx} flexDirection="column" marginTop={1} borderStyle="single" borderColor="dim">
                     <Text color="red">- {e.old_string.substring(0, 100)}...</Text>
                     <Text color="green">+ {e.new_string.substring(0, 100)}...</Text>
                   </Box>
                 ))}
               </Box>
             ) : (
               <Text dimColor>{JSON.stringify(pendingToolCall.args, null, 2)}</Text>
             )}
          </Box>
          <Box marginTop={1} borderStyle="classic" borderColor="yellow" paddingX={1}>
            <Text bold>Allow this tool call? (y/n): </Text>
            <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
          </Box>
        </Box>
      )}

      {/* Footer / Input */}
      <Box flexDirection="column">
        {isThinking && !pendingToolCall && streamingContent === '' && (
          <Box marginBottom={1}>
            <Text color="yellow"><Spinner type="dots" /> <Text italic>Thinking...</Text></Text>
          </Box>
        )}
        {!pendingToolCall && streamingContent === null && (
          <Box borderStyle="round" borderColor="blue" paddingX={1}>
            <Text bold color="blue">{"user> "}</Text>
            <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} placeholder="Type your message or 'exit'..." />
          </Box>
        )}
      </Box>
    </Box>
  );
};
