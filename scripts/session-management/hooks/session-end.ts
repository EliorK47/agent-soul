#!/usr/bin/env bun
/**
 * SessionEnd Hook - Cleanup unused sessions and finalize active ones
 *
 * Runs when session ends:
 * 1. Delete if session file is still a template (unused)
 * 2. Keep if session was actively used
 */

import { normalize } from 'node:path';
import {
  deleteSession,
  findSession,
  isTemplate,
  readSession,
  renameSessionFromTitle,
} from '../lib/session-manager';
import {
  getProjectSessionsDir,
  getSessionsDirFromTranscript,
  readStdinJson,
} from '../lib/utils';

interface SessionEndInput {
  session_id?: string;
  conversation_id?: string;
  workspace_roots?: string[];
  transcript_path?: string;
}

async function main() {
  const data = await readStdinJson<SessionEndInput>();
  const sessionId = data.session_id || data.conversation_id || 'default';

  let sessionsDir: string | null = null;

  if (data.transcript_path) {
    sessionsDir = getSessionsDirFromTranscript(data.transcript_path);
  } else {
    const workspaceRoot = data.workspace_roots?.[0]
      ? normalize(data.workspace_roots[0].replace(/^\/([a-z]:)/i, '$1'))
      : null;
    if (workspaceRoot) {
      sessionsDir = getProjectSessionsDir(workspaceRoot);
    }
  }

  if (!sessionsDir) {
    process.exit(0);
  }

  // Find session by UUID (works even if file was renamed)
  const session = await findSession(sessionsDir, sessionId);
  if (session) {
    const content = await readSession(session.path);
    if (content && isTemplate(content)) {
      await deleteSession(session.path);
    } else if (content && session.titleSlug === 'session') {
      // Auto-rename based on title if AI updated it but didn't rename the file
      await renameSessionFromTitle(session, content);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(
    '[SessionEnd] Error:',
    err instanceof Error ? err.message : String(err),
  );
  process.exit(0);
});
