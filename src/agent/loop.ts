import chalk from 'chalk';
import ora from 'ora';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { AgentContext } from './context.js';
import { toolDefinitions, executeTool } from '../tools/index.js';
import { rl } from '../utils/ui.js';
import { requestPermission } from '../utils/permissions.js';

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.API_KEY || 'ollama',
  baseURL: process.env.API_BASE_URL || 'http://localhost:11434/v1',
});

function getModel() {
  return process.env.MODEL_NAME || 'tinyllama';
}

export async function startAgentLoop(initialPrompt?: string) {
  const context = new AgentContext();
  let nextUserPrompt = initialPrompt;

  console.log(chalk.bold.green('\nycode at your service (using local/open models).'));
  console.log(chalk.dim('Type "exit" to quit.\n'));

  while (true) {
    if (!nextUserPrompt) {
      nextUserPrompt = await rl.question(chalk.blue('user> '));
    }

    if (nextUserPrompt.toLowerCase() === 'exit') {
      console.log(chalk.yellow('Goodbye!'));
      process.exit(0);
    }

    context.addMessage({ role: 'user', content: nextUserPrompt });
    nextUserPrompt = undefined;

    await runAgentTurn(context);
  }
}

async function runAgentTurn(context: AgentContext) {
  const spinner = ora('Agent is thinking...').start();

  try {
    const stream = await client.chat.completions.create({
      model: getModel(),
      messages: context.getHistory(),
      tools: toolDefinitions as any,
      tool_choice: 'auto',
      stream: true,
    });

    spinner.stop();

    let fullContent = '';
    let toolCalls: any[] = [];
    
    process.stdout.write(chalk.magenta('\nassistant> '));

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        fullContent += delta.content;
        process.stdout.write(delta.content);
      }

      if (delta.tool_calls) {
        for (const tcDelta of delta.tool_calls) {
          if (!toolCalls[tcDelta.index]) {
            toolCalls[tcDelta.index] = { id: tcDelta.id, function: { name: '', arguments: '' }, type: 'function' };
          }
          if (tcDelta.function?.name) {
            toolCalls[tcDelta.index].function.name += tcDelta.function.name;
          }
          if (tcDelta.function?.arguments) {
            toolCalls[tcDelta.index].function.arguments += tcDelta.function.arguments;
          }
        }
      }
    }
    
    process.stdout.write('\n');

    // Add assistant message to context
    const assistantMessage: any = { role: 'assistant' };
    if (fullContent) assistantMessage.content = fullContent;
    if (toolCalls.length > 0) assistantMessage.tool_calls = toolCalls;
    
    context.addMessage(assistantMessage);

    if (toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        const name = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || '{}');

        console.log(chalk.yellow(`\n[Tool Call]: ${name}(${JSON.stringify(args)})`));
        
        const allowed = await requestPermission(name, args);
        if (!allowed) {
          console.log(chalk.red(`[Permission Denied]: ${name}`));
          context.addMessage({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: 'User denied permission for this tool call' }),
          });
          continue;
        }

        const toolResult = await executeTool(name, args);
        
        console.log(chalk.green(`[Tool Result]: ${JSON.stringify(toolResult).substring(0, 100)}${JSON.stringify(toolResult).length > 100 ? '...' : ''}`));

        context.addMessage({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Automatically run another turn to process tool results
      await runAgentTurn(context);
    }
  } catch (error: any) {
    spinner.fail('Error in agent loop');
    console.error(chalk.red(error.message));
  }
}
