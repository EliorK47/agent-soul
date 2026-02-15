---
name: memory-management
description: Read on sessions start. Manages persistent memory files across conversations. Use when recording learnings, updating MEMORY.md, creating topic files, or when the session-start hook injects memory context.
---

# Memory Management

Memory persists across conversations via markdown files. The memory directory path is provided by the session-start hook. (e.g., `~/.cursor/projects/<project-id>/memory/MEMORY.md`).

## MEMORY.md

- Always loaded into context - lines after 200 will be truncated, so keep it concise
- Create separate topic files (e.g., `debugging.md`, `patterns.md`) for detailed notes and link to them from MEMORY.md
- Record insights about problem constraints, strategies that worked or failed, and lessons learned
- Update or remove memories that turn out to be wrong or outdated
- Organize memory semantically by topic, not chronologically
- Use the Write and Edit tools to update your memory files

```markdown
## Key Learnings
- Bun.file().exists() only works for files, not directories
- See [hooks-patterns.md](hooks-patterns.md) for detailed hook architecture
```

## How to Update

1. Read current MEMORY.md first
2. Add or modify entries in place (semantic organization, not chronological)
3. Remove entries that are wrong or outdated
4. For detailed notes, create/update a topic file and link it
5. Store durable cross-session learnings in memory; keep session-specific progress/logs in the session file

## Template

```markdown
## [Topic]
- [Concise insight or learning]
- See [topic-file.md](topic-file.md) for details
```
