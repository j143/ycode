import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { glob } from 'glob';

const execAsync = promisify(exec);

export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'ls',
      description: 'List files in a directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The path to the directory (defaults to current directory ".")' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cat',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The path to the file' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write',
      description: 'Write content to a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The path to the file' },
          content: { type: 'string', description: 'The content to write' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rm',
      description: 'Remove a file or directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The path to the file or directory' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mkdir',
      description: 'Create a new directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The path to the directory' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Execute a shell command. Use background: true for servers or long-running tasks.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          background: { type: 'boolean', description: 'Whether to run the command in the background (default: false)' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description: 'Search for a regex pattern in the codebase',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'The regex pattern to search for' },
          path: { type: 'string', description: 'The directory to search in (defaults to ".")' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'replace',
      description: 'Surgically replace a string in a file with another string',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The path to the file' },
          old_string: { type: 'string', description: 'The exact string to be replaced' },
          new_string: { type: 'string', description: 'The new string to replace it with' }
        },
        required: ['path', 'old_string', 'new_string']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description: 'Surgically edit a file using search and replace blocks. Use this for precise code modifications.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The path to the file' },
          edits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                old_string: { type: 'string', description: 'The exact text to find' },
                new_string: { type: 'string', description: 'The text to replace it with' }
              },
              required: ['old_string', 'new_string']
            }
          }
        },
        required: ['path', 'edits']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'manage_plan',
      description: 'Create or update a multi-step plan for complex tasks. This keeps you focused on the overall goal.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['set', 'update', 'get'], description: 'Action to perform' },
          steps: { type: 'array', items: { type: 'string' }, description: 'The list of steps (for "set")' },
          completed_step_index: { type: 'number', description: 'The index of the step just completed (for "update")' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_type_definitions',
      description: 'Extract all TypeScript interface and type definitions from the project to get a high-level map of data structures.',
      parameters: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: 'Directory to scan (defaults to "src")' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'think',
      description: 'Reason and plan next steps without performing an external action. Use this for complex multi-step tasks.',
      parameters: {
        type: 'object',
        properties: {
          thought: { type: 'string', description: 'Your internal reasoning or plan' }
        },
        required: ['thought']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'done',
      description: 'Signal that the requested task or overall goal is completely finished.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'A brief summary of what was accomplished' }
        },
        required: ['message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Get the short status of the git repository',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Show changes between commits, commit and working tree, etc.',
      parameters: {
        type: 'object',
        properties: {
          staged: { type: 'boolean', description: 'Whether to show staged changes' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_add',
      description: 'Add file contents to the index',
      parameters: {
        type: 'object',
        properties: {
          files: { type: 'array', items: { type: 'string' }, description: 'List of files to add' }
        },
        required: ['files']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Record changes to the repository',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message' }
        },
        required: ['message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: 'Find files matching a glob pattern (e.g., "src/**/*.ts")',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'The glob pattern to match' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'subagent',
      description: 'Delegate a specific task to a sub-agent. The sub-agent has its own context and will work until it completes the task.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'The specific task or objective for the sub-agent' }
        },
        required: ['task']
      }
    }
  }
];

export async function executeTool(name: string, args: any, runSubagent?: (task: string) => Promise<any>): Promise<any> {
  switch (name) {
    case 'ls':
      return await ls(args.path || '.');
    case 'cat':
      return await cat(args.path);
    case 'write':
      return await write(args.path, args.content);
    case 'rm':
      return await rm(args.path);
    case 'mkdir':
      return await mkdir(args.path);
    case 'bash':
      return await bash(args.command, args.background);
    case 'search':
      return await search(args.pattern, args.path || '.');
    case 'replace':
      return await replace(args.path, args.old_string, args.new_string);
    case 'edit':
      return await edit(args.path, args.edits);
    case 'manage_plan':
      return await managePlan(args.action, args.steps, args.completed_step_index);
    case 'get_type_definitions':
      return await getTypeDefinitions(args.dir || 'src');
    case 'think':
      return { success: true, thought: args.thought };
    case 'done':
      return { success: true, message: args.message, status: "Task completed." };
    case 'git_status':
      return await gitStatus();
    case 'git_diff':
      return await gitDiff(args.staged);
    case 'git_add':
      return await gitAdd(args.files);
    case 'git_commit':
      return await gitCommit(args.message);
    case 'glob':
      return await runGlob(args.pattern);
    case 'subagent':
      if (runSubagent) {
        return await runSubagent(args.task);
      }
      return { error: 'Subagent functionality is not available in this context.' };
    default:
      throw new Error(`Tool ${name} not found`);
  }
}

async function runGlob(pattern: string) {
  try {
    const files = await glob(pattern, { ignore: 'node_modules/**' });
    return { files };
  } catch (error: any) {
    return { error: error.message };
  }
}

let currentPlan: { steps: string[], completed: number[] } = { steps: [], completed: [] };

