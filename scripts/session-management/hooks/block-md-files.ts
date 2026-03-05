#!/usr/bin/env bun
/**
 * Block MD Files Hook - Prevent creation of unnecessary documentation files
 * Performance-critical: runs on every Write tool call
 * Zero I/O: path-based rules only (StrReplace handles existing file edits)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

type PathInfo = {
  parts: string[];
  fileName: string;
};

function getPathInfo(baseDir: string, targetPath: string): PathInfo | null {
  const relativePath = path
    .relative(baseDir, targetPath)
    .replace(/^[/\\]+|[/\\]+$/g, '')
    .replace(/[/\\]+/g, '/')
    .toLowerCase();

  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  const parts = relativePath.split('/').filter(Boolean);
  return {
    parts,
    fileName: parts.at(-1) ?? '',
  };
}

function isAllowedByDirectory(
  pathInfo: PathInfo | null,
  allowedDirectories: Set<string>,
): boolean {
  return (
    pathInfo?.parts
      .slice(0, -1)
      .some((segment) => allowedDirectories.has(segment)) ?? false
  );
}

function isAllowedRepoRootFile(
  pathInfo: PathInfo | null,
  allowedRepoRootFiles: Set<string>,
): boolean {
  return (
    pathInfo !== null &&
    pathInfo.parts.length === 1 &&
    allowedRepoRootFiles.has(pathInfo.fileName)
  );
}

const raw = await Bun.stdin.text();

// Fast path: skip JSON.parse entirely if no doc extensions in input
if (!raw.includes('.md') && !raw.includes('.txt')) process.exit(0);

const input = JSON.parse(raw.replace(/^\uFEFF/, ''));
const rawFilePath = (
  input.tool_input?.file_path ||
  input.tool_input?.path ||
  ''
).trim();
const filePath = rawFilePath.startsWith('file://')
  ? fileURLToPath(rawFilePath)
  : rawFilePath;
const workspaceRoots: string[] = Array.isArray(input.workspace_roots)
  ? input.workspace_roots.filter(
      (root: unknown) => typeof root === 'string' && root.length > 0,
    )
  : [];
const workspaceRoot = path.resolve(
  workspaceRoots[0] ? workspaceRoots[0] : process.cwd(),
);

// Fast path: non-doc files (case-insensitive check after parse)
if (!/\.(md|txt)$/i.test(filePath)) process.exit(0);

const allowedDirectories = new Set([
  'memory',
  'commands',
  'agents',
  'rules',
  'skills',
  'plans',
  'user',
  'soul',
]);
const allowedRepoRootFiles = new Set([
  'readme.md',
  'changelog.md',
  'contributing.md',
  'license.md',
]);
const allowedBasenamesAnywhere = new Set<string>();

const resolvedTarget = path.isAbsolute(filePath)
  ? path.resolve(filePath)
  : path.resolve(workspaceRoot, filePath);
const workspaceInfo = getPathInfo(workspaceRoot, resolvedTarget);
const fileName = path.basename(resolvedTarget).toLowerCase();
const cursorHome =
  typeof input.transcript_path === 'string'
    ? path.resolve(input.transcript_path.split('/.cursor/')[0], '.cursor')
    : null;
const cursorInfo =
  cursorHome !== null ? getPathInfo(cursorHome, resolvedTarget) : null;

// Allow files in approved directories in the repo or .cursor home
if (isAllowedByDirectory(workspaceInfo, allowedDirectories)) process.exit(0);
if (isAllowedByDirectory(cursorInfo, allowedDirectories)) process.exit(0);

// Allow key documentation files only at repo root
if (isAllowedRepoRootFile(workspaceInfo, allowedRepoRootFiles)) process.exit(0);
if (allowedBasenamesAnywhere.has(fileName)) process.exit(0);

console.log(
  `Unnecessary documentation file: ${filePath}. Use existing documentation files instead.`,
);
process.exit(2);
