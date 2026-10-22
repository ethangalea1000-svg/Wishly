# Wishly — veille concurrentielle et plan de différenciation

**Dernière vérification : 22 octobre 2026**  
**Périmètre :** liste de cadeaux multi-boutiques, partage avec les proches, réservation et confidentialité.  
**Méthode :** pages publiques des services. Les fonctions annoncées par un service ne sont pas considérées comme validées par un test indépendant.

## Synthèse

Wishly entre sur un marché où les fonctions de base sont déjà répandues : listes partageables, liens de produits, réservations et prévention des doublons. Il faut donc éviter de se différencier uniquement avec « une liste gratuite » ou « un lien de partage ».

Le positionnement le plus crédible pour le produit actuel est : **des listes simples à gérer, des réservations discrètes et une expérience invité fiable, sans compte obligatoire pour réserver** — à condition de tester ces parcours de bout en bout.

## Concurrents directs et adjacents

| Service | Forces annoncées/publiquement visibles | Implication pour Wishly |
|---|---|---|
| [Mes Envies](https://www.mesenvies.fr/liste-cadeaux.html) | Listes multi-boutiques, extension navigateur, réservations invitées sans compte, contributions/dons, personnalisation, messages vidéo et gestion des réservations. Le site annonce plus de 1,5 million de créateurs de listes. | Concurrent français établi. Ne pas tenter de le battre seulement sur la gratuité ou l'ajout multi-boutiques. Miser sur la clarté mobile, la simplicité et la confidentialité par défaut. |
| [Listy](https://listy.fr/) | Présent dans un comparatif français récent : extensions de navigateur, applications et mode surprise en option selon la source. | Vérifier les fonctions actuelles avant toute comparaison détaillée. L'expérience multi-appareil est un axe à surveiller. |
| [Milirose](https://www.milirose.com/) | Le comparatif français décrit plusieurs modes de surprise et des listes familiales. | Les réglages de confidentialité et les listes de famille peuvent devenir des attentes de marché. |
| [Kadolog](https://www.kadolog.com/) | Listes de naissance, contributions et ajout simplifié de cadeaux ; le comparatif mentionne des frais ou limites selon le mode de paiement. | Les contributions financières sont une fonctionnalité complexe : ne pas l'ajouter sans besoin utilisateur démontré et analyse des contraintes. |
| [MagicListe](https://www.magicliste.fr/) | Le comparatif met en avant une création simplifiée et l'ajout de cadeaux. | La réduction du nombre d'étapes est un critère concurrentiel important. |
| [Giftster](https://www.giftster.com/) | Listes partagées orientées familles et groupes, avec réservations pour éviter les doublons. | Les listes familiales peuvent être une évolution ultérieure, après fiabilisation des listes individuelles. |
| [MyRegistry](https://www.myregistry.com/) | Registre universel regroupant des produits provenant de différentes boutiques. | La compatibilité multi-boutiques est une attente existante, pas une différenciation suffisante à elle seule. |
| [Elfster](https://www.elfster.com/) | Fort accent sur les échanges de cadeaux en groupe, notamment Secret Santa. | Les échanges organisés en groupe peuvent rester hors du périmètre initial de Wishly. |
| [Amazon Lists](https://www.amazon.com/hz/wishlist/ls) | Parcours familier et pratique dans l'écosystème Amazon. | Wishly doit démontrer l'intérêt de regrouper des envies de plusieurs enseignes. |

### Attention au nom « Wishly »

Une recherche web fait aussi ressortir un service public utilisant le nom **Wishly** sur [wishly.fr](https://www.wishly.fr/), qui annonce des listes d'envies, le partage et la réservation. L'App Store fait également ressortir une application nommée « Wishlist & Cadeaux - Wishly ». Cela crée un risque de confusion de marque et de référencement.

Cette observation n'établit pas à elle seule un conflit juridique. Avant d'investir dans la marque, le domaine ou la promotion, vérifier les noms de domaine, les comptes sociaux, les applications et les éventuelles marques enregistrées auprès des sources officielles compétentes. Ne pas copier les textes, les visuels ni l'identité d'un concurrent.

## État des fonctions dans le dépôt Wishly

État déduit du code source, **pas d'un test complet en production** :

- Les listes comprennent titre, description, occasion, date, devise et actions de duplication/archivage.
- Les cadeaux prennent en charge un lien, une description, une catégorie, un prix, une quantité et une priorité.
- Le backend calcule la quantité restante en tenant compte des réservations actives.
- Les invités peuvent réserver sans compte et reçoivent un code d'annulation.
- La réponse de la liste partagée ne renvoie pas les noms des invités ; le texte de la page promet que le propriétaire ne les voit pas.
- Le partage peut être révoqué.
- L'inscription et les parcours de partage/réservation doivent encore être validés sur un navigateur réel avant de présenter ces fonctions comme fiables.

## Différenciation recommandée

### 1. Fiabilité avant quantité de fonctions — priorité P0

- Tester inscription, connexion, création de liste, ajout de cadeau, partage, réservation et annulation.
- Vérifier les erreurs réseau, les doubles clics, les liens révoqués et les réservations concurrentes.
- Ne pas modifier la base de production sans sauvegarde et nécessité claire.

**Critère de sortie :** tous les parcours essentiels réussissent lors de tests répétés, avec erreurs compréhensibles en cas d'échec.

### 2. Confidentialité compréhensible par défaut — priorité P1

- Expliquer clairement ce que voit le propriétaire et ce que voient les invités.
- Ne jamais exposer les noms des réservataires dans la vue publique.
- Permettre à un invité de retrouver facilement son code d'annulation au moment de la réservation.
- Tester que le partage révoqué ne donne plus accès à la liste.

**Différenciation :** « les proches peuvent réserver sans dévoiler leur surprise au propriétaire ».

### 3. Une expérience invité excellente sur mobile — priorité P1

- Montrer l'image, le titre, le prix, la catégorie et la quantité restante quand ces informations sont disponibles.
- Actualiser facilement la liste après une réservation.
- Fournir des états de chargement et des messages d'erreur utiles.
- Vérifier les contrastes, les libellés accessibles et la navigation au clavier.

**Critère de sortie :** un invité peut ouvrir le lien, comprendre les cadeaux, réserver et conserver son code sans aide.

### 4. Ajout et organisation rapides — priorité P2

- Éviter les cadeaux en double par URL.
- Recherche, tri et affichage cohérents des prix et priorités.
- Ajouter des variantes (taille, couleur, modèle) seulement après validation du besoin.
- Étudier une extension de navigateur après validation du flux de base.

### 5. Personnalisation utile — priorité P2

- Quelques thèmes cohérents avec l'occasion et une bonne lisibilité.
- Page de partage claire, légère et mobile-first.
- Ne pas multiplier les thèmes au détriment des performances ou de l'accessibilité.

### 6. Fonctions à différer

Ne pas prioriser tout de suite les contributions financières, les alertes de prix, le réseau social, l'IA de recommandation ou les applications natives. Ces chantiers augmentent la complexité et ne règlent pas un parcours de réservation peu fiable.

## Mesures à suivre

1. Taux de réussite de création de compte.
2. Taux de réussite de création de liste et ajout de cadeau.
3. Taux de réussite de réservation invitée.
4. Nombre d'échecs de réservation et de doubles soumissions.
5. Temps nécessaire à un invité pour réserver sur mobile.
6. Nombre de retours utilisateurs signalant une confusion sur la confidentialité.

Ne collecter que les données nécessaires et éviter les identifiants personnels dans les journaux de test.

## Sources consultées

- Mes Envies, liste de cadeaux : https://www.mesenvies.fr/liste-cadeaux.html
- Mes Envies, présentation : https://www.mesenvies.fr/
- Comparatif français publié en octobre 2026 (source éditoriale, à recouper) : https://listopia.fr/comparatif-listes-cadeaux
- Wishly.fr : https://www.wishly.fr/
- App Store, résultat portant le nom « Wishlist & Cadeaux - Wishly » : https://apps.apple.com/fr/app/wishlist-cadeaux-wishly/id6474563124
- Giftster : https://www.giftster.com/
- MyRegistry : https://www.myregistry.com/
- Elfster : https://www.elfster.com/

Les pages et fonctionnalités peuvent évoluer. Refaire la vérification avant toute décision produit ou communication commerciale.
