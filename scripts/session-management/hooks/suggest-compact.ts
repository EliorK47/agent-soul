#!/usr/bin/env bun
/**
 * Session Milestone Tracker for Cursor
 *
 * Tracks tool call count via counter file (populated by count-tool.ts preToolUse hook)
 * and notifies AI at milestone intervals to update session file.
 * Handles compaction events by resetting counter and logging to session file.
 * Uses flag file to prevent duplicate notifications per milestone bracket.
 */

import { join } from 'node:path';
import { appendToSession, findSession } from '../lib/session-manager';
import {
  getSessionsDirFromTranscript,
  getTimeString,
  readStdinJson,
} from '../lib/utils';

interface StopInput {
  loop_count?: number;
  transcript_path?: string;
  conversation_id?: string;
  status?: string;
}

interface FlagData {
  messages_to_compact: number;
}

interface StopOutput {
  followup_message?: string;
}

async function getToolCount(counterFile: string): Promise<number> {
  try {
    return parseInt(await Bun.file(counterFile).text(), 10) || 0;
  } catch {
    return 0;
  }
}

async function main() {
  const data = await readStdinJson<StopInput>();
  const loopCount = data.loop_count || 0;
  const transcriptPath = data.transcript_path;
  const sessionId = data.conversation_id || 'default';

  // Skip if in a follow-up loop or no transcript available
  if (loopCount > 0 || !transcriptPath) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  const sessionsDir = getSessionsDirFromTranscript(transcriptPath);
  const configDir = join(sessionsDir, 'config');
  const counterFile = join(configDir, `tool-count-${sessionId}`);

  // Handle compaction: reset counters and log to session file
  const flagFile = join(configDir, `cursor-compacted-${sessionId}`);
  if (await Bun.file(flagFile).exists()) {
    try {
      const flagData: FlagData = await Bun.file(flagFile).json();
      await Bun.file(flagFile).delete();

      // Reset counter to zero
      await Bun.write(counterFile, '0');

      // Reset last notified so thresholds fire fresh
      const lastNotifiedFile = join(
        configDir,
        `cursor-last-notified-${sessionId}`,
      );
      await Bun.write(lastNotifiedFile, '0');

      // Update session file with compaction log
      const session = await findSession(sessionsDir, sessionId);
      if (session) {
        const time = getTimeString();
        const logEntry = `\n**${time}** - Context compacted (${flagData.messages_to_compact} messages summarized, tool count reset)\n`;
        await appendToSession(session.path, logEntry);
      }

      const message = `[Compact Hook] ${flagData.messages_to_compact} messages summarized. Read the session file for context. If critical details are missing, check the full transcript.`;

      console.log(JSON.stringify({ followup_message: message } as StopOutput));
      process.exit(0);
    } catch (err) {
      console.error(
        '[StrategicCompact] Compaction flag error:',
        err instanceof Error ? err.message : String(err),
      );
      if (await Bun.file(flagFile).exists()) {
        await Bun.file(flagFile).delete();
      }
    }
  }

  // Read tool count from counter file (incremented by count-tool.ts preToolUse hook)
  const toolCallCount = await getToolCount(counterFile);

  // Check what count we last notified at to avoid duplicate notifications
  const lastNotifiedFile = join(configDir, `cursor-last-notified-${sessionId}`);
  let lastNotifiedCallCount = 0;
  if (await Bun.file(lastNotifiedFile).exists()) {
    lastNotifiedCallCount =
      parseInt((await Bun.file(lastNotifiedFile).text()).trim(), 10) || 0;
  }

  // Fire a milestone reminder every N tool calls
  const INTERVAL = 50;

  const nextMilestone = lastNotifiedCallCount + INTERVAL;
  if (toolCallCount < nextMilestone) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  const session = await findSession(sessionsDir, sessionId);
  if (!session) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }
  const needsRename = session.titleSlug === 'session';

  // First milestone on an unnamed session prompts to fill in the template
  const milestoneNum = Math.floor(toolCallCount / INTERVAL);
  let message: string;

  if (milestoneNum === 1 && needsRename) {
    message = `[Compact Hook, First Update]: Read the template and update with current progress. Update memory if relevant.`;
  } else {
    message = `[Compact Hook, ${toolCallCount} tool calls]: Update session file with current progress. Update memory if relevant.`;
  }

  await Bun.write(lastNotifiedFile, String(toolCallCount));
  console.log(JSON.stringify({ followup_message: message } as StopOutput));
  process.exit(0);
}

main().catch((err) => {
  console.error(
    '[StrategicCompact] Error:',
    err instanceof Error ? err.message : String(err),
  );
  console.log(JSON.stringify({}));
  process.exit(0);
});
