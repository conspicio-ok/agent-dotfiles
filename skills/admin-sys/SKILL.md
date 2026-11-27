---
name: admin-sys
description: Erreurs connues en administration système et réseau. À charger avant tout diagnostic ou commande d'admin (réseau, routeur, Wi-Fi, capture, pacman, journalctl, logs, authentification d'un service).
---

## Réseau

- Ne jamais déduire un masque de sous-réseau d'une adresse IP : le demander ou le lire (box supposée en /24 alors qu'en /22).
- Demander le schéma physique (qui est branché où, quelle machine porte quelle IP) AVANT toute route ou hypothèse de cause (PPS du labo : deux fausses pistes).
- Équipement administré à distance : jamais `service network restart` ni redémarrage global (coupe l'accès, Wi-Fi mal réassocié). Geste le plus étroit (`ifup <interface>`) ou interface avec confirmation et rollback.
- Capture fournie : vérifier qu'elle couvre le test (horodatage, contenu corrélable) avant de conclure ; une capture vide ne prouve rien. Ne pas présenter une connaissance produit comme un fait testé.

## Système

- Nettoyage pacman : nommer le paquet (`pacman -Rns scenefx`), jamais `pacman -Rns $(pacman -Qdtq)` : `-Qdtq` liste aussi makedepends AUR, paquets `-debug` et dépendances optionnelles utilisées (281 paquets / 5,3 Go proposés à tort).
- `journalctl -k -u <unit>` : filtres combinés en ET → zéro ligne sans erreur. Un `journalctl` par source (noyau, unités système, `--user`).
- Logs JSON de plusieurs logueurs : formats différents dans le même flux (`"level": "info"` Python, `"level":"info"` Rust) ; un `grep` calqué sur un seul format en laisse passer.
- Test A/B d'une authentification : choisir un endpoint dont la réponse DIFFÈRE selon l'état ; un chemin qui redirige toujours ne prouve rien.
