---
name: lang-skill-updater
description: Modifier un skill lang-<langage> existant ou propager un changement de ~/context/skills/common.md à tous les skills lang-*. À charger quand une convention de code est corrigée, ajoutée ou retirée pour un langage qui a déjà son skill, ou quand une règle commune change.
---

# Mise à jour des skills lang-*

Sources : `~/context/skills/common.md` pour les règles communes, `~/context/skills/lang-*/SKILL.md`
pour les versions fusionnées par langage.

## Convention d'un langage modifiée

1. Modifier la section `## <Langage>` de `~/context/skills/lang-<langage>/SKILL.md`.
2. Si la nouvelle règle contredit une règle de `## Commun`, retirer celle-ci du skill.
3. Si la convention touche une extension non citée, l'ajouter à la `description`.

## Règle commune modifiée

1. Modifier `~/context/skills/common.md`.
2. Pour chaque `~/context/skills/lang-*/SKILL.md` : reporter le changement dans `## Commun`,
   sauf si une règle du langage la remplace ou si elle est inapplicable au langage.
3. Lister les skills non modifiés et la raison, en une ligne chacun.

## Contrôle de cohérence

- Chaque règle de `## Commun` existe dans `~/context/skills/common.md`.
- Chaque skill de `~/context/skills/` a son lien dans `~/.claude/skills/`.
