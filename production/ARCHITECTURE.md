# Wishly — décisions d'architecture

## Cible de première version
- **Pages + Pages Functions** : interface statique et API sur une même origine pour rendre les cookies de session prévisibles.
- **Cloudflare D1 / SQLite** : choix SQL car les comptes, listes, cadeaux, sessions et réservations ont des relations fortes. Les clés étrangères, contraintes CHECK, index uniques et requêtes préparées aident à préserver l'intégrité et l'isolation entre comptes.
- **Cloudflare Workers runtime** : API TypeScript, Web Crypto pour les mots de passe et jetons, pas de serveur persistant à administrer.
- **Pas de Redis, queue, microservices ou Kubernetes dans le MVP** : ces composants ajoutent coût et complexité sans besoin mesuré. Ajouter un cache ou une file seulement après mesure et définition d'un besoin.
- **Pas d'extraction côté serveur de pages marchandes pour l'instant** : ne pas introduire de risque SSRF ou contourner les protections des marchands. Les URL sont validées comme HTTP(S); les métadonnées marchandes nécessiteront une stratégie respectant les conditions d'utilisation et les règles d'accès.

## Modèle de données
- `users` : identité, mot de passe dérivé avec PBKDF2-SHA-256 et sel aléatoire, rôle, dates.
- `sessions` : jeton opaque uniquement sous forme hachée, date d'expiration et dernière activité.
- `wishlists` : propriétaire, visibilité, occasion, date d'événement, devise, archivage et jeton de partage révocable.
- `wishlist_items` : cadeau, URL, description, catégorie, prix en unité mineure, devise, quantité, priorité et statut.
- `reservations` : réservation invitée, nom affiché, état et hachage du code d'annulation.
- `audit_events` : événements de sécurité et opérations importantes sans mots de passe, cookies ou contenu complet des listes.
- `rate_limits` : compteur par fenêtre, avec une clé hachée issue du secret serveur, de la catégorie et de l'IP.

## Contrôles et invariants
1. Chaque route privée vérifie une session serveur et filtre par identifiant de propriétaire.
2. Les paramètres SQL provenant des utilisateurs sont passés via `bind()`; aucun contenu utilisateur n'est concaténé dans les valeurs SQL.
3. Les listes partagées utilisent un jeton secret aléatoire; révoquer ou rendre privée une liste invalide le jeton.
4. Les réservations ne renvoient jamais le nom de l'invité au propriétaire via la route de liste partagée; la quantité est contrôlée côté base lors de l'insertion.
5. Les codes d'annulation sont affichés une seule fois et leur hachage seulement est conservé.
6. Les mutations exigent une origine exacte égale à `APP_ORIGIN`.
7. Les secrets et identifiants D1 de production restent dans la configuration Cloudflare, jamais dans le dépôt.

## Environnements
- Local : D1 locale et secret de développement non réutilisé ailleurs.
- Staging : base D1 indépendante, cookies et parcours vérifiés en navigateur.
- Production : nouvelle base D1 et secrets propres. Ne jamais réutiliser `wishly-demo-db`.

## Limites connues
- PBKDF2 doit être benchmarké et revu avant lancement; ne pas prétendre qu'Argon2id est utilisé.
- La limitation de débit D1 est une première défense, pas un WAF ni une garantie de résistance sous charge.
- Les tests actuels ne sont pas une certification de sécurité. L'isolation des comptes, les parcours de réservation et les restaurations doivent être testés sur un environnement de staging.
