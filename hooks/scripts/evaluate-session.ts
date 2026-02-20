#!/usr/bin/env bun

import {
  countInFile,
  ensureDir,
  getLearnedSkillsDir,
  readStdinJson,
} from '../lib/utils';

interface SessionEndInput {
  transcript_path?: string;
}

interface SessionEndOutput {
  additional_context: string;
  continue: boolean;
}

try {
  const input = await readStdinJson<SessionEndInput>();
  const transcriptPath = input.transcript_path;

  const learnedSkillsPath = await getLearnedSkillsDir();
  await ensureDir(learnedSkillsPath);

  // If no transcript available, exit gracefully
  if (!transcriptPath || !(await Bun.file(transcriptPath).exists())) {
    console.log(
      JSON.stringify({
        additional_context: '[ContinuousLearning] No transcript available',
        continue: true,
      } as SessionEndOutput),
    );
    process.exit(0);
  }

  // Count user messages in session
  const messageCount = await countInFile(transcriptPath, /"role":"user"/g);

  // Skip short sessions (less than 10 messages)
  if (messageCount < 10) {
    console.log(
      JSON.stringify({
        additional_context: `[ContinuousLearning] Session too short (${messageCount} messages), skipping evaluation`,
        continue: true,
      } as SessionEndOutput),
    );
    process.exit(0);
  }

  // Note: sessionEnd output is ignored, but we format it correctly anyway
  const message = `[ContinuousLearning] Session has ${messageCount} messages.

If this session contained any:
- Useful patterns or workflows worth saving
- Configuration recipes
- Problem-solving approaches
- Tool usage patterns

Consider creating a skill file in: ${learnedSkillsPath}

Skill files should be markdown (.md) with clear examples and use cases.`;

  console.log(
    JSON.stringify({
      additional_context: message,
      continue: true,
    } as SessionEndOutput),
  );

  process.exit(0);
} catch (err) {
  // On error, still output valid JSON
  console.log(
    JSON.stringify({
      additional_context: `[ContinuousLearning] Error: ${err instanceof Error ? err.message : String(err)}`,
      continue: true,
    } as SessionEndOutput),
  );
  process.exit(0);
}
