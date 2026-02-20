/**
 * Session Manager - CRUD operations for session files
 *
 * Centralizes session logic used across hooks:
 * - Filename parsing (handles renamed sessions)
 * - Find session by UUID (regardless of rename)
 * - List/filter sessions
 * - Template detection
 * - Metadata extraction from markdown
 */

import * as fs from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getDateString, getTimeString } from './utils';

// --- Types ---

export interface SessionInfo {
  /** Full path to the session file */
  path: string;
  /** Filename only */
  filename: string;
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Title slug extracted from filename (e.g., "fix-session-start-hook-regression") */
  titleSlug: string;
  /** Full UUID from filename */
  uuid: string;
  /** File modification time (ms since epoch) */
  mtime: number;
  /** File size in bytes */
  size: number;
}

export interface SessionMetadata {
  title: string | null;
  date: string | null;
  started: string | null;
  lastUpdated: string | null;
  sessionId: string | null;
  completed: string[];
  inProgress: string[];
  blockers: string[];
  notes: string;
  context: string;
}

export interface ListSessionsOptions {
  /** Max age in days (default: no limit) */
  maxAge?: number;
  /** Filter by date (YYYY-MM-DD) */
  date?: string;
  /** Exclude sessions containing this UUID */
  exclude?: string;
  /** Exclude sessions that are still untouched templates */
  excludeTemplates?: boolean;
  /** Max results (default: 50) */
  limit?: number;
}

// --- Filename Parsing ---

/**
 * Session filename format:
 *   YYYY-MM-DD-session-<UUID>.tmp          (default, before rename)
 *   YYYY-MM-DD-<title-slug>-<UUID>.tmp     (after rename)
 *
 * The UUID is always the last 36 chars before .tmp (8-4-4-4-12 format).
 */
const SESSION_FILENAME_REGEX =
  /^(\d{4}-\d{2}-\d{2})-(.+)-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.tmp$/;

/**
 * Parse a session filename into structured parts.
 * Handles both default and renamed formats.
 */
export function parseSessionFilename(
  filename: string,
): { date: string; titleSlug: string; uuid: string } | null {
  const match = filename.match(SESSION_FILENAME_REGEX);
  if (!match) return null;

  return {
    date: match[1],
    titleSlug: match[2],
    uuid: match[3],
  };
}

// --- Find / List ---

/**
 * Find a session file by UUID. Works regardless of rename.
 * Returns null if not found.
 */
export async function findSession(
  sessionsDir: string,
  uuid: string,
): Promise<SessionInfo | null> {
  try {
    const files = await fs.readdir(sessionsDir);

    for (const filename of files) {
      if (!filename.endsWith('.tmp')) continue;
      if (!filename.includes(uuid)) continue;

      const parsed = parseSessionFilename(filename);
      if (!parsed || parsed.uuid !== uuid) continue;

      const fullPath = join(sessionsDir, filename);
      const stats = await fs.stat(fullPath);

      return {
        path: fullPath,
        filename,
        date: parsed.date,
        titleSlug: parsed.titleSlug,
        uuid: parsed.uuid,
        mtime: stats.mtimeMs,
        size: stats.size,
      };
    }
  } catch {
    // Directory doesn't exist or unreadable
  }

  return null;
}

/**
 * List session files with optional filtering.
 * Returns sorted by modification time (newest first).
 */
export async function listSessions(
  sessionsDir: string,
  options: ListSessionsOptions = {},
): Promise<SessionInfo[]> {
  const {
    maxAge,
    date,
    exclude,
    excludeTemplates = false,
    limit = 50,
  } = options;
  const results: SessionInfo[] = [];

  try {
    const files = await fs.readdir(sessionsDir);
    const now = Date.now();
    const maxAgeMs = maxAge ? maxAge * 24 * 60 * 60 * 1000 : null;

    for (const filename of files) {
      if (!filename.endsWith('.tmp')) continue;

      const parsed = parseSessionFilename(filename);
      if (!parsed) continue;

      // Apply filters
      if (exclude && parsed.uuid === exclude) continue;
      if (date && parsed.date !== date) continue;

      const fullPath = join(sessionsDir, filename);
      const stats = await fs.stat(fullPath);

      if (maxAgeMs && now - stats.mtimeMs > maxAgeMs) continue;

      if (excludeTemplates) {
        try {
          const content = await Bun.file(fullPath).text();
          if (isTemplate(content)) continue;
        } catch {
          continue;
        }
      }

      results.push({
        path: fullPath,
        filename,
        date: parsed.date,
        titleSlug: parsed.titleSlug,
        uuid: parsed.uuid,
        mtime: stats.mtimeMs,
        size: stats.size,
      });
    }
  } catch {
    // Directory doesn't exist or unreadable
  }

  results.sort((a, b) => b.mtime - a.mtime);
  return results.slice(0, limit);
}