async function managePlan(action: 'set' | 'update' | 'get', steps?: string[], completedIndex?: number) {
  if (action === 'set' && steps) {
    currentPlan = { steps, completed: [] };
    return { success: true, plan: currentPlan };
  }
  if (action === 'update' && completedIndex !== undefined) {
    if (!currentPlan.completed.includes(completedIndex)) {
      currentPlan.completed.push(completedIndex);
    }
    return { success: true, plan: currentPlan };
  }
  return currentPlan;
}

async function getTypeDefinitions(dir: string) {
  try {
    const results: string[] = [];
    const files = await glob(`${dir}/**/*.ts*`, { ignore: 'node_modules/**' });
    
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const lines = content.split('\n');
      const types = lines.filter(l => l.startsWith('export interface') || l.startsWith('export type') || l.startsWith('export class'));
      if (types.length > 0) {
        results.push(`\n--- ${file} ---\n${types.join('\n')}`);
      }
    }
    return results.join('\n');
  } catch (error: any) {
    return { error: error.message };
  }
}


async function gitStatus() {
  return await bash('git status --short');
}

async function gitDiff(staged: boolean = false) {
  const cmd = staged ? 'git diff --staged' : 'git diff';
  return await bash(cmd);
}

async function gitAdd(files: string[]) {
  const filesStr = files.join(' ');
  return await bash(`git add ${filesStr}`);
}

async function gitCommit(message: string) {
  return await bash(`git commit -m "${message.replace(/"/g, '\\"')}"`);
}

async function ls(dirPath: string) {
  try {
    const files = await fs.readdir(dirPath);
    const stats = await Promise.all(
      files.map(async (f) => {
        const s = await fs.stat(path.join(dirPath, f));
        return {
          name: f,
          isDirectory: s.isDirectory(),
          size: s.size,
        };
      })
    );
    return stats;
  } catch (error: any) {
    return { error: error.message };
  }
}

async function cat(filePath: string) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { content };
  } catch (error: any) {
    return { error: error.message };
  }
}

async function write(filePath: string, content: string) {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}

async function rm(filePath: string) {
  try {
    await fs.rm(filePath, { recursive: true, force: true });
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}

async function mkdir(dirPath: string) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}

const backgroundProcesses = new Map<number, { command: string, child: any }>();

async function bash(command: string, background: boolean = false) {
  if (background) {
    try {
      const child = exec(command);
      const pid = child.pid;
      if (pid) {
        backgroundProcesses.set(pid, { command, child });
        // Don't wait for completion
        return { 
          success: true, 
          message: `Process started in background with PID ${pid}.`,
          pid 
        };
      }
      return { error: 'Failed to start background process.' };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  try {
    const { stdout, stderr } = await execAsync(command);
    return { stdout, stderr };
  } catch (error: any) {
    return { 
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr
    };
  }
}

async function search(pattern: string, dirPath: string) {
  try {
    const results: { file: string, line: number, content: string }[] = [];
    
    async function walk(dir: string) {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (file === 'node_modules' || file === '.git') continue;
        
        const s = await fs.stat(fullPath);
        if (s.isDirectory()) {
          await walk(fullPath);
        } else {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          const regex = new RegExp(pattern);
          lines.forEach((line, index) => {
            if (regex.test(line)) {
              results.push({ file: fullPath, line: index + 1, content: line.trim() });
            }
          });
        }
      }
    }
    
    await walk(dirPath);
    return results.slice(0, 50);
  } catch (error: any) {
    return { error: error.message };
  }
}

async function replace(filePath: string, oldString: string, newString: string) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const occurrences = content.split(oldString).length - 1;
    
    if (occurrences === 0) {
      return { error: `Could not find exact string: "${oldString}"` };
    }
    if (occurrences > 1) {
      return { error: `Ambiguous replacement: found ${occurrences} occurrences of "${oldString}"` };
    }
    
    const newContent = content.replace(oldString, newString);
    await fs.writeFile(filePath, newContent, 'utf-8');
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}

async function edit(filePath: string, edits: { old_string: string, new_string: string }[]) {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    
    for (const { old_string, new_string } of edits) {
      const occurrences = content.split(old_string).length - 1;
      
      if (occurrences === 0) {
        const lines = content.split('\n');
        const searchSnippet = old_string.split('\n')[0].trim();
        const suggestions = lines
          .map((l, i) => ({ line: l, index: i }))
          .filter(l => l.line.includes(searchSnippet))
          .slice(0, 3);
          
        return { 
          error: `Could not find exact string in ${filePath}.`,
          hint: `The first line of your search block ("${searchSnippet}") matched these lines in the file. Please refine your 'old_string':`,
          suggestions: suggestions.map(s => `Line ${s.index + 1}: ${s.line.trim()}`)
        };
      }
      
      if (occurrences > 1) {
        return { error: `Ambiguous replacement: found ${occurrences} occurrences of the search block in ${filePath}. Please provide more context in 'old_string'.` };
      }
      content = content.replace(old_string, new_string);
    }
    
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true, message: `Applied ${edits.length} edits to ${filePath}` };
  } catch (error: any) {
    return { error: error.message };
  }
}
