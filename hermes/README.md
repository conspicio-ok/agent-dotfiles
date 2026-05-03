# dotfiles/hermes/

Configuration Hermes Agent — comportement, mode, identité. Public.

## Fichiers

- `SOUL.md` — identité injectée comme prompt système dans Hermes

## Symlinks à créer

```bash
ln -sf ~/dotfiles/hermes/SOUL.md ~/.hermes/SOUL.md
ln -sf ~/dotfiles/hermes/SOUL.md ~/.hermes/profiles/local/SOUL.md
```

## Contexte factuel

Le contexte factuel (système, projets, profil) est dans `~/context/hermes/` — dépôt privé.
