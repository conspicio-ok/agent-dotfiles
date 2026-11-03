---
name: lang-skill-builder
description: Créer un skill de conventions de langage lang-<langage> pour un langage qui n'en a pas encore. À charger dès qu'une convention de code émerge pour un langage sans skill dans ~/.claude/skills/.
---

# Création d'un skill lang-<langage>

Un skill `lang-<langage>` est autonome : il fusionne les règles communes de `~/context/skills/common.md`
et les conventions propres au langage, pour qu'un seul skill chargé suffise.

## Procédure

1. Vérifier qu'au moins une convention propre au langage a été observée ou demandée. Sinon, ne rien créer.
2. Créer `~/context/skills/lang-<langage>/SKILL.md`.
3. Frontmatter : `name` identique au nom du dossier ; `description` qui nomme les extensions
   de fichier concernées (c'est elle qui déclenche le chargement).
4. Corps, dans cet ordre :
   - `# <Langage>`
   - `Le style du code existant d'un projet prime sur ces règles.`
   - `## Commun` : les règles de `~/context/skills/common.md` applicables au langage
   - `## <Langage>` : les conventions propres au langage
5. Fusion : en cas de conflit, la règle du langage remplace la règle commune. Une règle commune
   inapplicable est omise (ex. alignement par tabs dans un langage où les tabs sont interdits).
6. Lien : `ln -sfn ~/context/skills/lang-<langage> ~/.claude/skills/`.
