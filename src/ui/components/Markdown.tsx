import React, { useMemo } from 'react';
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
  const terminalOutput = useMemo(() => {
    return (marked.parse(children) as string).trim();
  }, [children]);

  return <Text>{terminalOutput}</Text>;
};
