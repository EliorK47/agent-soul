#!/usr/bin/env bun
/**
 * Block MD Files Hook - Prevent creation of unnecessary documentation files
 * Performance-critical: runs on every Write tool call
 * Zero I/O: path-based rules only (StrReplace handles existing file edits)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raw = await Bun.stdin.text();

// Fast path: skip JSON.parse entirely if no doc extensions in input
if (!raw.includes('.md') && !raw.includes('.txt')) process.exit(0);

const input = JSON.parse(raw.replace(/^\uFEFF/, ''));
const rawFilePath =
  (input.tool_input?.file_path || input.tool_input?.path || '').trim();
const filePath = rawFilePath.startsWith('file://')
  ? fileURLToPath(rawFilePath)
  : rawFilePath;
const workspaceRoots: string[] = Array.isArray(input.workspace_roots)
  ? input.workspace_roots.filter((root: unknown) => typeof root === 'string' && root.length > 0)
  : [];
const workspaceRoot = path.resolve(
  workspaceRoots[0] ? workspaceRoots[0] : process.cwd(),
);

// Fast path: non-doc files (case-insensitive check after parse)
if (!/\.(md|txt)$/i.test(filePath)) process.exit(0);

const managedDirectories = new Set([
  'memory',
  'commands',
  'agents',
  'rules',
  'skills',
  'plans',
  'user',
  'soul',
]);
const allowedRootDocs = new Set([
  'readme.md',
  'changelog.md',
  'contributing.md',
  'license.md',
]);

const resolvedTarget = path.isAbsolute(filePath)
  ? path.resolve(filePath)
  : path.resolve(workspaceRoot, filePath);
const relativePath = path
  .relative(workspaceRoot, resolvedTarget)
  .replace(/^[/\\]+|[/\\]+$/g, '')
  .replace(/[/\\]+/g, '/')
  .toLowerCase();
const relativeParts = relativePath.startsWith('..') || path.isAbsolute(relativePath)
  ? []
  : relativePath.split('/').filter(Boolean);
const fileName = relativeParts.at(-1)?.toLowerCase() ?? '';
const cursorHome = typeof input.transcript_path === 'string'
  ? path.resolve(input.transcript_path.split('/.cursor/')[0], '.cursor')
  : null;
const inCursorManagedDir =
  cursorHome !== null &&
  resolvedTarget.startsWith(cursorHome + path.sep) &&
  resolvedTarget
    .slice(cursorHome.length + 1)
    .split(path.sep)
    .some((seg) => managedDirectories.has(seg.toLowerCase()));

// Allow files in managed directories
if (inCursorManagedDir) process.exit(0);

// Allow key documentation files only at repo root
if (relativeParts.length === 1 && allowedRootDocs.has(fileName)) process.exit(0);

// Block: deny via stdout JSON
console.log(
  JSON.stringify({
    permission: 'deny',
    user_message: `[Hook] Denied: Unnecessary documentation file.\nFile: ${filePath}. Use existing documentation files instead.`,
  }),
);
process.exit(2);
