/**
 * Cross-platform utility functions for Cursor hooks and scripts
 * Works on Windows, macOS, and Linux
 */

import { homedir, platform, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { $ } from 'bun';

// Platform detection
export const isWindows = platform() === 'win32';
export const isMacOS = platform() === 'darwin';
export const isLinux = platform() === 'linux';

// Get the user's home directory (cross-platform)
export function getHomeDir(): string {
  return homedir();
}

// Get the Claude/Cursor config directory
export async function getClaudeDir(): Promise<string> {
  const cursorDir = join(getHomeDir(), '.cursor');
  const claudeDir = join(getHomeDir(), '.claude');

  // Prefer .cursor if it exists, otherwise use .claude
  if (await Bun.file(cursorDir).exists()) {
    return cursorDir;
  }
  return claudeDir;
}

// Get the sessions directory
export async function getSessionsDir(): Promise<string> {
  return join(await getClaudeDir(), 'sessions');
}

// Get the learned skills directory
export async function getLearnedSkillsDir(): Promise<string> {
  return join(await getClaudeDir(), 'skills', 'learned');
}

// Get the temp directory (cross-platform)
export function getTempDir(): string {
  return tmpdir();
}

/**
 * Derive Cursor's project ID from a workspace root path.
 * Matches Cursor's naming convention: c-Users-Name-project-name
 * Cross-platform: handles Windows drive letters and Unix absolute paths.
 */
export function deriveProjectId(workspaceRoot: string): string {
  const { sep, parse } = require('node:path') as typeof import('path');
  const userHome = getHomeDir();
  const globalCursorPath = userHome ? join(userHome, '.cursor') : '';
  const isGlobalCursorFolder =
    globalCursorPath &&
    workspaceRoot.toLowerCase() === globalCursorPath.toLowerCase();

  const parsed = parse(workspaceRoot);

  if (parsed.root.match(/^[A-Za-z]:\\/)) {
    // Windows: C:\Users\Name\project -> c-Users-Name-project
    const drive = parsed.root.charAt(0).toLowerCase();
    const restPath = workspaceRoot
      .substring(parsed.root.length)
      .split(sep)
      .map((s) => (s === '.cursor' && isGlobalCursorFolder ? 'cursor' : s))
      .map((s) => s.replace(/\s+/g, '-'))
      .join('-');
    return `${drive}-${restPath}`;
  }

  // Unix: /Users/Name/project -> Users-Name-project
  return workspaceRoot
    .split(sep)
    .filter(Boolean)
    .map((s) => (s === '.cursor' && isGlobalCursorFolder ? 'cursor' : s))
    .map((s) => s.replace(/\s+/g, '-'))
    .join('-')
    .toLowerCase();
}

/**
 * Get the sessions directory for a given workspace root.
 * Uses deriveProjectId to match Cursor's project folder structure.
 */
export function getProjectSessionsDir(workspaceRoot: string): string {
  const userHome = getHomeDir();
  const projectId = deriveProjectId(workspaceRoot);
  return join(userHome, '.cursor', 'projects', projectId, 'sessions');
}

// Ensure a directory exists (create if not)
export async function ensureDir(dirPath: string): Promise<string> {
  if (!(await Bun.file(dirPath).exists())) {
    await Bun.write(join(dirPath, '.keep'), '');
  }
  return dirPath;
}

// Get current date in YYYY-MM-DD format
export function getDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get current time in HH:MM format
export function getTimeString(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Get short session ID from CLAUDE_SESSION_ID environment variable
export function getSessionIdShort(fallback: string = 'default'): string {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId || sessionId.length === 0) {
    return fallback;
  }
  return sessionId.slice(-8);
}

// Get current datetime in YYYY-MM-DD HH:MM:SS format
export function getDateTimeString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export interface FindFileResult {
  path: string;
  mtime: number;
}

export interface FindFilesOptions {
  maxAge?: number | null;
  recursive?: boolean;
}

// Find files matching a pattern in a directory
export async function findFiles(
  dir: string,
  pattern: string,
  options: FindFilesOptions = {},
): Promise<FindFileResult[]> {
  const { maxAge = null, recursive = false } = options;
  const results: FindFileResult[] = [];

  if (!(await Bun.file(dir).exists())) {
    return results;
  }

  // Convert simple glob pattern to Bun.glob compatible pattern
  const globPattern = recursive ? `${dir}/**/${pattern}` : `${dir}/${pattern}`;

  try {
    const glob = new Bun.Glob(globPattern);
    const fs = await import('node:fs/promises');

    for await (const file of glob.scan('.')) {
      const stats = await fs.stat(file);

      if (maxAge !== null) {
        const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
        if (ageInDays <= maxAge) {
          results.push({ path: file, mtime: stats.mtimeMs });
        }
      } else {
        results.push({ path: file, mtime: stats.mtimeMs });
      }
    }
  } catch {
    // Ignore errors
  }

  // Sort by modification time (newest first)
  results.sort((a, b) => b.mtime - a.mtime);

  return results;
}

// Read JSON from stdin (for hook input) - Not exported, use Bun.stdin.text() instead
export async function readStdinJson(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      try {
        if (data.trim()) {
          const cleanData = data.replace(/^\uFEFF/, '');
          resolve(JSON.parse(cleanData));
        } else {
          resolve({});
        }
      } catch (err) {
        reject(err);
      }
    });

    process.stdin.on('error', reject);
  });
}

