#!/usr/bin/env bun
/**
 * Block MD Files Hook - Prevent creation of unnecessary documentation files
 * Performance-critical: runs on every Write tool call
 * Zero I/O: path-based rules only (StrReplace handles existing file edits)
 */

export {};

const raw = await Bun.stdin.text();

// Fast path: skip JSON.parse entirely if no doc extensions in input
if (!raw.includes('.md') && !raw.includes('.txt')) process.exit(0);

const input = JSON.parse(raw.replace(/^\uFEFF/, ''));
const filePath: string =
  input.tool_input?.file_path || input.tool_input?.path || '';

// Fast path: non-doc files (case-insensitive check after parse)
if (!/\.(md|txt)$/i.test(filePath)) process.exit(0);

// Allow files in managed directories
if (/[\\/](memory|commands|agents|rules|skills|plans)[\\/]/i.test(filePath))
  process.exit(0);

// Block: deny via stdout JSON
console.log(
  JSON.stringify({
    permission: 'deny',
    user_message: `[Hook] Denied: Unnecessary documentation file.\nFile: ${filePath}. Use existing documentation files instead.`,
  }),
);
process.exit(2);
