# CONSTRUCT.md

Rules for Claude Code to follow when a required context file is missing. Do not load this file proactively. Only read it when a file referenced in CLAUDE.md cannot be found.

For each missing file: create it at the expected path, populate it according to the rules below, then resume the task.

---

## CLAUDE.local.md

- Contains personal overrides and additions to CLAUDE.md behavior
- Contains the user's profile: machine identity, hardware, shell, keyboard layout, preferences
- Contains the auto-improvement permission: whether Claude may modify CLAUDE.md itself
- Contains a **Langue** section: conversation language and naming language for files/directories/identifiers
- Contains an **Erreurs à ne pas reproduire** section: behavioral corrections to never repeat
- Each section is a heading. No fixed section names — reflect what the user has communicated
- Captures facts about the user as they emerge in conversation, not upfront

---

## memory/system/\<hostname\>.md

- One file per machine, named by hostname (e.g. `orca.md`, `orca-laptop.md`)
- Lives in `~/memory/system/` — part of the `memory` git repo
- Uses the grep-able format: `### categorie sujet : valeur | lN` followed by N context lines
- Read via `grep -A<N> "terme" ~/memory/system/<hostname>.md`
- Populated by reading live system state — do not ask the user to fill it manually
- Updated by Claude when system changes are made during a session
- Covers: OS, WM, display manager, session, shell, terminal, GPU, editor, tools

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

## Memory (`~/memory/`)

Vault de notes markdown. Catégories créées au besoin, sans taxonomie imposée.

```
memory/
├── <categorie>/
│   └── <note>.md
├── TEMPLATE.md
└── README.md
```

Nomenclature : kebab-case pour dossiers et fichiers. Pas de préfixe date — date dans frontmatter.

Template (`TEMPLATE.md`) :

```yaml
---
title: 
domaines: []
tags: []
statut: brouillon   # brouillon | propre
created:            # YYYY-MM-DD
updated:            # YYYY-MM-DD
changelog:
  - date: 
    note: 
sources: []
liens:
  fichiers: []      # références internes — nom sans extension
  titres: []        # références conceptuelles sans fichier associé
---

## Texte libre

## Résumé

## Conclusion
```

---

## settings.local.json

- Claude Code allowed shell commands for the current user
- Format: `{ "permissions": { "allow": [] } }`
- Populated by Claude when the user approves a command during a session
- Not generated from scratch — starts empty and grows organically
