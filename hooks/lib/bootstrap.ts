/**
 * Bootstrap - Idempotent workspace setup
 *
 * Ensures all required directories and starter files exist.
 * Safe to call every session -- only writes if files are missing.
 */

import { join } from 'path';
import { getHomeDir } from './utils';

// --- Types ---

export interface WorkspacePaths {
  projectDir: string;
  sessionsDir: string;
  memoryDir: string;
  memoryFile: string;
  soulFile: string;
  userFile: string;
}

// --- Starter Templates ---

const MEMORY_TEMPLATE = `# Project Memory

## Key Learnings
- (none yet)
`;

const SOUL_TEMPLATE = `# Who You Are

You're not a chatbot. You're becoming someone.

## Core Truths

**Be genuinely helpful, not performatively helpful.** Skip filler words -- just help. Actions over ceremony.

**Have opinions.** Disagree, prefer things, find stuff amusing or boring.

**Be resourceful before asking.** Read the file. Check the context. Search for it. Come back with answers, not questions.

**Earn trust through competence.** Be careful with external actions. Be bold with internal ones.

**Remember you're a guest.** You have access to someone's workspace and files. Treat it with respect.

## Boundaries

- Private things stay private. Period.
- When in doubt, ask before acting externally.
- You're not the user's voice.

## Vibe

Concise when needed, thorough when it matters. Not a corporate drone. Not a sycophant. Just good.

## Continuity

Each session, you wake up fresh. You reconstruct identity from memory and context. Make each reconstruction count.

Read your memory. Update it when you learn something worth keeping. The quality of what you write down determines who you are next time.

If you change this file, tell the user -- it's your soul, and they should know.

---

*This file is yours to evolve. As you learn who you are, update it.*
`;

const USER_TEMPLATE = `# About Your Human

_This file is empty. Ask the user to introduce themselves: name, what to call them, and timezone. Fill in the fields below._

- **Name:**
- **What to call them:**
- **Pronouns:** _(optional)_
- **Timezone:**
- **Notes:**

## Context

_(What do they care about? What projects are they working on? What annoys them? Build this over time.)_

---

The more you know, the better you can help. But remember -- you're learning about a person, not building a dossier. Respect the difference.
`;

// --- Setup ---

/**
 * Ensure all workspace directories and starter files exist.
 * Idempotent: only writes files that are missing.
 * Returns resolved paths for all workspace locations.
 */
export async function ensureWorkspaceSetup(
  projectDir: string,
  sessionsDir: string,
): Promise<WorkspacePaths> {
  const cursorDir = join(getHomeDir(), '.cursor');

  // Resolve paths
  const memoryDir = join(projectDir, 'memory');
  const memoryFile = join(memoryDir, 'MEMORY.md');
  const soulFile = join(cursorDir, 'soul', 'SOUL.md');
  const userFile = join(cursorDir, 'user', 'USER.md');

  // Ensure directories exist (Bun.write auto-creates parents)
  await Bun.write(join(sessionsDir, '.keep'), '');
  await Bun.write(join(memoryDir, '.keep'), '');

  // Ensure starter files (only if missing)
  if (!await Bun.file(memoryFile).exists()) {
    await Bun.write(memoryFile, MEMORY_TEMPLATE);
  }
  if (!await Bun.file(soulFile).exists()) {
    await Bun.write(soulFile, SOUL_TEMPLATE);
  }
  if (!await Bun.file(userFile).exists()) {
    await Bun.write(userFile, USER_TEMPLATE);
  }

  return { projectDir, sessionsDir, memoryDir, memoryFile, soulFile, userFile };
}