// Log to stderr (visible to user)
export function log(message: string): void {
  console.error(message);
}

// Output to stdout (returned to Cursor)
export function output(data: object | string): void {
  if (typeof data === 'object') {
    console.log(JSON.stringify(data));
  } else {
    console.log(data);
  }
}

// Read a text file safely
export async function readFile(filePath: string): Promise<string | null> {
  try {
    return await Bun.file(filePath).text();
  } catch {
    return null;
  }
}

// Write a text file
export async function writeFile(
  filePath: string,
  content: string,
): Promise<void> {
  await ensureDir(dirname(filePath));
  await Bun.write(filePath, content);
}

// Append to a text file
export async function appendFile(
  filePath: string,
  content: string,
): Promise<void> {
  await ensureDir(dirname(filePath));
  const existing = (await Bun.file(filePath).exists())
    ? await Bun.file(filePath).text()
    : '';
  await Bun.write(filePath, existing + content);
}

// Check if a command exists in PATH
export async function commandExists(cmd: string): Promise<boolean> {
  // Validate command name - only allow alphanumeric, dash, underscore, dot
  if (!/^[a-zA-Z0-9_.-]+$/.test(cmd)) {
    return false;
  }

  try {
    // Add timeout to prevent hanging on Windows
    const whichPromise = Bun.which(cmd);
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 500),
    );

    const path = await Promise.race([whichPromise, timeoutPromise]);
    return path !== null;
  } catch {
    return false;
  }
}

export interface CommandResult {
  success: boolean;
  output: string;
}

// Run a command and return output
export async function runCommand(
  cmd: string,
  _options: object = {},
): Promise<CommandResult> {
  try {
    const result = await $`${cmd}`.nothrow();
    const output = result.text();

    if (result.exitCode === 0) {
      return { success: true, output: output.trim() };
    } else {
      return { success: false, output: result.stderr.toString() };
    }
  } catch (err: unknown) {
    return { success: false, output: String(err) };
  }
}

// Check if current directory is a git repository
export async function isGitRepo(): Promise<boolean> {
  return (await runCommand('git rev-parse --git-dir')).success;
}

// Get git modified files
export async function getGitModifiedFiles(
  patterns: string[] = [],
): Promise<string[]> {
  if (!(await isGitRepo())) return [];

  const result = await runCommand('git diff --name-only HEAD');
  if (!result.success) return [];

  let files = String(result.output).split('\n').filter(Boolean);

  if (patterns.length > 0) {
    files = files.filter((file: string) => {
      return patterns.some((pattern) => {
        const regex = new RegExp(pattern);
        return regex.test(file);
      });
    });
  }

  return files;
}

// Replace text in a file (cross-platform sed alternative)
export async function replaceInFile(
  filePath: string,
  search: string | RegExp,
  replace: string,
): Promise<boolean> {
  const content = await readFile(filePath);
  if (content === null) return false;

  const newContent = content.replace(search, replace);
  await writeFile(filePath, newContent);
  return true;
}

// Count occurrences of a pattern in a file
export async function countInFile(
  filePath: string,
  pattern: string | RegExp,
): Promise<number> {
  const content = await readFile(filePath);
  if (content === null) return 0;

  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'g');
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

export interface GrepResult {
  lineNumber: number;
  content: string;
}

// Search for pattern in file and return matching lines with line numbers
export async function grepFile(
  filePath: string,
  pattern: string | RegExp,
): Promise<GrepResult[]> {
  const content = await readFile(filePath);
  if (content === null) return [];

  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  const lines = content.split('\n');
  const results: GrepResult[] = [];

  lines.forEach((line, index) => {
    if (regex.test(line)) {
      results.push({ lineNumber: index + 1, content: line });
    }
  });

  return results;
}

// Session file functions moved to session-manager.ts:
// - getCurrentSessionFile -> buildSessionFilename
// - createSessionTemplate -> createSessionTemplate
