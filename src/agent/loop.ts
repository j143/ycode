import readline from 'readline/promises';
import chalk from 'chalk';
import ora from 'ora';
import { AgentContext } from './context.js';
import { executeTool } from '../tools/index.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export async function startAgentLoop(initialPrompt?: string) {
  const context = new AgentContext();
  let currentPrompt = initialPrompt;

  console.log(chalk.bold.green('\nClaude Rebuild at your service.'));
  console.log(chalk.dim('Type "exit" to quit.\n'));

  while (true) {
    if (!currentPrompt) {
      currentPrompt = await rl.question(chalk.blue('user> '));
    }

    if (currentPrompt.toLowerCase() === 'exit') {
      console.log(chalk.yellow('Goodbye!'));
      process.exit(0);
    }

    context.addMessage({ role: 'user', content: currentPrompt });
    currentPrompt = undefined;

    const spinner = ora('Claude is thinking...').start();

    try {
      // This is where the LLM call would happen
      // For now, we simulate a response with tool calls or text
      const response = await simulateLLMCall(context);
      spinner.stop();

      if (response.content) {
        console.log(chalk.magenta('\nclaude>') + ' ' + response.content);
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          console.log(chalk.yellow(`\n[Tool Call]: ${toolCall.name}(${JSON.stringify(toolCall.args)})`));
          const toolResult = await executeTool(toolCall.name, toolCall.args);
          console.log(chalk.green(`[Tool Result]: ${JSON.stringify(toolResult).substring(0, 100)}...`));
          context.addMessage({ role: 'tool', content: JSON.stringify(toolResult), toolCallId: toolCall.id });
        }
        // After tool calls, we should loop back to the LLM automatically
        // but for this simple rebuild, we'll wait for user next step or auto-trigger
        console.log(chalk.dim('\n(Tool execution finished, waiting for next instruction)'));
      }
    } catch (error) {
      spinner.fail('Error in agent loop');
      console.error(error);
    }
  }
}

// Placeholder for LLM interaction
async function simulateLLMCall(context: AgentContext) {
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const lastMessage = context.getHistory().at(-1);
  if (lastMessage?.content.toLowerCase().includes('list files')) {
    return {
      content: "I'll list the files in the current directory for you.",
      toolCalls: [{ id: 'tc1', name: 'ls', args: { path: '.' } }]
    };
  }

  return {
    content: "I'm a rebuild of Claude Code. I'm ready to help you with your project.",
    toolCalls: []
  };
}
