---
name: memory-write
description: Écrire dans ~/memory/ - créer une note, ajouter ou corriger une entrée, passer une note au statut propre, travailler sur un cours. À charger avant toute écriture dans ~/memory/ et avant toute lecture complète d'un cours.
---

# Écriture dans ~/memory/

Arborescence : `memory/<categorie>/<note>.md`, kebab-case, date dans le frontmatter.

## Créer une note

`cp ~/memory/TEMPLATE.md ~/memory/<categorie>/<note>.md` (créer le dossier si absent), puis remplir le frontmatter. Jamais de note créée de zéro. Si `TEMPLATE.md` est absent, le créer avec le skill `setup` avant toute autre opération.

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

## Conventions du vault

- Vault Obsidian ancré à `~/memory/` : chemins d'images depuis cette racine (`cours/images/schema-cpu.png`), syntaxe `![](chemin/image.png)`.
- Noms de notes et d'images : kebab-case, jamais d'underscores, d'espaces ni de `%20`.
- Excalidraw : `~/memory/cours/excalidraw/<nom-kebab>.md`, embed `![[cours/excalidraw/nom]]`.
- Outils : Obsidian pour les cours et notes à lire visuellement ; Neovim pour les fichiers grep-ables (`orca.md`, `backlog.md`).
- Ne jamais écrire dans `~/memory/feedback/` (non lu en session) : le comportemental va dans `CLAUDE.local.md`.

## Hiérarchie des titres

Ordre strict, niveaux descendants sans saut ni inversion :
- `#` : titre du fichier (identique au `title:` du frontmatter), unique
- `##` : sections de structure `Texte libre`, `Résumé`, `Conclusion`
- `###` : sections thématiques dans `Texte libre`, ou entrées directes
- `####` et au-delà : sous-sections et entrées sous une section thématique

Une entrée sous une section thématique descend d'un niveau. Le niveau de titre n'affecte pas le grep.

## Contenu

- Ne jamais modifier le contenu d'une entrée existante sans demande explicite, même lors d'un renommage.
- Sources : labels abstraits stables (« cours ESGI 1ère année », « piscine 42 », « apprentissage personnel »), jamais de chemin, URL ou remote.
- Entrée avec image : ne jamais transcrire le contenu visible de l'image ; écrire uniquement le complémentaire (pièges, distinctions, implications, règles générales).
- Schémas : image ou `.excalidraw`, jamais d'ASCII. Ne jamais supprimer une image, sauf duplicata ; en dédoublonnage, l'ASCII est la forme à éliminer.
- Lecture complète d'un cours (résumé, réponse globale, dédoublonnage) : lire aussi les images référencées.

## Suivi d'apprentissage

Après chaque session de travail sur un cours, mettre à jour la section `## Conclusion` de `CLAUDE.local.md` : progression (chapitres vus, exercices faits), erreurs récurrentes, points de vigilance, prochaine étape. Niveau réel évalué sur les échanges et les fichiers TP lus, jamais sur le contenu du cours.

## Commit

`~/memory/` suit le mécanisme de commit sémantique de `CLAUDE.md`.
