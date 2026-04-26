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
      stream: true,
    });

    spinner.stop();

    let fullContent = '';
    process.stdout.write(chalk.magenta('\nassistant> '));

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        fullContent += delta.content;
        process.stdout.write(delta.content);
      }
    }
    
    process.stdout.write('\n');

    // Add assistant message to context
    context.addMessage({ role: 'assistant', content: fullContent });

    // Parse manual tool calls: <tool_call name="tool_name">{"args": "..."}</tool_call>
    const toolCallRegex = /<tool_call name="([^"]+)">([\s\S]*?)<\/tool_call>/g;
    let match;
    const manualToolCalls = [];

    while ((match = toolCallRegex.exec(fullContent)) !== null) {
      manualToolCalls.push({
        name: match[1],
        argsRaw: match[2].trim()
      });
    }

    if (manualToolCalls.length > 0) {
      for (const toolCall of manualToolCalls) {
        let args = {};
        try {
          args = JSON.parse(toolCall.argsRaw);
        } catch (e) {
          console.log(chalk.red(`\n[Error parsing arguments for ${toolCall.name}]: ${toolCall.argsRaw}`));
          context.addMessage({
            role: 'user',
            content: `Error parsing arguments for tool ${toolCall.name}. Please ensure you provide valid JSON.`
          });
          continue;
        }

        console.log(chalk.yellow(`\n[Tool Call]: ${toolCall.name}(${JSON.stringify(args)})`));
        
        const allowed = await requestPermission(toolCall.name, args);
        if (!allowed) {
          console.log(chalk.red(`[Permission Denied]: ${toolCall.name}`));
          context.addMessage({
            role: 'user',
            content: `Tool call ${toolCall.name} was denied by the user.`
          });
          continue;
        }

        const toolResult = await executeTool(toolCall.name, args);
        
        console.log(chalk.green(`[Tool Result]: ${JSON.stringify(toolResult).substring(0, 100)}${JSON.stringify(toolResult).length > 100 ? '...' : ''}`));

        context.addMessage({
          role: 'user',
          content: `[SYSTEM] Tool ${toolCall.name} returned: ${JSON.stringify(toolResult)}`
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
