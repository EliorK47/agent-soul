#!/usr/bin/env bun
/**
 * PreCompact Hook - Signal that compaction occurred
 *
 * Creates a flag file so the stop hook can detect and notify the AI about compaction.
 */

import { join } from 'node:path';
import { getSessionsDirFromTranscript, readStdinJson } from '../lib/utils';

interface PreCompactInput {
  conversation_id?: string;
  transcript_path?: string;
  context_usage_percent?: number;
  messages_to_compact?: number;
}

interface FlagData {
  timestamp: string;
  context_usage_percent: number;
  messages_to_compact: number;
}

async function main() {
  const data = await readStdinJson<PreCompactInput>();

  const sessionId = data.conversation_id || 'default';
  const transcriptPath = data.transcript_path || '';

  if (!transcriptPath) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  const sessionsDir = getSessionsDirFromTranscript(transcriptPath);
  const configDir = join(sessionsDir, 'config');

  if (!(await Bun.file(sessionsDir).exists())) {
    await Bun.write(join(sessionsDir, '.keep'), '');
  }

  if (!(await Bun.file(configDir).exists())) {
    await Bun.write(join(configDir, '.keep'), '');
  }

  const flagFile = join(configDir, `cursor-compacted-${sessionId}`);
  const flagData: FlagData = {
    timestamp: new Date().toISOString(),
    context_usage_percent: data.context_usage_percent || 0,
    messages_to_compact: data.messages_to_compact || 0,
  };

  await Bun.write(flagFile, JSON.stringify(flagData));

  console.log(JSON.stringify({}));
  process.exit(0);
}

main().catch((err) => {
  console.error(
    '[PreCompact] Error:',
    err instanceof Error ? err.message : String(err),
  );
  console.log(JSON.stringify({}));
  process.exit(0);
});
