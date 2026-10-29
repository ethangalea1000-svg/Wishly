# Wishly

Application de listes de cadeaux : création de listes, partage par lien secret, réservations par des invités sans compte et annulation avec un code.

## État du projet

- Branche `main` : maquette de démonstration publique (données fictives, stockage local du navigateur).
- Dossier `production/` : socle de production en cours (frontend Cloudflare Pages, API Worker + base D1), pas encore déployé.
- Revue de sécurité : `production/SECURITY-REVIEW.md`. Tests API : `worker/test/api.test.ts` (vitest, 10 tests, exécutés le 29/10/2026 : tous au vert).

## Points d’attention

- Le nom « Wishly » est aussi utilisé par un service existant (wishly.fr) sans lien avec ce projet — voir `docs/competitive-analysis.md`.
- E-mail, OAuth et paiement : désactivés tant qu’aucun fournisseur n’est configuré.
- Ne pas mettre de données personnelles réelles dans la démo (voir `SECURITY.md`).
