#!/usr/bin/env bun
/**
 * Tool Call Counter - preToolUse hook (fires on every tool call)
 *
 * Increments a numeric counter file. Read by suggest-compact (stop hook)
 * for milestone detection. Reset by pre-compact on context compaction.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getSessionsDirFromTranscript } from '../lib/utils';

try {
  const raw = await Bun.stdin.text();
  const input = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const transcriptPath: string | undefined = input.transcript_path;
  const sessionId: string | undefined = input.conversation_id;

  if (!transcriptPath || !sessionId) process.exit(0);

  const configDir = join(getSessionsDirFromTranscript(transcriptPath), 'config');
  const counterFile = join(configDir, `tool-count-${sessionId}`);

  await mkdir(configDir, { recursive: true });

  let count = 0;
  try {
    count = parseInt(await readFile(counterFile, 'utf8'), 10) || 0;
  } catch {
    // File doesn't exist yet
  }

  await writeFile(counterFile, String(count + 1), 'utf8');
} catch {
  // Non-critical -- milestone tracking degrades gracefully
}

process.exit(0);
