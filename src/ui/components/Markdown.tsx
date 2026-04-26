import React from 'react';
import { Text } from 'ink';
import { Marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

const marked = new Marked();
marked.setOptions({
  // @ts-ignore
  renderer: new TerminalRenderer()
});

interface MarkdownProps {
  children: string;
}

export const Markdown: React.FC<MarkdownProps> = ({ children }) => {
  const terminalOutput = marked.parse(children) as string;
  return <Text>{terminalOutput.trim()}</Text>;
};
