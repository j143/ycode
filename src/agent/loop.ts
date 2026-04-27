import chalk from 'chalk';
import ora from 'ora';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { AgentContext } from './context.js';
import { executeTool } from '../tools/index.js';
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
  if (depth > 5) return { error: 'Maximum sub-agent recursion depth reached.' };

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
      if (delta?.content) {
        fullContent += delta.content;
        process.stdout.write(delta.content);
      }
    }
    process.stdout.write('\n');
    context.addMessage({ role: 'assistant', content: fullContent });

    // [CODE-FIRST PARSER]
    const codeBlockRegex = /```([a-z_]+)\s*(.*)\n([\s\S]*?)(?:```|$)/gi;
    let match;
    const toolCalls: {name: string, args: any}[] = [];

    while ((match = codeBlockRegex.exec(fullContent)) !== null) {
      const toolName = match[1].toLowerCase();
      const lineArg = match[2].trim();
      const blockContent = match[3].trim();

      let args: any = {};
      switch (toolName) {
        case 'write': args = { path: lineArg, content: blockContent }; break;
        case 'bash': args = { command: blockContent, background: lineArg.includes('bg') }; break;
        case 'plan': args = { action: 'set', steps: blockContent.split('\n').map(s => s.trim().replace(/^[\d\-\.\*☑☐\s]+/, '')) }; break;
        case 'think': args = { thought: blockContent }; break;
        case 'ls':
        case 'cat':
        case 'rm':
        case 'mkdir':
        case 'get_type_definitions': args = { path: lineArg, dir: lineArg }; break;
        case 'search': args = { pattern: lineArg }; break;
        case 'done': args = { message: blockContent }; break;
        case 'subagent': args = { task: lineArg || blockContent }; break;
        case 'edit':
           const edits = [];
           const editBlocks = blockContent.split(/<<<< SEARCH|==== REPLACE|>>>>/);
           for(let i=1; i<editBlocks.length; i+=3) {
             edits.push({ old_string: editBlocks[i].trim(), new_string: editBlocks[i+1].trim() });
           }
           args = { path: lineArg, edits };
           break;
        default: continue;
      }
      toolCalls.push({ name: toolName === 'plan' ? 'manage_plan' : toolName, args });
    }

    // Fallback XML
    if (toolCalls.length === 0) {
      const xmlRegex = /<tool_call\s+name="([^"]+)">([\s\S]*?)(?:<\/tool_call>|$)/gi;
      let xmlMatch;
      while ((xmlMatch = xmlRegex.exec(fullContent)) !== null) {
        try { toolCalls.push({ name: xmlMatch[1], args: JSON.parse(xmlMatch[2].trim()) }); } catch(e) {}
      }
    }

    if (toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        console.log(chalk.yellow(`\n[Action]: ${toolCall.name}`));
        const allowed = await requestPermission(toolCall.name, toolCall.args);
        if (!allowed) continue;

        const runSubagent = async (task: string) => {
          const subContext = new AgentContext();
          subContext.addMessage({ role: 'user', content: `Objective: ${task}\n\nWork on this task and use the 'done' tool when you are finished.` });
          let result: any = null;
          while (!result) {
            const turnResult = await runAgentTurn(subContext, depth + 1);
            if (turnResult && (turnResult as any).status === "Task completed.") result = turnResult;
            else if (turnResult && (turnResult as any).error) result = turnResult;
            else if (!turnResult) {
               const history = subContext.getHistory();
               const lastAssistantMsg = history[history.length - 1];
               result = { success: false, message: lastAssistantMsg.role === 'assistant' ? lastAssistantMsg.content : 'Sub-agent stopped.' };
            }
          }
          return result;
        };

        let toolResult = await executeTool(toolCall.name, toolCall.args, runSubagent);

        // Auto-Linting
        if ((toolCall.name === 'edit' || toolCall.name === 'write') && !toolResult.error) {
           const lintResult = await executeTool('bash', { command: 'npm run build' });
           if (lintResult.error || (lintResult.stderr && lintResult.stderr.includes('error'))) {
             toolResult = { success: false, error: 'Build failed after changes.', details: lintResult.stderr || lintResult.error };
           }
        }
        
        console.log(chalk.green(`[Result]: ${JSON.stringify(toolResult).substring(0, 100)}...`));
        context.addMessage({ role: 'user', content: `[SYSTEM] Tool ${toolCall.name} returned: ${JSON.stringify(toolResult)}` });
        if (toolCall.name === 'done') return toolResult;
      }
      return await runAgentTurn(context, depth);
    }
  } catch (error: any) {
    spinner.fail('Error in agent loop');
    console.error(chalk.red(error.message));
    return { error: error.message };
  }
}
