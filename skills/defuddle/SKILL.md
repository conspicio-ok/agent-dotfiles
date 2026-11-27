---
name: defuddle
description: Extraire le Markdown propre d'une page web (sans navigation ni publicité) avec la CLI Defuddle. À charger pour lire ou sauvegarder le contenu d'une URL.
---

Disponibilité : `defuddle --help`. Absente : signaler la dépendance (`npm install -g defuddle`), ne jamais annoncer une extraction réussie.

- Markdown : `defuddle parse <url> --md`
- Vers un fichier : `defuddle parse <url> --md -o content.md`
- Métadonnée : `defuddle parse <url> -p title|description|domain`
- JSON (HTML et Markdown) : `--json`
