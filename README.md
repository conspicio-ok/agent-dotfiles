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
I’m currently using them with Claude because I find it handles a large number of Markdown files in context best, but a version for Hermes Agent is in the works. Hermes can host local models or hosted models (I recommend Infomaniak AI Tools—gemma4:31b), which helps keep your footprint in check.
This system is designed to consume less resources as it is used.

## Architecture

The entire system works with three folders :
- dotfiles/ - direction imposed by the project
- context/  - direction imposed by the user
- memory/   - knowledge database

```
~/dotfiles/             ← this repo (public)
├── CLAUDE.md           ← Absolute Mode + context file reading rules
└── CONSTRUCT.md        ← how to build each missing file from scratch

~/context/              ← private repo (optional, for multi-machine sync)
├── CLAUDE.local.md     ← personal profile and overrides
├── PROJECTS.md         ← active projects with git URLs
├── RULES_GENERIC.md    ← generic coding rules
├── RULES_LANGAGES.md   ← per-language conventions
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
├── PROJECTS.md         → ~/context/PROJECTS.md
├── RULES_GENERIC.md    → ~/context/RULES_GENERIC.md
└── RULES_LANGAGES.md   → ~/context/RULES_LANGAGES.md
```

I suggest you to make a git for context and memory to have backup and/or sync with multiple machines but is **not required**, all folder can be created and used locally.
The symlinks are what Claude Code reads. The repos are what git tracks.

## Setup

```bash
# 1. Clone this repo
git clone git@github.com:conspicio-ok/agent-dotfiles.git ~/dotfiles

# 2. Symlink to home
ln -sf ~/dotfiles/CLAUDE.md ~/CLAUDE.md
ln -sf ~/dotfiles/CONSTRUCT.md ~/CONSTRUCT.md
```

If using a private context repo:

```bash
# 3. Clone context
git clone git@github.com:<you>/context.git ~/context

# 4. Symlink context files to home
ln -sf ~/context/CLAUDE.local.md ~/CLAUDE.local.md
ln -sf ~/context/CONF.md ~/CONF.md
ln -sf ~/context/PROJECTS.md ~/PROJECTS.md
ln -sf ~/context/RULES_GENERIC.md ~/RULES_GENERIC.md
ln -sf ~/context/RULES_LANGAGES.md ~/RULES_LANGAGES.md

# 5. Symlink Claude Code settings
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
| Coding conventions | `~/context/RULES_LANGAGES.md` |
| Active projects | `~/context/PROJECTS.md` |
| Knowledge, decisions, notes | `~/memory/<category>/<note>.md` (see `CONSTRUCT.md`) |

Entries already present in the destination files can be discarded.

## Hermes Agent compatibility

`CLAUDE.md` doubles as a `SOUL.md` for [Hermes Agent](https://github.com/NousResearch/hermes-agent) — the file is injected identically as the system prompt identity in both tools.

Symlink after setting up Hermes:

```bash
ln -sf ~/dotfiles/CLAUDE.md ~/.hermes/SOUL.md
ln -sf ~/dotfiles/CLAUDE.md ~/.hermes/profiles/local/SOUL.md  # if using a local profile
```

The symlinks ensure a single source of truth: editing `CLAUDE.md` updates the behavior of both Claude Code and Hermes simultaneously.

Hermes is not enable for now, you can use and improve it but i can't ensure good functioning.

