#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { startAgentLoop } from './agent/loop.js';

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
  .action(async (prompt) => {
    console.log(chalk.cyan('Starting agentic loop...'));
    await startAgentLoop(prompt);
  });

// Default to chat if no command is specified
program
  .action(async () => {
    await startAgentLoop();
  });

program.parse(process.argv);
