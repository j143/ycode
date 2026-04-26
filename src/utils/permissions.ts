import chalk from 'chalk';
import { rl } from './ui.js';

export async function requestPermission(toolName: string, args: any): Promise<boolean> {
  // Read-only tools might not need permission, but let's be safe
  if (toolName === 'ls' || toolName === 'cat' || toolName === 'search') {
    return true;
  }

  let promptColor = chalk.yellow;
  if (toolName === 'bash' || toolName === 'rm') {
    promptColor = chalk.red.bold;
  }

  const answer = await rl.question(
    promptColor(`\n[Permission Request] Allow tool "${toolName}"?\n`) +
    chalk.dim(`Arguments: ${JSON.stringify(args, null, 2)}\n`) +
    chalk.bold('Proceed? (y/n): ')
  );

  return answer.toLowerCase() === 'y';
}
