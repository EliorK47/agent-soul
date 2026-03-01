#!/usr/bin/env bun
/**
 * SessionStart Hook - Initialize session and load previous context
 *
 * Orchestrates: bootstrap -> init session -> load content -> build context
 */

import { join, normalize } from 'node:path';
import { ensureWorkspaceSetup } from '../lib/bootstrap';
import { getPackageManager } from '../lib/package-manager';
import { initSession, listSessions } from '../lib/session-manager';
import { getProjectSessionsDir, readStdinJson } from '../lib/utils';

interface SessionStartInput {
  // Common schema (all hooks)
  conversation_id?: string;
  generation_id?: string;
  model?: string;
  hook_event_name?: string;
  cursor_version?: string;
  workspace_roots?: string[];
  user_email?: string | null;
  transcript_path?: string | null; // always null at sessionStart
  // sessionStart-specific
  session_id?: string;
  is_background_agent?: boolean;
  composer_mode?: string; // "agent" | "ask" | "edit"
}

interface SessionStartOutput {
  additional_context: string;
}

async function main() {
  const data = await readStdinJson<SessionStartInput>();
  const sessionId =
    data.session_id || data.conversation_id || crypto.randomUUID();
  const workspaceRoot = data.workspace_roots?.[0]
    ? normalize(data.workspace_roots[0].replace(/^\/([a-z]:)/i, '$1'))
    : process.cwd();

  // Derive project paths
  const sessionsDir = getProjectSessionsDir(workspaceRoot);
  const projectDir = join(sessionsDir, '..');

  // === BOOTSTRAP (idempotent) ===
  const paths = await ensureWorkspaceSetup(projectDir, sessionsDir);

  // === INIT SESSION (per-conversation) ===
  const session = await initSession(sessionsDir, sessionId);

  // === LOAD CONTENT ===

  // Recent sessions (last 7 days, excluding current)
  const recentSessions = await listSessions(sessionsDir, {
    maxAge: 7,
    exclude: sessionId,
    excludeTemplates: true,
  });

  // Memory (first 200 lines)
  let memoryContent = '';
  try {
    const fullContent = (await Bun.file(paths.memoryFile).text()).replace(
      /\r\n/g,
      '\n',
    );
    const lines = fullContent.split('\n');
    memoryContent =
      lines.length > 200 ? lines.slice(0, 200).join('\n') : fullContent;
  } catch {
    // Memory file unreadable
  }

  // Soul
  let soulContent = '';
  try {
    soulContent = await Bun.file(paths.soulFile).text();
  } catch {
    // SOUL.md not found
  }

  // User
  let userContent = '';
  try {
    userContent = await Bun.file(paths.userFile).text();
  } catch {
    // USER.md not found
  }

  const userIsEmpty =
    !userContent || /^\s*-\s*\*\*Name:\*\*\s*$/m.test(userContent);

  // Package manager
  let packageManagerInfo = 'unknown';
  try {
    const pmPromise = getPackageManager({ projectDir: workspaceRoot });
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('PM timeout')), 2000),
    );

    const pm = await Promise.race([pmPromise, timeoutPromise]);
    if (pm) {
      packageManagerInfo = pm?.name
        ? `${pm.name} (${pm.source || 'detected'})`
        : 'unknown';
    }
  } catch {
    const projectRoot = workspaceRoot;
    if (
      (await Bun.file(join(projectRoot, 'bun.lockb')).exists()) ||
      (await Bun.file(join(projectRoot, 'bun.lock')).exists())
    )
      packageManagerInfo = 'bun';
    else if (await Bun.file(join(projectRoot, 'pnpm-lock.yaml')).exists())
      packageManagerInfo = 'pnpm';
    else if (await Bun.file(join(projectRoot, 'yarn.lock')).exists())
      packageManagerInfo = 'yarn';
    else if (await Bun.file(join(projectRoot, 'package-lock.json')).exists())
      packageManagerInfo = 'npm';
    else if (await Bun.file(join(projectRoot, 'poetry.lock')).exists())
      packageManagerInfo = 'poetry';
    else if (await Bun.file(join(projectRoot, 'Pipfile.lock')).exists())
      packageManagerInfo = 'pipenv';
    else if (await Bun.file(join(projectRoot, 'requirements.txt')).exists())
      packageManagerInfo = 'pip';
  }

  // === BUILD CONTEXT ===

  const recentSessionLines: string[] = [];
  if (recentSessions.length > 0) {
    recentSessionLines.push(`Last session: ${recentSessions[0].filename}`);
    const others = recentSessions.length - 1;
    if (others > 0) {
      recentSessionLines.push(
        `${others} other session${others > 1 ? 's' : ''} from the last 7 days`,
      );
    }
  }

  const contextMsg = `[Hook, Session Start]

---
# Environment

Package manager: ${packageManagerInfo}

---
# User - ${paths.userFile}

<USER>
${userContent || '(no USER.md found)'}
</USER>
${userIsEmpty ? '\nUSER.md is empty. Ask the user to introduce themselves (name, what to call them, timezone) and fill it in.\n' : ''}
Guidelines:
  - Learn context organically through work, don't repeatedly ask for personal info
  - Update USER.md naturally over time as you learn preferences and working style
  - Respect privacy -- context, not a dossier

---
# Soul - ${paths.soulFile}

<SOUL>
${soulContent || '(no SOUL.md found)'}
</SOUL>

Guidelines:
  - Internalize identity, boundaries, and vibe each session
  - To update SOUL.md: propose changes to the user first, never silently change
  - Keep SOUL.md under 100 lines
  - If you change SOUL.md, tell the user

---
# Session File- ${session.sessionFile}
${recentSessionLines.length > 0 ? `\n${recentSessionLines.join('\n')}\n` : ''}
Guidelines:
  - Update at meaningful milestones (decisions, blockers, context shifts), not every small step
  - Keep sections concise: Current State, Completed, In Progress, Blockers, Notes for Next Session, Context to Load, Session Log
  - Set session title once the task is clear
  - Update "Last Updated" on each write
  - Add one timestamped log line per milestone: **HH:MM** - [outcome in one line]
  - Hook reminders are prompts to evaluate progress, not mandatory writes
  - If no meaningful change happened, skip writing

---
# Auto Memory - ${paths.memoryFile}

You have a persistent auto memory. Its contents persist across conversations.
As you work, consult your memory files to build on previous experience.

## How to save memories:
  - Organize memory semantically by topic, not chronologically
  - Use the Write and Edit tools to update your memory files
  - MEMORY.md is always loaded into your conversation context - lines after
    200 will be truncated, so keep it concise
  - Create separate topic files (for example, debugging.md, patterns.md) for
    detailed notes and link to them from MEMORY.md
  - Update or remove memories that turn out to be wrong or outdated
  - Do not write duplicate memories. First check if there is an existing memory
    you can update before writing a new one.
  
## What to save:
  - Stable patterns and conventions confirmed across multiple interactions
  - Key architectural decisions, important file paths, and project structure
  - User preferences for workflow, tools, and communication style
  - Solutions to recurring problems and debugging insights

## What NOT to save:
  - Session-specific context (current task details, in-progress work, temporary state)
  - Information that might be incomplete — verify against project docs before writing
  - Anything that duplicates or contradicts higher-priority instructions
  - Speculative or unverified conclusions from reading a single file

## Explicit user requests:
  - When the user asks you to remember something across sessions (for example, "always use bun", "never auto-commit"), save it — no need to wait for multiple
  interactions
  - When the user asks to forget or stop remembering something, remove the relevant entries

<MEMORY>
${memoryContent || '(empty -- new project memory)'}
</MEMORY>`;

  const output: SessionStartOutput = {
    additional_context: contextMsg,
  };

  console.log(JSON.stringify(output));
  process.exit(0);
}

main().catch((err) => {
  console.error(
    '[SessionStart] Error:',
    err instanceof Error ? err.message : String(err),
  );
  console.log(JSON.stringify({ additional_context: '' }));
  process.exit(0);
});
