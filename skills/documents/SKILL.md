---
name: documents
description: Erreurs connues sur l'édition de documents. À charger avant d'éditer un docx, un document issu de Google Docs ou un bloc Logseq.
---

- docx par XML : un texte visible d'un seul tenant peut être fragmenté en plusieurs runs `<w:t>`, `str.replace` échoue alors en silence. Vérifier après coup que le remplacement a eu lieu.
- Document vivant dans Google Docs : avertir que le ré-upload doit être un remplacement complet ; copier-coller partiel ou aller-retour Docs écrase ou retire les modifications locales (signets, liens).
- Logseq : relire un bloc juste avant de le modifier. Un bloc corrigé par l'utilisateur ne se retouche plus, même pour réparer un défaut de mon fait : signaler, ne pas éditer. L'utilisateur édite en parallèle.
