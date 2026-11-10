---
name: memory-write
description: Écrire dans ~/memory/ - créer une note, ajouter ou corriger une entrée, passer une note au statut propre. À charger avant toute écriture dans ~/memory/.
---

# Écriture dans ~/memory/

Arborescence : `memory/<categorie>/<note>.md`, kebab-case, date dans le frontmatter.

## Créer une note

`cp ~/memory/TEMPLATE.md ~/memory/<categorie>/<note>.md` (créer le dossier si absent), puis remplir le frontmatter. Jamais de note créée de zéro. Si `TEMPLATE.md` est absent, le créer depuis `~/CONSTRUCT.md` avant toute autre opération.

## Passer une note au statut propre

Compléter résumé et conclusion, `statut: propre`, mettre à jour `updated`.

## Format d'une entrée

```
### <categorie> <sujet> : <valeur> | l<N>
<N lignes de contexte>
```

`lN` = nombre de lignes de contexte sous le header.

- Stocker : raisons de choix, contraintes non évidentes, historique de décisions.
- Ne pas stocker ce qui est récupérable par commande système.
- Avant d'écrire une entrée, vérifier qu'elle n'existe pas : agent `explorer`, clé exacte puis recherche large.
- Si une recherche large a été nécessaire pour la trouver, normaliser la clé de l'entrée existante pour qu'elle soit greppable en clé exacte.
- Doublon, valeur contradictoire ou clé non normalisée détecté : proposer un nettoyage.

## Commit

`~/memory/` suit le mécanisme de commit sémantique de `CLAUDE.md`.
