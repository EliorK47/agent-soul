#!/usr/bin/env bun
/**
 * SessionEnd Hook - Cleanup unused sessions and finalize active ones
 *
 * Runs when session ends:
 * 1. Delete if session file is still a template (unused)
 * 2. Keep if session was actively used
 */

import { normalize } from 'path';
import { findSession, readSession, isTemplate, deleteSession, renameSessionFromTitle } from '../lib/session-manager';
import { getProjectSessionsDir } from '../lib/utils';

interface SessionEndInput {
  session_id?: string;
  conversation_id?: string;
  workspace_roots?: string[];
}

async function main() {
  // Read stdin
  let input = '';
  for await (const chunk of Bun.stdin.stream()) {
    input += new TextDecoder().decode(chunk);
  }

  const data: SessionEndInput = JSON.parse(input.replace(/^\uFEFF/, ''));
  const sessionId = data.session_id || data.conversation_id || 'default';
  const workspaceRoot = data.workspace_roots?.[0]
    ? normalize(data.workspace_roots[0].replace(/^\/([a-z]:)/i, '$1'))
    : null;

  if (!workspaceRoot) {
    process.exit(0);
  }

  // Derive sessions directory from workspace root
  const sessionsDir = getProjectSessionsDir(workspaceRoot);

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

main().catch(err => {
  console.error('[SessionEnd] Error:', err instanceof Error ? err.message : String(err));
  process.exit(0);
});
