#!/usr/bin/env bun
/**
 * PreCompact Hook - Signal that compaction occurred
 *
 * Minimal implementation: Creates a flag file so the stop hook can detect
 * and notify the AI about compaction.
 */

import { join, dirname } from 'path';

interface PreCompactInput {
  conversation_id?: string;
  transcript_path?: string;
  context_usage_percent?: number;
  messages_to_compact?: number;
}

interface FlagData {
  timestamp: string;
  transcript_path: string;
  context_usage_percent: number;
  messages_to_compact: number;
}

function getProjectSessionsDir(transcriptPath: string): string {
  // Extract project dir from transcript path
  // e.g., c:\...\projects\PROJECT\agent-transcripts\file.txt
  //    -> c:\...\projects\PROJECT\sessions\
  const projectDir = dirname(dirname(transcriptPath));
  return join(projectDir, 'sessions');
}

async function main() {
  // Read stdin
  let input = '';
  for await (const chunk of Bun.stdin.stream()) {
    input += new TextDecoder().decode(chunk);
  }

  const cleanInput = input.replace(/^\uFEFF/, '');
  const data: PreCompactInput = JSON.parse(cleanInput);

  const sessionId = data.conversation_id || 'default';
  const transcriptPath = data.transcript_path || '';
  const txtPath = transcriptPath.replace(/\.jsonl$/, '.txt');

  // Get project-specific sessions directory
  const sessionsDir = getProjectSessionsDir(txtPath);
  const configDir = join(sessionsDir, 'config');

  // Ensure sessions directory exists
  if (!await Bun.file(sessionsDir).exists()) {
    await Bun.write(join(sessionsDir, '.keep'), '');
  }

  if (!await Bun.file(configDir).exists()) {
    await Bun.write(join(configDir, '.keep'), '');
  }

  // Create minimal flag file for stop hook
  const flagFile = join(configDir, `cursor-compacted-${sessionId}`);
  const flagData: FlagData = {
    timestamp: new Date().toISOString(),
    transcript_path: txtPath,
    context_usage_percent: data.context_usage_percent || 0,
    messages_to_compact: data.messages_to_compact || 0
  };

  await Bun.write(flagFile, JSON.stringify(flagData));

  // Output confirmation
  console.log(JSON.stringify({}));
  process.exit(0);
}

main().catch(err => {
  console.error('[PreCompact] Error:', err instanceof Error ? err.message : String(err));
  console.log(JSON.stringify({}));
  process.exit(0);
});
