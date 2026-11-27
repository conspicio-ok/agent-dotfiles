# Memory

Vault de notes markdown. Frontmatter structuré, corps en trois sections, interrogeable par grep.

- Arborescence : `<categorie>/<note>.md`, kebab-case, catégories créées au besoin, date dans le frontmatter.
- Création d'une note : copie de `TEMPLATE.md`, jamais de zéro.
- Hiérarchie des titres : `#` titre unique → `##` Texte libre, Résumé, Conclusion → `###` sections thématiques ou entrées → `####` entrées sous une section. Sans saut ni inversion.
- Entrée : `### <categorie> <sujet> : <valeur> | l<N>` suivie de N lignes de contexte.
- Fiche machine : `<hostname>.md`. Tâches : `backlog.md`, format `### todo <scope> : <sujet> | l<N>`, entrées terminées supprimées.
