import { describe, it, expect } from 'vitest';
import { executeTool } from './tools/index.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Basic evaluation suite to verify tool-calling side effects.
 * This mimics the "Eval" patterns used in agentic systems.
 */
describe('Evals: File Operations', () => {
  const evalDir = path.join(process.cwd(), 'eval-sandbox');

  it('Task: Create a complex directory structure', async () => {
    const projectPath = path.join(evalDir, 'my-app');
    await executeTool('mkdir', { path: projectPath });
    await executeTool('mkdir', { path: path.join(projectPath, 'src') });
    await executeTool('write', { path: path.join(projectPath, 'src', 'main.ts'), content: 'console.log("hi");' });

    const stats = await fs.stat(path.join(projectPath, 'src', 'main.ts'));
    expect(stats.isFile()).toBe(true);
  });
});
