# Wishly — socle de production

Le site GitHub Pages actuel est une **maquette**. Cette branche contient un socle de travail séparé pour le futur site de production. Le dépôt original `Liste-cadeaux-ethan` et la base `wishly-demo-db` ne doivent pas être modifiés ni réutilisés pour la production.

## Architecture cible
- Frontend : Cloudflare Pages, contenu du dossier `production/`.
- API : Cloudflare Pages Functions via `functions/api/[[path]].ts`, même origine que le frontend.
- Données : nouvelle base Cloudflare D1 dédiée.
- Sessions : cookie HttpOnly/Secure/SameSite; aucun jeton de session dans localStorage.
- E-mail, OAuth, paiement et affiliation : désactivés tant qu'aucun fournisseur n'est configuré.

## Déjà livré dans cette branche
- Interface responsive : création de compte, connexion, gestion des listes et cadeaux, catégorie, prix estimé, priorité, quantité et liens.
- API : inscription, connexion/déconnexion, session, listes, cadeaux, archivage, duplication, modification/suppression, partage révocable.
- Page partagée : liste publique via lien secret, réservations invitées, contrôle de quantité et annulation avec code secret.
- Export JSON des données du compte et suppression confirmée du compte.
- Schéma D1 versionné, journal d'audit et limitation initiale des tentatives.
- En-têtes de sécurité, CSP, CI TypeScript, tests de fumée API, vérification syntaxique JS et tests des migrations SQL.
- Pages de brouillon confidentialité, conditions, mentions légales et page 404.

La CI a réussi pour les vérifications existantes, mais cela ne remplace pas des tests navigateur, une validation sur D1 distant de test ou un audit indépendant.

## Configuration de production — ne pas lancer sans ces prérequis
1. Créer une base D1 neuve nommée `wishly-production-db`.
2. Remplacer `REPLACE_WITH_NEW_PRODUCTION_D1_DATABASE_ID` dans le `wrangler.toml` racine par l'ID de cette nouvelle base.
3. Définir `APP_ORIGIN` dans le `wrangler.toml` racine à l'origine exacte du futur site, en HTTPS.
4. Configurer le secret avec `npx wrangler pages secret put SESSION_PEPPER --project-name wishly-production`. Utiliser une valeur aléatoire longue; ne jamais la committer.
5. Installer les dépendances dans `worker/`, appliquer les migrations en local, puis vérifier la restauration d'une sauvegarde.
6. Créer un environnement de staging et tester les flux de compte, les cookies, le partage et les réservations.
7. Faire relire la sécurité, la confidentialité et les textes juridiques avant toute ouverture publique.

**Ne pas déployer sur GitHub Pages** : il ne fournit pas les Pages Functions nécessaires au backend. Ne jamais pointer cette configuration vers `wishly-demo-db`.

## Développement local
1. Copier `worker/.dev.vars.example` vers `worker/.dev.vars`; ne pas committer le second fichier.
2. Dans `worker/`, copier `.dev.vars.example` vers `.dev.vars`, puis exécuter :
   ```sh
   npm install
   npm run db:migrate:local
   npm run dev
   ```
3. Pour tester la Pages Function et le frontend ensemble sous Windows PowerShell, depuis la racine :
   ```powershell
   Copy-Item worker/.dev.vars.example .dev.vars
   npx wrangler d1 migrations apply wishly-production-db --local --config wrangler.toml
   npx wrangler pages dev production --var APP_ORIGIN:http://localhost:8788
   ```
   Le fichier `.dev.vars` reste local et ignoré par Git. Utilise seulement les migrations `--local` pendant le développement. Vérifie les options de la version de Wrangler installée avant toute commande distante.

Ne lance pas `db:migrate:remote` avant d'avoir revérifié la cible D1 et créé une sauvegarde.

## Limites restantes
- Vérification d'e-mail, récupération du mot de passe, OAuth, MFA administrateur et interface d'administration.
- Gestion avancée des sessions, nettoyage planifié des limites de débit, double confirmation de réservation, notifications et contributions groupées.
- Tests d'intégration complets, tests navigateur/accessibilité/performance, audit de sécurité indépendant et staging.
- Politique de conservation, textes légaux complétés, identité/contact du responsable et validation RGPD.
- Intégrations marchandes, extraction de prix, affiliation et paiements : non activés.

## Configuration autonome du Worker
`worker/wrangler.toml` est un modèle alternatif pour tester l'API seule. Pour le déploiement cible, utiliser la configuration Pages à la racine et conserver le frontend/API sur la même origine. Les valeurs contenant `REPLACE` sont des garde-fous et doivent être remplacées seulement après création des ressources de production.
