# Contrat API Wishly — version de travail

Base : même origine que le frontend, préfixe `/api`. Les requêtes JSON doivent envoyer `Content-Type: application/json`. Les mutations doivent envoyer `Origin` égal à `APP_ORIGIN`. Les sessions utilisent le cookie sécurisé `__Host-wishly_session`.

## Authentification
| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/api/health` | Public | Santé de l'API et accès D1 |
| POST | `/api/auth/register` | Public, limité | Crée un compte et une session |
| POST | `/api/auth/login` | Public, limité | Ouvre une session |
| POST | `/api/auth/logout` | Origine exacte | Révoque la session courante et efface le cookie |
| GET | `/api/auth/me` | Session | Retourne le profil de session |
| GET | `/api/account/export` | Session | Export JSON des données du compte, listes et cadeaux |
| DELETE | `/api/account` | Session + mot de passe + confirmation e-mail | Supprime le compte et les données associées |

## Listes
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/lists` | Jusqu'à 100 listes du propriétaire |
| POST | `/api/lists` | Crée une liste |
| GET | `/api/lists/:listId` | Lit une liste privée et jusqu'à 200 cadeaux |
| PATCH | `/api/lists/:listId` | Modifie titre, description, visibilité, occasion, date et devise |
| DELETE | `/api/lists/:listId` | Supprime une liste appartenant à la session |
| POST | `/api/lists/:listId/archive` | Bascule l'archivage/restauration |
| POST | `/api/lists/:listId/duplicate` | Duplique la liste et les cadeaux |
| POST | `/api/lists/:listId/share` | Crée/réutilise un lien secret de partage |
| POST | `/api/lists/:listId/share` avec `{"revoke":true}` | Révoque le lien et rend la liste privée |

## Cadeaux
| Méthode | Route | Description |
|---|---|---|
| POST | `/api/lists/:listId/items` | Ajoute un cadeau |
| PATCH | `/api/lists/:listId/items/:itemId` | Modifie les champs validés du cadeau |
| DELETE | `/api/lists/:listId/items/:itemId` | Supprime le cadeau |

Les URL doivent être HTTP(S), sans identifiants intégrés; elles sont normalisées. Une contrainte SQL empêche d'enregistrer deux fois le même lien dans une liste. Prix en unité monétaire mineure (centimes pour EUR/USD/GBP, etc.) et devise ISO à trois lettres.

## Partage et réservations invitées
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/shared/:shareToken` | Retourne uniquement la liste partagée et la disponibilité des cadeaux |
| POST | `/api/shared/:shareToken/items/:itemId/reservations` | Réserve une quantité disponible; retourne la référence et le code secret d'annulation |
| POST | `/api/reservations/:reservationId/cancel` | Annule avec le code secret correspondant |

Le propriétaire ne reçoit pas les noms des invités par la route de partage. Le code d'annulation doit être conservé par l'invité; seul son hachage est stocké.

## Réponses et erreurs
Les réponses JSON réussies ont un statut 2xx. Les erreurs ont la forme `{"error":"message"}` et utilisent notamment :
- `400` : corps, champ ou format invalide.
- `401` : session absente/expirée.
- `403` : origine ou confirmation refusée.
- `404` : ressource introuvable ou non détenue.
- `409` : conflit, notamment quantité déjà réservée ou URL dupliquée.
- `429` : limite de tentatives atteinte.
- `503` : configuration ou dépendance indisponible.
- `500` : erreur serveur inattendue.

## Non disponibles dans ce contrat
Vérification d'e-mail, reset de mot de passe, OAuth, MFA admin, réservations à double confirmation, notifications, paiements, scraping marchand, API d'administration et gestion avancée des sessions. Ne pas supposer qu'ils existent.
