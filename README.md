# agent-dotfiles

Cognitive configuration framework for Agent IA — Absolute Mode and self-improving context system. Fork and adapt.

## What this is

A configuration system that shapes how agent operates: a strict cognitive mode (no filler, no emotional engagement, maximum informational density), and a convention for context files that Claude maintains automatically.

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

### Block auto-memory writes via hook

Add a `PreToolUse` hook to `~/.claude/settings.json` that intercepts any `Write` or `Edit` call targeting the auto-memory directory and exits with code 2 (blocking the tool use):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "file=$(echo \"$CLAUDE_TOOL_INPUT\" | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d.get('file_path',''))\"); if echo \"$file\" | grep -q '\\.claude/projects/.*memory/'; then echo 'Blocked: auto-memory write disabled' >&2; exit 2; fi"
          }
        ]
      }
    ]
  }
}
```

### Migrate existing auto-memory entries

Before applying the hook, check `~/.claude/projects/<project>/memory/MEMORY.md` and migrate each entry to the appropriate canonical file:

| Entry type | Destination |
|---|---|
| User profile, hardware | `~/context/CLAUDE.local.md` — *Profil utilisateur* |
| Behavioral feedback, errors | `~/context/CLAUDE.local.md` — *Erreurs à ne pas reproduire* |
| Coding conventions | `~/context/RULES_LANGAGES.md` |
| Active projects | `~/context/PROJECTS.md` |
| Knowledge, decisions, notes | `~/memory/<category>/<note>.md` (see `CONSTRUCT.md`) |

Entries already present in the destination files can be discarded. Once migrated, the `~/.claude/.../memory/` directory can be deleted or left empty.

## Hermes Agent compatibility

`CLAUDE.md` doubles as a `SOUL.md` for [Hermes Agent](https://github.com/NousResearch/hermes-agent) — the file is injected identically as the system prompt identity in both tools.

Symlink after setting up Hermes:

```bash
ln -sf ~/dotfiles/CLAUDE.md ~/.hermes/SOUL.md
ln -sf ~/dotfiles/CLAUDE.md ~/.hermes/profiles/local/SOUL.md  # if using a local profile
```

The symlinks ensure a single source of truth: editing `CLAUDE.md` updates the behavior of both Claude Code and Hermes simultaneously.
