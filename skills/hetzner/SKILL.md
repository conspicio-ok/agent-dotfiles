---
name: hetzner
description: Règles de la storagebox Hetzner montée sur ~/hetzner. À charger avant toute commande, transfert ou rangement sur ~/hetzner.
---

- Droits : ajouter, déplacer, renommer uniquement. Suppression interdite (exception explicite : `.DS_Store`).
- Transferts vers hetzner : `rsync -rt --partial` (jamais `-a` : chgrp interdit par la storagebox → erreur 23) ; `--bwlimit` si un autre flux partage le montage. Reprise après crash garantie par `--partial`.
- `mv` intra-montage = rename serveur, zéro transit : à privilégier. Hash uniquement sur collision de nom, après comparaison des tailles.
- Toute commande sur le montage : préfixer `timeout`. Montage figé → identifier les processus (`fuser -vm`), pas de restart sans accord.
- Ne pas renommer les fichiers déjà présents ; renommer uniquement les imports.
- Rangement : catégoriser grossièrement, pas de tri minutieux (ex. livres à la racine de books).
- Nommage : kebab-case, minuscules, dates ISO (Ctrl+flèche s'arrête sur `-`). Exception admin/school : dossiers d'année au format existant `YYYY_YYYY - Nème année`.
- Accents sur sshfs : normalisation Unicode divergente, un chemin accentué tapé peut échouer ; résoudre via glob ou `find -name`.
- Arbo cible : admin (identity/health/bank/housing/work/school/taxes/insurance), study, photos, media/{movies,series}, books, creative/{3d,sketch,ai,audio}, games, notes, secrets, backups. Music : arbo interne intouchable.
- Study et Obsidian : migration vers ~/memory en cours côté utilisateur. N'y toucher en AUCUN cas (même pas les `.DS_Store`) tant que la migration n'est pas déclarée terminée.
