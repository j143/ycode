import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { executeTool } from './index.js';

describe('Tools Integration', () => {
  const testDir = path.join(process.cwd(), 'test-sandbox');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('ls should list files in a directory', async () => {
    await fs.writeFile(path.join(testDir, 'test.txt'), 'hello');
    const result = await executeTool('ls', { path: testDir });
    expect(result).toContainEqual(expect.objectContaining({ name: 'test.txt' }));
  });

  it('cat should read file content', async () => {
    const filePath = path.join(testDir, 'cat-test.txt');
    await fs.writeFile(filePath, 'content to read');
    const result = await executeTool('cat', { path: filePath });
    expect(result.content).toBe('content to read');
  });

  it('write should create a file with content', async () => {
    const filePath = path.join(testDir, 'write-test.txt');
    await executeTool('write', { path: filePath, content: 'new content' });
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('new content');
  });

  it('mkdir should create a directory', async () => {
    const subDir = path.join(testDir, 'sub-dir');
    await executeTool('mkdir', { path: subDir });
    const stat = await fs.stat(subDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('rm should remove a file', async () => {
    const filePath = path.join(testDir, 'rm-test.txt');
    await fs.writeFile(filePath, 'remove me');
    await executeTool('rm', { path: filePath });
    await expect(fs.access(filePath)).rejects.toThrow();
  });
});
