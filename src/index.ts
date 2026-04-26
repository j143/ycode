#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import React from 'react';
import { render } from 'ink';
import dotenv from 'dotenv';
import { App } from './ui/App.js';

dotenv.config();

const program = new Command();

program
  .name('claude-rebuild')
  .description('A rebuild of Claude Code agentic CLI')
  .version('0.1.0');

program
  .command('chat')
  .description('Start an interactive chat session with the agent')
  .argument('[prompt]', 'Initial prompt to start the conversation')
  .action((prompt) => {
    render(React.createElement(App, { initialPrompt: prompt }));
  });

// Default to chat if no command is specified
program
  .action(() => {
    render(React.createElement(App, {}));
  });

program.parse(process.argv);
