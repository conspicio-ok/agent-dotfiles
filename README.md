# claude-dotfiles

Cognitive configuration framework for Claude Code — Absolute Mode and self-improving context system. Fork and adapt.

## What this is

A configuration system that shapes how Claude Code operates: a strict cognitive mode (no filler, no emotional engagement, maximum informational density), and a convention for context files that Claude maintains automatically.

Designed to be forked. Each user brings their own rules, projects, and preferences via a private `context` repo.

## What this is not

This repo contains no personal configuration, coding rules, project lists, machine-specific settings, or session memory. Those live in a separate private `context` repo — entirely optional.

## Architecture

```
~/dotfiles/             ← this repo (public)
├── CLAUDE.md           ← Absolute Mode + context file reading rules
└── CONSTRUCT.md        ← how to build each missing file from scratch

~/context/              ← private repo (optional, for multi-machine sync)
├── CLAUDE.local.md     ← personal profile and overrides
├── CONF.md             ← current system configuration
├── PROJECTS.md         ← active projects with git URLs
├── RULES_GENERIC.md    ← generic coding rules
├── RULES_LANGAGES.md   ← per-language conventions
└── settings.local.json ← Claude Code allowed commands

~/                      ← symlinks pointing to the above
├── CLAUDE.md           → ~/dotfiles/CLAUDE.md
├── CONSTRUCT.md        → ~/dotfiles/CONSTRUCT.md
├── CONF.md             → ~/context/CONF.md
├── PROJECTS.md         → ~/context/PROJECTS.md
├── RULES_GENERIC.md    → ~/context/RULES_GENERIC.md
└── RULES_LANGAGES.md   → ~/context/RULES_LANGAGES.md
```

The symlinks are what Claude Code reads. The repos are what git tracks.

## Private context repo

The `context` repo is **not required**. It exists solely to synchronize personal state between multiple machines. On a single machine, everything under `~/context/` can be created locally without versioning.

See `CONSTRUCT.md` for how to build each file from scratch.

## Setup

```bash
# 1. Clone this repo
git clone git@github.com:conspicio-ok/claude-dotfiles.git ~/dotfiles

# 2. Symlink to home
ln -sf ~/dotfiles/CLAUDE.md ~/CLAUDE.md
ln -sf ~/dotfiles/CONSTRUCT.md ~/CONSTRUCT.md
```

If using a private context repo:

```bash
# 3. Clone context
git clone git@github.com:<you>/context.git ~/context

# 4. Symlink context files to home
ln -sf ~/context/CONF.md ~/CONF.md
ln -sf ~/context/PROJECTS.md ~/PROJECTS.md
ln -sf ~/context/RULES_GENERIC.md ~/RULES_GENERIC.md
ln -sf ~/context/RULES_LANGAGES.md ~/RULES_LANGAGES.md

# 5. Symlink Claude Code settings
ln -sf ~/context/settings.local.json ~/.claude/settings.local.json
```

Without the context repo, create the files manually — see `CONSTRUCT.md`.
