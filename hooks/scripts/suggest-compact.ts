#!/usr/bin/env bun
/**
 * Session Milestone Tracker for Cursor
 *
 * Tracks tool call count and notifies AI at milestone intervals to update session file.
 * Handles compaction events by reducing effective count and logging to session file.
 * Uses flag file to prevent duplicate notifications per milestone bracket.
 */

import { dirname, join } from 'node:path';
import { appendToSession, findSession } from '../lib/session-manager';

interface StopInput {
  loop_count?: number;
  transcript_path?: string;
  conversation_id?: string;
  status?: string;
}

interface FlagData {
  messages_to_compact: number;
  transcript_path: string;
}

interface StopOutput {
  followup_message?: string;
}

function getProjectSessionsDir(transcriptPath: string): string {
  const projectDir = dirname(dirname(transcriptPath));
  return join(projectDir, 'sessions');
}

async function main() {
  // Read stdin
  let input = '';
  for await (const chunk of Bun.stdin.stream()) {
    input += new TextDecoder().decode(chunk);
  }

  const data: StopInput = JSON.parse(input.replace(/^\uFEFF/, ''));
  const loopCount = data.loop_count || 0;
  const transcriptPath = data.transcript_path;
  const sessionId = data.conversation_id || 'default';
  const _status = data.status || 'completed';

  // Skip if in loop or no transcript
  if (loopCount > 0 || !transcriptPath) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  const txtPath = transcriptPath.replace(/\.jsonl$/, '.txt');
  const sessionsDir = getProjectSessionsDir(txtPath);
  const configDir = join(sessionsDir, 'config');

  // Create directories if needed (Bun.write auto-creates parent dirs)
  await Bun.write(join(sessionsDir, '.keep'), '');
  await Bun.write(join(configDir, '.keep'), '');

  // === HANDLE COMPACTION FLAG ===
  const flagFile = join(configDir, `cursor-compacted-${sessionId}`);
  if (await Bun.file(flagFile).exists()) {
    try {
      const flagData: FlagData = await Bun.file(flagFile).json();
      await Bun.file(flagFile).writer().end();
      await Bun.file(flagFile).delete();

      // Count and offset
      let currentToolCount = 0;
      if (await Bun.file(txtPath).exists()) {
        const content = await Bun.file(txtPath).text();
        const matches = content.match(/\[Tool call\]/g);
        currentToolCount = matches ? matches.length : 0;
      }

      // Reset count to 0: offset = current count so effective becomes 0
      const offsetFile = join(configDir, `cursor-tool-offset-${sessionId}`);
      await Bun.write(offsetFile, String(currentToolCount));

      // Reset last notified so thresholds fire fresh
      const lastNotifiedFile = join(
        configDir,
        `cursor-last-notified-${sessionId}`,
      );
      await Bun.write(lastNotifiedFile, '0');

      // Update session file with compaction log
      const session = await findSession(sessionsDir, sessionId);
      if (session) {
        const time = new Date().toTimeString().split(' ')[0].slice(0, 5);
        const logEntry = `\n**${time}** - Context compacted (${flagData.messages_to_compact} messages summarized, tool count reset)\n`;
        await appendToSession(session.path, logEntry);
      }

      // After compaction message
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

  // === COUNT TOOL CALLS ===
  let toolCallCount = 0;
  if (await Bun.file(txtPath).exists()) {
    const content = await Bun.file(txtPath).text();
    const matches = content.match(/\[Tool call\]/g);
    toolCallCount = matches ? matches.length : 0;
  }

  // Apply offset (if compaction occurred)
  const offsetFile = join(configDir, `cursor-tool-offset-${sessionId}`);
  let offset = 0;
  if (await Bun.file(offsetFile).exists()) {
    offset = parseInt((await Bun.file(offsetFile).text()).trim(), 10) || 0;
  }

  const effectiveToolCount = Math.max(0, toolCallCount - offset);

  // === CHECK LAST NOTIFIED CALL COUNT ===
  const lastNotifiedFile = join(configDir, `cursor-last-notified-${sessionId}`);
  let lastNotifiedCallCount = 0;
  if (await Bun.file(lastNotifiedFile).exists()) {
    lastNotifiedCallCount =
      parseInt((await Bun.file(lastNotifiedFile).text()).trim(), 10) || 0;
  }

  // === MILESTONE DETECTION ===
  // Every 50 tool calls, reset on compact
  const INTERVAL = 50;

  // Check if we crossed the next interval boundary since last notification
  const nextMilestone =
    (Math.floor(lastNotifiedCallCount / INTERVAL) + 1) * INTERVAL;
  if (effectiveToolCount < nextMilestone) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  // Find session file (always exists from session-start hook)
  const session = await findSession(sessionsDir, sessionId);
  if (!session) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }
  const needsRename = session.titleSlug === 'session';

  // Determine message based on milestone number
  const milestoneNum = Math.floor(effectiveToolCount / INTERVAL);
  let message: string;

  if (milestoneNum === 1 && needsRename) {
    message = `[Compact Hook, First Update]: Read the template and update with current progress. Update memory if relevant.`;
  } else {
    message = `[Compact Hook, ${effectiveToolCount} tool calls]: Update session file with current progress. Update memory if relevant.`;
  }

  await Bun.write(lastNotifiedFile, String(effectiveToolCount));
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
