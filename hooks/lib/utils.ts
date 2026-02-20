/**
 * Cross-platform utility functions for Cursor hooks and scripts
 * Works on Windows, macOS, and Linux
 */

import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';

// Platform detection
export const isWindows = platform() === 'win32';
export const isMacOS = platform() === 'darwin';
export const isLinux = platform() === 'linux';

// --- Stdin ---

/**
 * Read and parse JSON from stdin with BOM stripping.
 * Shared by all hooks to avoid duplicated boilerplate.
 */
export async function readStdinJson<T = unknown>(): Promise<T> {
  let raw = '';
  for await (const chunk of Bun.stdin.stream()) {
    raw += new TextDecoder().decode(chunk);
  }
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return {} as T;
  }
}

// --- Paths ---

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

// Get the learned skills directory
export async function getLearnedSkillsDir(): Promise<string> {
  return join(await getClaudeDir(), 'skills', 'learned');
}

/**
 * Derive Cursor's project ID from a workspace root path.
 * Matches Cursor's naming convention: c-Users-Name-project-name
 * Cross-platform: handles Windows drive letters and Unix absolute paths.
 */
function deriveProjectId(workspaceRoot: string): string {
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

/**
 * Derive the sessions directory from a transcript path.
 * Transcript format: .../projects/PROJECT/agent-transcripts/UUID/UUID.jsonl
 */
export function getSessionsDirFromTranscript(transcriptPath: string): string {
  const projectDir = dirname(dirname(dirname(transcriptPath)));
  return join(projectDir, 'sessions');
}

// --- Date/Time ---

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

// --- File Operations ---

// Ensure a directory exists (create if not)
export async function ensureDir(dirPath: string): Promise<string> {
  if (!(await Bun.file(dirPath).exists())) {
    await Bun.write(join(dirPath, '.keep'), '');
  }
  return dirPath;
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

// --- System ---

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
