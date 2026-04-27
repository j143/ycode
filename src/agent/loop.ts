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

    // Pre-emptive Context Injection
    const fileRegex = /(?:^|\s)((?:src|docs|test|utils|ui|agent|tools|mcp)\/[\w\-\./]+\.(?:ts|tsx|js|jsx|json|md|txt))(?:\s|$)/g;
    const matches = [...nextUserPrompt.matchAll(fileRegex)];
    
    let injectedContext = '';
    if (matches.length > 0) {
      for (const match of matches) {
        const filePath = match[1];
        try {
          const result = await executeTool('cat', { path: filePath });
          if (result && (result as any).content) {
            injectedContext += `\n\n--- Content of ${filePath} ---\n${(result as any).content}\n--- End of ${filePath} ---`;
          }
        } catch (e) { /* ignore */ }
      }
    }

    const finalPrompt = injectedContext 
      ? `${nextUserPrompt}\n\n[PRE-EMPTIVE CONTEXT]\nI have automatically read the following files for you to help with your task:${injectedContext}`
      : nextUserPrompt;

    context.addMessage({ role: 'user', content: finalPrompt });
    nextUserPrompt = undefined;

    await runAgentTurn(context);
  }
}

async function runAgentTurn(context: AgentContext, depth: number = 0) {
  if (depth > 5) {
    return { error: 'Maximum sub-agent recursion depth reached.' };
  }

  const spinner = ora('Agent is thinking...').start();

  try {
    const stream = await client.chat.completions.create({
      model: getModel(),
      messages: context.getHistory(),
      stream: true,
      num_ctx: 4096,
      temperature: 0.1,
    } as any) as any;

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

    // [STRICT PARSING]
    const sanitizedContent = fullContent.replace(/```xml\n?|```/g, '');
    const toolCallRegex = /<tool_call name="([^"]+)">([\s\S]*?)<\/tool_call>/g;
    let match;
    const manualToolCalls = [];

    while ((match = toolCallRegex.exec(sanitizedContent)) !== null) {
      manualToolCalls.push({ name: match[1], argsRaw: match[2].trim() });
    }

    // [STRICT OUTPUT ENFORCEMENT]
    const usingBackticks = /```/.test(fullContent);
    if (usingBackticks && manualToolCalls.length > 0) {
      context.addMessage({ 
        role: 'user', 
        content: "[SYSTEM] DO NOT wrap tool calls in backticks. Provide them as raw XML. Try again." 
      });
      return await runAgentTurn(context, depth);
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

        const runSubagent = async (task: string) => {
          const currentDepth = depth + 1;
          console.log(chalk.cyan(`\n[Sub-agent Started (Depth: ${currentDepth})]: ${task}`));
          const subContext = new AgentContext();
          
          // Provide some ambient context to the sub-agent
          const parentHistory = context.getHistory();
          const contextSummary = parentHistory
            .filter(m => m.role === 'user')
            .slice(-3)
            .map(m => m.content)
            .join('\n');

          subContext.addMessage({ 
            role: 'user', 
            content: `Context from parent agent:\n${contextSummary}\n\nObjective: ${task}\n\nWork on this task and use the 'done' tool when you are finished. If you cannot complete the task, explain why and use 'done'.` 
          });
          
          let result: any = null;
          // Sub-agent loop
          while (!result) {
            const turnResult = await runAgentTurn(subContext, depth + 1);
            if (turnResult && (turnResult as any).status === "Task completed.") {
              result = turnResult;
            } else if (turnResult && (turnResult as any).error) {
              result = turnResult;
            } else if (!turnResult) {
              // Agent responded without tool calls
              const history = subContext.getHistory();
              const lastAssistantMsg = history[history.length - 1];
              result = { 
                success: false, 
                message: lastAssistantMsg.role === 'assistant' ? lastAssistantMsg.content : 'Sub-agent stopped without calling done.' 
              };
            }
          }
          console.log(chalk.cyan(`\n[Sub-agent Finished (Depth: ${currentDepth})]: ${task}`));
          return result;
        };

        const toolResult = await executeTool(toolCall.name, args, runSubagent);
        
        console.log(chalk.green(`[Tool Result]: ${JSON.stringify(toolResult).substring(0, 100)}${JSON.stringify(toolResult).length > 100 ? '...' : ''}`));

        context.addMessage({
          role: 'user',
          content: `[SYSTEM] Tool ${toolCall.name} returned: ${JSON.stringify(toolResult)}`
        });

        if (toolCall.name === 'done') {
           return toolResult;
        }
      }

      // Automatically run another turn to process tool results
      return await runAgentTurn(context, depth);
    }
  } catch (error: any) {
    spinner.fail('Error in agent loop');
    console.error(chalk.red(error.message));
    return { error: error.message };
  }
}
