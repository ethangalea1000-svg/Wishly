# Wishly — version production (socle initial)

Le site GitHub Pages actuel est une maquette. Ce répertoire et le dossier `worker/` constituent le démarrage séparé de l'application de production. Ne pas utiliser de données personnelles réelles dans la démo.

## Architecture cible à coût minimal
- Frontend : Cloudflare Pages ou autre hébergement statique.
- API : Cloudflare Workers.
- Données : une **nouvelle base D1 dédiée à la production**.
- Authentification : sessions serveur en cookie sécurisé; aucun jeton de session dans localStorage.
- E-mail, OAuth, paiement et affiliation : désactivés tant qu'un fournisseur n'est pas choisi et configuré.

## Contenu livré dans cette branche
- `production/index.html` et `production/app.js` : interface responsive de départ pour l'inscription, la connexion, les listes et l'ajout de cadeaux.
- `production/_headers` : en-têtes de sécurité HTTP de base.
- `functions/api/[[path]].ts` : adaptateur Pages Functions pour exposer l'API sur la même origine.
- `worker/src/index.ts` : API de départ (santé, inscription, connexion, déconnexion, session courante, listes et ajout d'articles).
- `worker/migrations/0001_initial.sql` : schéma de base versionné.
- `worker/wrangler.toml` : modèle de configuration.
- `production/PLAN-200.md` : suivi des exigences et phases.

Ce n'est **pas encore une version de production prête à accueillir le public**. Il manque notamment la suite de tests, le frontend de production, la vérification e-mail, la réinitialisation du mot de passe, les flux invités de réservation, l'administration renforcée, la revue juridique et le déploiement de staging.

## Pré-requis avant déploiement
1. Créer une base D1 neuve nommée `wishly-production-db`; ne jamais remplacer l'identifiant par celui de `wishly-demo-db`.
2. Remplacer `REPLACE_WITH_NEW_PRODUCTION_D1_DATABASE_ID` dans `worker/wrangler.toml` par l'identifiant de cette nouvelle base.
3. Configurer `APP_ORIGIN` avec l'origine exacte du frontend de production. Une origine incorrecte bloque les appels mutateurs.
4. Configurer le secret avec `cd worker && npx wrangler secret put SESSION_PEPPER`; utiliser une valeur aléatoire longue. Ne jamais la committer.
5. Installer les dépendances puis appliquer la migration sur la base **locale d'abord**.
6. Ajouter des tests automatisés, tester la restauration, et faire relire les contrôles d'accès avant d'ouvrir l'inscription publique.
7. Déployer sur un environnement de test avant toute production.

## Développement local
Depuis `worker/` :
```sh
npm install
npx wrangler d1 create wishly-production-db
# Copie l'identifiant renvoyé dans wrangler.toml.
npm run db:migrate:local
npm run dev
```

Pour les migrations distantes, vérifier deux fois la cible avant `npm run db:migrate:remote`. Ne jamais appliquer les migrations à la base de démonstration.

## Limites connues du premier socle
- Les sessions ont une durée fixe de 14 jours; une interface de gestion/révocation des sessions est à ajouter.
- La limitation de débit est une première défense et doit être testée sous concurrence; un service de protection de bord peut compléter.
- Le mot de passe est dérivé avec PBKDF2 via Web Crypto. Revoir les paramètres et la stratégie de hachage lors de la revue sécurité.
- L'inscription répond par un message générique en cas de compte déjà existant, mais la réponse HTTP reste différenciée; harmoniser si la politique anti-énumération l'exige.
- Les contrôles d'origine ne remplacent pas un modèle CSRF complet pour tous les futurs flux.
- Le rôle admin n'est pas attribuable via l'API publique. Ne jamais créer une route d'auto-promotion.
- Les endpoints de réservation, suppression de compte, vérification d'e-mail, reset de mot de passe et interface admin ne sont pas implémentés.
