import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { executeTool } from './tools/index.js';
import { AgentContext } from './agent/context.js';

describe('Integration Verification', () => {
  const testDir = path.join(process.cwd(), 'integration-sandbox');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('edit tool should apply multiple surgical changes', async () => {
    const filePath = path.join(testDir, 'source.ts');
    await fs.writeFile(filePath, 'line 1\nline 2\nline 3');
    
    const result = await executeTool('edit', {
      path: filePath,
      edits: [
        { old_string: 'line 1', new_string: 'header' },
        { old_string: 'line 3', new_string: 'footer' }
      ]
    });

    expect(result.success).toBe(true);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('header\nline 2\nfooter');
  });

  it('bash tool should support background execution', async () => {
    // Start a long-running process (sleep) in background
    const result = await executeTool('bash', {
      command: 'sleep 10',
      background: true
    });

    expect(result.success).toBe(true);
    expect(result.pid).toBeDefined();
    expect(result.message).toContain('background');

    // Clean up: kill the background process
    if (result.pid) {
      process.kill(result.pid);
    }
  });

  it('subagent tool should receive context and return results', async () => {
    const mockTask = 'Find the entry point';
    const mockResult = { success: true, message: 'Found index.ts' };
    
    const runSubagent = vi.fn().mockResolvedValue(mockResult);
    
    const result = await executeTool('subagent', { task: mockTask }, runSubagent);
    
    expect(runSubagent).toHaveBeenCalledWith(mockTask);
    expect(result).toEqual(mockResult);
  });
});