// --- Template Detection ---

/**
 * Check if session content is still an unmodified template.
 * Returns true if the session was never actively used.
 */
export function isTemplate(content: string): boolean {
  // Has multiple timestamps in the log = used
  const logMatches = content.match(/\*\*\d{2}:\d{2}\*\*/g);
  if (logMatches && logMatches.length > 1) return false;

  // Has checked items = used
  if (content.includes('- [x]')) return false;

  // Last Updated differs from Started = used
  const startedMatch = content.match(/\*\*Started:\*\* (\d{2}:\d{2})/);
  const updatedMatch = content.match(/\*\*Last Updated:\*\* (\d{2}:\d{2})/);
  if (startedMatch && updatedMatch && startedMatch[1] !== updatedMatch[1])
    return false;

  // Placeholder text still present = template
  if (content.includes('[One line: what you are working on right now]'))
    return true;

  // Default: if placeholder was modified, it's been used
  return false;
}

// --- Metadata Parsing ---

/**
 * Parse structured metadata from session markdown content.
 */
export function parseSessionMetadata(content: string): SessionMetadata {
  const metadata: SessionMetadata = {
    title: null,
    date: null,
    started: null,
    lastUpdated: null,
    sessionId: null,
    completed: [],
    inProgress: [],
    blockers: [],
    notes: '',
    context: '',
  };

  if (!content) return metadata;

  // Title
  const titleMatch = content.match(/^#\s+Session:\s*(.+)$/m);
  if (titleMatch) metadata.title = titleMatch[1].trim();

  // Date
  const dateMatch = content.match(/\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) metadata.date = dateMatch[1];

  // Started
  const startedMatch = content.match(/\*\*Started:\*\*\s*([\d:]+)/);
  if (startedMatch) metadata.started = startedMatch[1];

  // Last Updated
  const updatedMatch = content.match(/\*\*Last Updated:\*\*\s*([\d:]+)/);
  if (updatedMatch) metadata.lastUpdated = updatedMatch[1];

  // Session ID
  const idMatch = content.match(/\*\*Session ID:\*\*\s*([a-f0-9-]+)/);
  if (idMatch) metadata.sessionId = idMatch[1];

  // Completed items (supports both - [x] and - bullet styles)
  const completedSection = content.match(
    /###?\s*Completed\s*\n([\s\S]*?)(?=\n###?\s|\n---|\n## )/,
  );
  if (completedSection) {
    const items = completedSection[1].match(/^- (?:\[x\]\s*)?(.+)$/gm);
    if (items) {
      metadata.completed = items
        .map((item) => item.replace(/^- (?:\[x\]\s*)?/, '').trim())
        .filter((item) => item && item !== '[ ]');
    }
  }

  // In Progress items
  const progressSection = content.match(
    /###?\s*In Progress\s*\n([\s\S]*?)(?=\n###?\s|\n---|\n## )/,
  );
  if (progressSection) {
    const items = progressSection[1].match(/^- (?:\[ \]\s*)?(.+)$/gm);
    if (items) {
      metadata.inProgress = items
        .map((item) => item.replace(/^- (?:\[ \]\s*)?/, '').trim())
        .filter((item) => item && !item.startsWith('['));
    }
  }

  // Blockers
  const blockersSection = content.match(
    /###?\s*Blockers\s*\n([\s\S]*?)(?=\n###?\s|\n---|\n## )/,
  );
  if (blockersSection) {
    const items = blockersSection[1].match(/^- (.+)$/gm);
    if (items) {
      metadata.blockers = items
        .map((item) => item.replace(/^- /, '').trim())
        .filter((item) => item && item !== 'None');
    }
  }

  // Notes for Next Session
  const notesSection = content.match(
    /###?\s*Notes for Next Session\s*\n([\s\S]*?)(?=\n###?\s|\n---|\n## )/,
  );
  if (notesSection) metadata.notes = notesSection[1].trim();

  // Context to Load
  const contextSection = content.match(
    /###?\s*Context to Load\s*\n```\n([\s\S]*?)```/,
  );
  if (contextSection) metadata.context = contextSection[1].trim();

  return metadata;
}

// --- Read / Write / Delete ---

/**
 * Read session content. Returns null if not found.
 */
export async function readSession(sessionPath: string): Promise<string | null> {
  try {
    return await Bun.file(sessionPath).text();
  } catch {
    return null;
  }
}

/**
 * Write content to a session file.
 */
export async function writeSession(
  sessionPath: string,
  content: string,
): Promise<boolean> {
  try {
    await Bun.write(sessionPath, content);
    return true;
  } catch {
    return false;
  }
}

/**
 * Append content to a session file.
 */
export async function appendToSession(
  sessionPath: string,
  content: string,
): Promise<boolean> {
  try {
    // Preserve existing behavior: return false if target file does not exist.
    if (!(await Bun.file(sessionPath).exists())) {
      return false;
    }

    await fs.appendFile(sessionPath, content, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a session file. Returns true if deleted.
 */
export async function deleteSession(sessionPath: string): Promise<boolean> {
  try {
    await Bun.file(sessionPath).delete();
    return true;
  } catch {
    return false;
  }
}

// --- Rename ---

/**
 * Slugify a session title for use in filename.
 * "Fix session-start hook regression" -> "fix-session-start-hook-regression"
 */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric (keep spaces and dashes)
    .replace(/\s+/g, '-') // Spaces to dashes
    .replace(/-+/g, '-') // Collapse multiple dashes
    .replace(/^-|-$/g, '') // Trim leading/trailing dashes
    .slice(0, 60); // Cap length
}

const SESSION_TITLE_PLACEHOLDERS = new Set([
  '[Set title once task is clear]',
  '[Add meaningful title here]', // Legacy placeholder
]);

/**
 * Auto-rename session file based on the title in markdown content.
 * Only renames if the title was changed from the placeholder.
 * Returns the new SessionInfo or null if no rename needed.
 */
export async function renameSessionFromTitle(
  session: SessionInfo,
  content: string,
): Promise<SessionInfo | null> {
  const meta = parseSessionMetadata(content);
  const title = meta.title?.trim();

  // Skip if title is still placeholder or empty
  if (!title || SESSION_TITLE_PLACEHOLDERS.has(title)) return null;

  const slug = slugifyTitle(title);

  // Skip if slug is empty or already matches current slug
  if (!slug || slug === session.titleSlug) return null;

  const dir = dirname(session.path);
  const newFilename = `${session.date}-${slug}-${session.uuid}.tmp`;
  const newPath = join(dir, newFilename);

  try {
    await fs.rename(session.path, newPath);
    return {
      ...session,
      path: newPath,
      filename: newFilename,
      titleSlug: slug,
    };
  } catch {
    return null;
  }
}

// --- Session Init ---

export interface InitSessionResult {
  /** Full path to the session file */
  sessionFile: string;
  /** Path to transcript .jsonl file */
  jsonlPath: string;
  /** Whether the session file was newly created */
  isNew: boolean;
}

/**
 * Initialize a session: derive paths and create template if needed.
 * Handles transcript path derivation and session file creation.
 */
export async function initSession(
  sessionsDir: string,
  sessionId: string,
): Promise<InitSessionResult> {
  const projectDir = join(sessionsDir, '..');
  const transcriptsDir = join(projectDir, 'agent-transcripts');
  const jsonlPath = join(transcriptsDir, sessionId, `${sessionId}.jsonl`);

  const date = getDateString();
  const time = getTimeString();
  const sessionFile = join(sessionsDir, buildSessionFilename(date, sessionId));

  let isNew = false;
  if (!(await Bun.file(sessionFile).exists())) {
    const template = createSessionTemplate({
      sessionId,
      date,
      time,
      jsonlPath,
    });
    await writeSession(sessionFile, template);
    isNew = true;
  }

  return { sessionFile, jsonlPath, isNew };
}

// --- Template Creation ---

/**
 * Build the default session filename.
 */
export function buildSessionFilename(date: string, sessionId: string): string {
  return `${date}-session-${sessionId}.tmp`;
}

/**
 * Create session template markdown.
 */
export function createSessionTemplate(options: {
  sessionId: string;
  date: string;
  time: string;
  jsonlPath: string;
}): string {
  const { sessionId, date, time, jsonlPath } = options;

  return `# Session: [Set title once task is clear]
**Date:** ${date}
**Started:** ${time}
**Last Updated:** ${time}
**Session ID:** ${sessionId}
**Transcript:** ${jsonlPath}

---

## Runtime Guidelines
- Update this file at meaningful milestones (decision, blocker, context shift, completed milestone), not every small step.
- Keep updates concise and outcome-focused; remove or update entries that become outdated.

## Current State
[One line: what you are working on right now]

### Completed
[3-5 bullet outcomes, not every step]
-

### In Progress
-

### Blockers
-

### Notes for Next Session
[Key decisions, gotchas, and context the next session needs]
-

### Context to Load
\`\`\`
[files or directories to reference]
\`\`\`

---

## Session Log
[Major milestones only, not every action]

**${time}** - Session started
`;
}
