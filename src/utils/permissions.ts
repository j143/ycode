import chalk from 'chalk';
import { rl } from './ui.js';

export async function requestPermission(toolName: string, args: any): Promise<boolean> {
  // Read-only tools might not need permission, but let's be safe
  if (toolName === 'ls' || toolName === 'cat') {
    return true;
  }

  const answer = await rl.question(
    chalk.yellow(`\n[Permission Request] Allow tool "${toolName}" with args ${JSON.stringify(args)}? (y/n): `)
  );

  return answer.toLowerCase() === 'y';
}
