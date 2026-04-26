import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useApp, Newline } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { useAgent } from '../agent/useAgent.js';
import { Markdown } from './components/Markdown.js';

export const App: React.FC<{ initialPrompt?: string }> = ({ initialPrompt }) => {
  const { messages, isThinking, pendingToolCall, runTurn } = useAgent();
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

    if (pendingToolCall) {
      const allowed = value.toLowerCase() === 'y';
      pendingToolCall.resolve(allowed);
      setInput('');
      return;
    }

    setInput('');
    runTurn(value);
  };

  const renderMessage = (msg: any, i: number) => {
    if (msg.content === '' && msg.role === 'assistant') return null;
    
    // Hide system messages from the main view to keep it clean, 
    // or show them in a special dim way.
    if (msg.content.startsWith('[SYSTEM]')) {
       return (
         <Box key={i} paddingLeft={2} marginBottom={1}>
           <Text dimColor italic>{msg.content}</Text>
         </Box>
       );
    }

    const isUser = msg.role === 'user';
    const isAssistant = msg.role === 'assistant';

    return (
      <Box key={i} flexDirection="column" marginBottom={1}>
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
  };

  return (
    <Box flexDirection="column" padding={1} minHeight={10}>
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold>YCODE</Text>
        <Box marginLeft={2}>
          <Text dimColor>Local Agentic CLI</Text>
        </Box>
      </Box>

      {/* Messages */}
      <Box flexDirection="column">
        {messages.map(renderMessage)}
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
        {isThinking && !pendingToolCall && (
          <Box marginBottom={1}>
            <Text color="yellow">
              <Spinner type="dots" /> <Text italic>Thinking...</Text>
            </Text>
          </Box>
        )}

        {!pendingToolCall && (
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
