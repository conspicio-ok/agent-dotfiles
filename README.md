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
├── CONSTRUCT.md        ← how to build each missing file from scratch
├── claude/             ← Claude Code settings and subagents
│   ├── settings.json   ← model, effort, advisor, plugins
│   └── agents/         ← subagents (explorer: read-only, Haiku)
└── skills/             ← generic Claude Code skills
    ├── lang-skill-builder/  ← creates a lang-<language> skill
    ├── lang-skill-updater/  ← updates lang-* skills, propagates common rule changes
    └── memory-write/        ← writing rules for ~/memory/

~/context/              ← private repo (optional, for multi-machine sync)
├── CLAUDE.local.md     ← personal profile and overrides
├── PROJECTS.md         ← active projects with git URLs
├── skills/common.md    ← generic coding rules, merged into each lang-* skill
├── skills/lang-<language>/SKILL.md ← per-language conventions, self-contained
└── settings.local.json ← Claude Code allowed commands

~/memory/               ← private repo (optional, for multi-machine sync)
├── TEMPLATE.md         ← note template, always copy before creating a note
├── README.md           ← memory usage instructions
├── <category>/         ← one folder per domain (cours/, games/, system/, …)
│   └── <note>.md       ← kebab-case filename, frontmatter with date + status
└── …

~/                      ← symlinks pointing to the above
├── CLAUDE.md           → ~/dotfiles/CLAUDE.md
├── CONSTRUCT.md        → ~/dotfiles/CONSTRUCT.md
├── CONF.md             → ~/context/CONF.md
└── PROJECTS.md         → ~/context/PROJECTS.md

~/.claude/skills/       ← one symlink per skill
├── lang-skill-builder  → ~/dotfiles/skills/lang-skill-builder
├── lang-skill-updater  → ~/dotfiles/skills/lang-skill-updater
├── memory-write        → ~/dotfiles/skills/memory-write
└── lang-<language>     → ~/context/skills/lang-<language>

~/.claude/
├── settings.json       → ~/dotfiles/claude/settings.json
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

# 2. Symlink to home
ln -sf ~/dotfiles/CLAUDE.md ~/CLAUDE.md
ln -sf ~/dotfiles/CONSTRUCT.md ~/CONSTRUCT.md

# 3. Symlink generic skills
mkdir -p ~/.claude/skills
for d in ~/dotfiles/skills/*/; do ln -sfn "$d" ~/.claude/skills/; done
```

Claude Code settings and subagents:

```bash
ln -sfn ~/dotfiles/claude/settings.json ~/.claude/settings.json
ln -sfn ~/dotfiles/claude/agents ~/.claude/agents
```

An existing regular `~/.claude/settings.json` or `~/.claude/agents` is replaced: back it up first. Plugins declared in `settings.json` are installed from their marketplaces after a confirmation at first launch. Login is per machine.

If using a private context repo:

```bash
# 4. Clone context
git clone git@github.com:<you>/context.git ~/context

# 5. Symlink context files to home
ln -sf ~/context/CLAUDE.local.md ~/CLAUDE.local.md
ln -sf ~/context/CONF.md ~/CONF.md
ln -sf ~/context/PROJECTS.md ~/PROJECTS.md
for d in ~/context/skills/*/; do ln -sfn "$d" ~/.claude/skills/; done

# 6. Symlink Claude Code settings
ln -sf ~/context/settings.local.json ~/.claude/settings.local.json
```

Without the context repo, create the files manually — see `CONSTRUCT.md`.

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
| Knowledge, decisions, notes | `~/memory/<category>/<note>.md` (see `CONSTRUCT.md`) |

Entries already present in the destination files can be discarded.
