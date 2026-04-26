import fs from 'fs/promises';
import path from 'path';

export async function executeTool(name: string, args: any): Promise<any> {
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
    default:
      throw new Error(`Tool ${name} not found`);
  }
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
