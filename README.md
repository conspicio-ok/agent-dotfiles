# agent-dotfiles

Cognitive configuration framework for Agent IA — Absolute Mode and self-improving context system. Fork and adapt.

## What this is

A configuration system that shapes how agent operates: a strict cognitive mode (no filler, no emotional engagement, maximum informational density), and a convention for context files that Claude maintains automatically.

Designed to be forked. Each user brings their own rules, projects, and preferences via a private `context` repo.

## What this is not

This repo contains no personal configuration, coding rules, project lists, machine-specific settings, or session memory. Those live in a separate private `context` repo — entirely optional.

## Why it exist

Today, using AI is practically a must if you want to keep up with the pace in a world where everything is moving faster and faster.
But there’s a difference in how it’s used: `fill empty columns with XXX` isn’t the same as `if the columns are empty during the query, assign the values XXX`. The functionality remains the same, but the user’s understanding is entirely different.
That’s why I created these dotfiles. They are optimized for token economy and learning; the goal of this project is to create a second brain serving as a database with an intelligent interface that updates automatically via an LLM.
I’m currently using them with Claude because I find it handles a large number of Markdown files in context best,.
This system is designed to consume less resources as it is used.

## Architecture

The entire system works with three folders :
- dotfiles/ - direction imposed by the project
- context/  - direction imposed by the user
- memory/   - knowledge database

```
~/dotfiles/             ← this repo (public)
├── CLAUDE.md           ← Absolute Mode + context file reading rules
├── claude/             ← Claude Code settings and subagents
│   ├── settings.json   ← model, effort, advisor, plugins
│   └── agents/         ← subagents (explorer: read-only, Haiku)
└── skills/             ← generic Claude Code skills
    ├── lang-skill-builder/  ← creates a lang-<language> skill
    ├── lang-skill-updater/  ← updates lang-* skills, propagates common rule changes
    ├── memory-write/        ← writing rules for ~/memory/
    └── setup/               ← /setup: builds default files and symlinks, safe to re-run
        └── templates/       ← default CLAUDE.local.md, PROJECTS.md, TEMPLATE.md, …

~/context/              ← private repo (optional, for multi-machine sync)
├── CLAUDE.local.md     ← personal profile and overrides
├── PROJECTS.md         ← active projects with git URLs
├── skills/common.md    ← generic coding rules, merged into each lang-* skill
├── skills/lang-<language>/SKILL.md ← per-language conventions, self-contained
└── settings.local.json ← Claude Code allowed commands

~/memory/               ← private repo (optional, for multi-machine sync)
├── TEMPLATE.md         ← note template, always copy before creating a note
├── backlog.md          ← single task list
├── <hostname>.md       ← machine state, filled from live system
├── README.md           ← memory usage instructions
├── <category>/         ← one folder per domain (cours/, games/, system/, …)
│   └── <note>.md       ← kebab-case filename, frontmatter with date + status
└── …

~/                      ← symlinks pointing to the above
├── CLAUDE.md           → ~/dotfiles/CLAUDE.md
├── CLAUDE.local.md     → ~/context/CLAUDE.local.md
└── PROJECTS.md         → ~/context/PROJECTS.md

~/.claude/skills/       ← one symlink per skill
├── lang-skill-builder  → ~/dotfiles/skills/lang-skill-builder
├── lang-skill-updater  → ~/dotfiles/skills/lang-skill-updater
├── memory-write        → ~/dotfiles/skills/memory-write
├── setup               → ~/dotfiles/skills/setup
└── lang-<language>     → ~/context/skills/lang-<language>

~/.claude/
├── settings.json       → ~/dotfiles/claude/settings.json
├── settings.local.json → ~/context/settings.local.json
└── agents              → ~/dotfiles/claude/agents
```

### Language skills

Per-language conventions are Claude Code skills, one per language. Only each skill's `description` stays in context; its body loads when a file of that language is touched. A single rules file would load every language at once.
Each `lang-<language>` skill is self-contained: the generic rules from `~/context/skills/common.md` that apply to the language are merged in, language rules win on conflict. `lang-skill-builder` creates a skill for a new language, `lang-skill-updater` edits one or propagates a common rule change to all of them.

I suggest you to make a git for context and memory to have backup and/or sync with multiple machines but is **not required**, all folder can be created and used locally.
The symlinks are what Claude Code reads. The repos are what git tracks.

## Setup

```bash
# 1. Clone this repo
git clone git@github.com:conspicio-ok/agent-dotfiles.git ~/dotfiles

# 2. Optional: clone your private repos (backup / multi-machine sync)
git clone git@github.com:<you>/context.git ~/context
git clone git@github.com:<you>/memory.git ~/memory

# 3. Expose the setup skill, then run it from Claude Code
mkdir -p ~/.claude/skills
ln -sfn ~/dotfiles/skills/setup ~/.claude/skills/setup
claude
> /setup
```

`/setup` creates `~/context` and `~/memory` if absent, builds every missing file from `skills/setup/templates/` (`CLAUDE.local.md`, `PROJECTS.md`, `settings.local.json`, memory `TEMPLATE.md`, `README.md`, `backlog.md`), fills `~/memory/<hostname>.md` from the live system, and creates all symlinks shown above (home files, `~/.claude/settings.json`, `agents`, `settings.local.json`, one link per skill in `dotfiles/skills` and `context/skills`).

Re-running is safe and is how updates are applied:
- existing files are never overwritten; missing `CLAUDE.local.md` sections and template diffs are proposed, applied only after approval;
- `<hostname>.md` entries are refreshed against the live system, the old value kept as history;
- new skills get linked, dangling skill links are pruned;
- a regular file or a link to another target where a symlink is expected is reported, never replaced without approval — back up an existing `~/.claude/settings.json` or `~/.claude/agents` first.

Plugins declared in `settings.json` are installed from their marketplaces after a confirmation at first launch. Login is per machine.

## Disabling Claude Code auto-memory

Claude Code has a built-in file-based memory system at `~/.claude/projects/<project>/memory/`. It duplicates information already managed by the context files (`CLAUDE.local.md`, `PROJECTS.md`, etc.) and is not portable across machines.

### Disable

Delete (or never create) `MEMORY.md` inside the auto-memory directory. Claude Code only loads memories from that directory when `MEMORY.md` is present — without it, the system is inert and writes are ignored.

```bash
rm ~/.claude/projects/-home-conspicio/memory/MEMORY.md
```

### Migrate existing auto-memory entries

Before disabling, check `~/.claude/projects/<project>/memory/MEMORY.md` and migrate each entry to the appropriate canonical file:

| Entry type | Destination |
|---|---|
| User profile, hardware | `~/context/CLAUDE.local.md` — *Profil utilisateur* |
| Behavioral feedback, errors | `~/context/CLAUDE.local.md` — *Erreurs à ne pas reproduire* |
| Coding conventions | `~/context/skills/lang-<language>/SKILL.md` (via `lang-skill-updater`) |
| Active projects | `~/context/PROJECTS.md` |
| Knowledge, decisions, notes | `~/memory/<category>/<note>.md` (copy of `TEMPLATE.md`) |

Entries already present in the destination files can be discarded.
