#!/usr/bin/env bun
/**
 * Tool Call Counter - preToolUse hook (fires on every tool call)
 *
 * Increments a numeric counter file. Read by suggest-compact (stop hook)
 * for milestone detection. Reset by pre-compact on context compaction.
 */

import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getSessionsDirFromTranscript, readStdinJson } from '../lib/utils';

interface CountToolInput {
  transcript_path?: string;
  conversation_id?: string;
}

const LOCK_RETRY_MS = 10;
const LOCK_RETRY_LIMIT = 50;
const STALE_LOCK_MS = 5000;

async function acquireLock(lockDir: string): Promise<boolean> {
  for (let attempt = 0; attempt < LOCK_RETRY_LIMIT; attempt++) {
    try {
      await mkdir(lockDir);
      return true;
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? error.code
          : null;

      if (code !== 'EEXIST') return false;

      try {
        const lockStats = await stat(lockDir);
        if (Date.now() - lockStats.mtimeMs > STALE_LOCK_MS) {
          await rm(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Lock disappeared between retries
      }

      await Bun.sleep(LOCK_RETRY_MS);
    }
  }

  return false;
}

try {
  const input = await readStdinJson<CountToolInput>();
  const transcriptPath: string | undefined = input.transcript_path;
  const sessionId: string | undefined = input.conversation_id;

  if (!transcriptPath || !sessionId) process.exit(0);

  const configDir = join(
    getSessionsDirFromTranscript(transcriptPath),
    'config',
  );
  const counterFile = join(configDir, `tool-count-${sessionId}`);
  const lockDir = join(configDir, `tool-count-${sessionId}.lock`);

  await mkdir(configDir, { recursive: true });

  try {
    if (!(await acquireLock(lockDir))) process.exit(0);

    let count = 0;
    try {
      count = parseInt(await readFile(counterFile, 'utf8'), 10) || 0;
    } catch {
      // File doesn't exist yet
    }

    await writeFile(counterFile, String(count + 1), 'utf8');
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
} catch {
  // Non-critical -- milestone tracking degrades gracefully
}

process.exit(0);
