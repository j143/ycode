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

  it('Task: Execute bash command', async () => {
    const result = await executeTool('bash', { command: 'echo "hello world"' });
    expect(result.stdout.trim()).toBe('hello world');
  });

  it('Task: Search for a pattern', async () => {
    const testFile = path.join(evalDir, 'search-test.txt');
    await fs.writeFile(testFile, 'target pattern here');
    const result = await executeTool('search', { pattern: 'target pattern', path: evalDir });
    expect(result).toContainEqual(expect.objectContaining({ content: 'target pattern here' }));
  });

  it('Task: Surgical replacement', async () => {
    const testFile = path.join(evalDir, 'replace-test.txt');
    await fs.writeFile(testFile, 'original content');
    await executeTool('replace', { path: testFile, old_string: 'original', new_string: 'updated' });
    const content = await fs.readFile(testFile, 'utf-8');
    expect(content).toBe('updated content');
  });
});
