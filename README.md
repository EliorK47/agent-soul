# Agent Soul

Persistent memory, session tracking, and identity for Cursor agents.

Your AI assistant forgets everything between conversations. Agent Soul fixes that.

## Why

Every time you start a new Cursor session, your agent wakes up blank. It doesn't know what you built yesterday, what decisions you made, or how you like to work. You end up re-explaining context, re-establishing preferences, and watching it make the same mistakes twice.

Agent Soul gives your agent continuity. It remembers what happened last session, maintains project-specific memory, and carries an identity that shapes how it communicates and works. Each conversation picks up where the last one left off.

## How It Works

Agent Soul runs through Cursor's hooks system. It activates automatically -- no commands to remember, no manual setup after install.

**On session start**, the agent receives injected context:

1. **Identity** -- who the agent is, how it should behave (`SOUL.md`)
2. **User context** -- your preferences, timezone, working style (`USER.md`)
3. **Session history** -- what happened last session, what's in progress
4. **Project memory** -- persistent notes, architecture decisions, key learnings (`MEMORY.md`)
5. **Environment** -- detected package manager and project setup

**During the session**, tool calls are counted. Every 50 calls, the agent is prompted to update its session file and memory -- capturing decisions, progress, and context worth keeping.

**On compaction**, counters reset and the event is logged to the session file, so the agent knows context was summarized.

**On session end**, unused template files are cleaned up and active sessions are auto-renamed based on their title.

## What's Inside

### Hooks

The core of Agent Soul. These run automatically at key points in the conversation lifecycle.

| Hook | Script | What it does |
|------|--------|--------------|
| sessionStart | `session-start.ts` | Bootstrap workspace, create session file, inject context |
| sessionEnd | `session-end.ts` | Clean up templates, auto-rename sessions from title |
| preToolUse | `count-tool.ts` | Count tool calls for milestone tracking |
| preToolUse | `block-md-files.ts` | Prevent agents from creating unsolicited documentation |
| preCompact | `pre-compact.ts` | Flag compaction events for the stop hook |
| stop | `suggest-compact.ts` | Prompt session/memory updates every 50 tool calls |

### Rules

Cursor rules that shape agent behavior across all conversations.

- **action-first** -- think deeply, act decisively, speak briefly
- **no-icons-emojis** -- plain text only in code, logs, and output
- **no-unsolicited-docs** -- never create documentation files unless explicitly asked

### Skills

Reusable workflows the agent can follow when triggered:

- **memory-management** -- how to read, update, and organize persistent memory
- **session-management** -- how to track progress in session files

### Identity Files

Created on first run in `~/.cursor/`:

- **SOUL.md** -- the agent's personality, values, and boundaries. Yours to evolve.
- **USER.md** -- context about you that the agent learns over time. Not a dossier.

## Prerequisites

- [Bun](https://bun.sh) -- all hook scripts run on Bun at runtime

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Windows
powershell -c "irm bun.sh/install.ps1 | iex"
```

## Installation

### Cursor Plugin Marketplace

In Cursor Agent chat:

```
/plugin-add agent-soul
```

That's it. No additional setup needed -- hooks run directly on Bun with zero npm dependencies.

### Manual

```bash
git clone https://github.com/EK47/agent-soul.git
```

## Project Structure

```
.cursor-plugin/            Plugin manifest
hooks/hooks.json           Hook configuration
scripts/session-management/
  hooks/                   Hook entry points (TypeScript + Bun)
  lib/                     Shared code (session manager, utils, bootstrap)
  package.json             Dependencies and scripts
rules/                     Cursor rules (.mdc)
skills/                    Cursor skills
assets/                    Logo
```

## Development

```bash
cd scripts/session-management
bun install      # dev dependencies only (biome, types, tsc)
bun run check    # biome lint + tsc strict typecheck
```

## Philosophy

- **Continuity over repetition** -- the agent should remember, not be reminded
- **Automatic over manual** -- hooks fire on their own, no commands to invoke
- **Concise over verbose** -- memory and sessions capture decisions, not narration
- **Identity over anonymity** -- an agent with opinions and preferences beats a blank slate

## License

MIT
