---
name: setup
description: Initialiser ou mettre à jour l'environnement agent - dossiers ~/context et ~/memory, fichiers de contexte par défaut, fiche machine, symlinks vers ~ et ~/.claude. Idempotent. À charger sur /setup, ou dès qu'un fichier de contexte attendu est absent.
---

# /setup

Construit les fichiers par défaut et les symlinks. Relançable à volonté : ce qui existe n'est jamais écrasé, seuls les manques sont comblés et les écarts signalés.

Templates : `~/dotfiles/skills/setup/templates/`. Hostname : `cat /etc/hostname` (le binaire `hostname` peut manquer).

## 1. Dossiers

`mkdir -p ~/context/skills ~/memory ~/.claude/skills`. Un dossier `~/context` ou `~/memory` cloné depuis un repo privé est conservé tel quel.

## 2. Fichiers de contexte

Pour chaque cible : absente → copier le template ; présente → étape « mise à jour ».

| Cible | Source |
|---|---|
| `~/context/CLAUDE.local.md` | `templates/CLAUDE.local.md` |
| `~/context/PROJECTS.md` | `templates/PROJECTS.md` |
| `~/context/settings.local.json` | `templates/settings.local.json` |
| `~/memory/TEMPLATE.md` | `templates/TEMPLATE.md` |
| `~/memory/README.md` | `templates/memory-README.md` |
| `~/memory/backlog.md` | copie de `~/memory/TEMPLATE.md`, `title: backlog`, `created`/`updated` du jour, corps réduit à `## Texte libre` |
| `~/memory/<hostname>.md` | copie de `~/memory/TEMPLATE.md`, remplie depuis l'état live (voir § 3) |

Mise à jour d'un fichier existant :
- La version existante fait foi. Ne jamais la remplacer ni la réordonner.
- `CLAUDE.local.md` : vérifier la présence des sections `Auto-amélioration`, `Langue`, `Profil utilisateur`, `Erreurs à ne pas reproduire`. Section absente → proposer son ajout depuis le template, appliquer après accord.
- `TEMPLATE.md`, `README.md` : écart avec le template → montrer le diff, demander. Sans réponse : ne rien changer.
- `settings.local.json` : JSON invalide ou clé `permissions.allow` absente → signaler, ne pas corriger sans accord.
- `PROJECTS.md`, `backlog.md` : contenu utilisateur, aucune vérification.

## 3. Fiche machine `~/memory/<hostname>.md`

- Format d'entrée : `### system <sujet> : <valeur> | l<N>` suivi de N lignes de contexte, sous `## Texte libre`.
- Sujets : os, kernel, wm, display-manager, session, shell, terminal, cpu, gpu, editor, outils principaux.
- Valeurs lues par commande sur l'état live (`/etc/os-release`, `uname -r`, `$SHELL`, `lspci`, `$XDG_CURRENT_DESKTOP`, binaires présents). Ne pas demander à l'utilisateur ce qu'une commande donne.
- Fiche existante (relance) : comparer chaque entrée `system` à l'état live. Valeur changée → mettre à jour la valeur, ajouter l'ancienne en ligne `historique:`, ajuster `lN`, mettre à jour `updated`. Entrée absente → l'ajouter. Les autres entrées ne sont pas touchées.

## 4. Symlinks

| Lien | Cible |
|---|---|
| `~/CLAUDE.md` | `~/dotfiles/CLAUDE.md` |
| `~/CLAUDE.local.md` | `~/context/CLAUDE.local.md` |
| `~/PROJECTS.md` | `~/context/PROJECTS.md` |
| `~/.claude/settings.json` | `~/dotfiles/claude/settings.json` |
| `~/.claude/agents` | `~/dotfiles/claude/agents` |
| `~/.claude/settings.local.json` | `~/context/settings.local.json` |
| `~/.claude/skills/<nom>` | chaque dossier de `~/dotfiles/skills/` et de `~/context/skills/` |

- Lien absent → `ln -sfn`. Lien correct → rien. Lien vers une autre cible → signaler, demander.
- Fichier ou dossier régulier à l'emplacement d'un lien → ne rien faire, signaler, demander (sauvegarde puis remplacement).
- `~/.claude/skills/` : supprimer les liens cassés dont la cible est sous `~/dotfiles/skills/` ou `~/context/skills/`. Ignorer `.trash` et tout lien vers ailleurs.
- Nom de skill présent dans les deux sources → signaler le conflit, ne lier aucun des deux.

## 5. Rapport

Trois listes, une ligne par élément : créé · mis à jour · ignoré ou en attente de décision (avec la raison). Rien d'autre.

## Évolution

Toute nouvelle donnée de contexte dont la construction n'est pas couverte ici s'ajoute à ce skill ou à ses templates, pas ailleurs.
