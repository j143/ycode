import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, Static } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { useAgent } from '../agent/useAgent.js';
import { Markdown } from './components/Markdown.js';

const MessageItem = React.memo(({ msg }: { msg: any }) => {
  if (msg.content === '' && msg.role === 'assistant') return null;
  
  if (msg.content.startsWith('[SYSTEM]')) {
     return (
       <Box paddingLeft={2} marginBottom={1}>
         <Text dimColor italic>{msg.content}</Text>
       </Box>
     );
  }

  const isUser = msg.role === 'user';
  const isAssistant = msg.role === 'assistant';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color={isUser ? 'blue' : 'magenta'}>
          {isUser ? 'You' : 'ycode'}
        </Text>
      </Box>
      <Box paddingLeft={2}>
        {isAssistant ? (
          <Markdown>{msg.content}</Markdown>
        ) : (
          <Text>{msg.content}</Text>
        )}
      </Box>
    </Box>
  );
});

export const App: React.FC<{ initialPrompt?: string }> = ({ initialPrompt }) => {
  const [isAutoMode, setIsAutoMode] = useState(false);
  const { messages, streamingContent, isThinking, pendingToolCall, runTurn } = useAgent(isAutoMode);
  const [input, setInput] = useState('');
  const { exit } = useApp();

  useEffect(() => {
    if (initialPrompt) {
      runTurn(initialPrompt);
    }
  }, []);

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

    // Shortcut: empty input means "continue"
    const finalPrompt = value.trim() === '' ? 'Please continue.' : value;

    setInput('');
    runTurn(finalPrompt);
  };

  return (
    <Box flexDirection="column" padding={1} minHeight={10}>
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold>YCODE</Text>
        <Box marginLeft={2}>
          <Text dimColor>Local Agentic CLI</Text>
        </Box>
        <Box flexGrow={1} />
        {isAutoMode && (
          <Box>
            <Text bold color="red">[AUTO-MODE ON]</Text>
          </Box>
        )}
      </Box>

      {/* Messages */}
      <Box flexDirection="column">
        {messages.map((msg, i) => (
          <MessageItem key={i} msg={msg} />
        ))}
        {streamingContent !== null && (
          <MessageItem msg={{ role: 'assistant', content: streamingContent }} />
        )}
      </Box>

      {/* Tool Permission */}
      {pendingToolCall && (
        <Box flexDirection="column" borderStyle="double" borderColor="yellow" paddingX={1} marginBottom={1}>
          <Text bold color="yellow">PERMISSION REQUESTED</Text>
          <Box flexDirection="row" marginTop={1}>
            <Text>Tool: </Text>
            <Text bold color="cyan">{pendingToolCall.name}</Text>
          </Box>
          <Box flexDirection="column" marginTop={1} paddingLeft={2}>
             <Text dimColor>{JSON.stringify(pendingToolCall.args, null, 2)}</Text>
          </Box>
          <Box marginTop={1}>
            <Text bold>Allow this tool call? (y/n): </Text>
            <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
          </Box>
        </Box>
      )}

      {/* Footer / Input */}
      <Box flexDirection="column">
        {isThinking && !pendingToolCall && streamingContent === '' && (
          <Box marginBottom={1}>
            <Text color="yellow">
              <Spinner type="dots" /> <Text italic>Thinking...</Text>
            </Text>
          </Box>
        )}

        {!pendingToolCall && streamingContent === null && (
          <Box borderStyle="round" borderColor="blue" paddingX={1}>
            <Text bold color="blue">{"user> "}</Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              placeholder="Type your message or 'exit'..."
            />
          </Box>
        )}
      </Box>
    </Box>
  );
};
