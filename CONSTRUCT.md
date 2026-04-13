# CONSTRUCT.md

Rules for Claude Code to follow when a required context file is missing. Do not load this file proactively. Only read it when a file referenced in CLAUDE.md cannot be found.

For each missing file: create it at the expected path, populate it according to the rules below, then resume the task.

---

## CLAUDE.local.md

- Contains personal overrides and additions to CLAUDE.md behavior
- Contains the user's profile: machine identity, hardware, shell, keyboard layout, preferences
- Contains the auto-improvement permission: whether Claude may modify CLAUDE.md itself
- Each section is a heading. No fixed section names — reflect what the user has communicated
- Captures facts about the user as they emerge in conversation, not upfront

---

## CONF.md

- Describes the current system state: active WM, terminal, display manager, shell, hardware
- Read system state to populate it — do not ask the user to fill it manually
- Updated by Claude when system changes are made during a session
- One section per concern (WM, hardware, services, etc.)
- No commands, no install instructions — state only

---

## PROJECTS.md

- Lists projects with: local path, git remote URL, stack, link to project CLAUDE.md if present
- Each entry is a heading under a state section
- Possible sections: Active, In Transition, Paused, Stopped, Completed — create a section only when at least one project belongs to it, never add empty sections
- Updated by Claude when a project is created, changes state, or is archived

---

## RULES_GENERIC.md

- Contains coding rules that apply across all languages
- Rules are prescriptive and unambiguous — no suggestions, no "consider"
- Organized by concern (naming, structure, error handling, etc.)
- Updated by Claude when a correction or new rule emerges from a session

---

## RULES_LANGAGES.md

- Contains per-language conventions
- One section per language
- Overrides RULES_GENERIC.md for the language in question
- Same prescriptive format as RULES_GENERIC.md

---

## settings.local.json

- Claude Code allowed shell commands for the current user
- Format: `{ "permissions": { "allow": [] } }`
- Populated by Claude when the user approves a command during a session
- Not generated from scratch — starts empty and grows organically
