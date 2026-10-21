# Wishly — plan de réalisation des 200 exigences

Ce document est le suivi de livraison de la version **production**. Les cases restent décochées tant qu'un changement n'a pas été implémenté et vérifié. La maquette publique n'est pas une preuve de réalisation.

## Statuts
- [ ] À faire
- [x] Implémenté dans cette branche (à valider par tests et déploiement)
- [!] Nécessite un compte/service externe, une décision produit ou une validation juridique

## Phase 0 — fondations livrées dans cette branche
- [x] Schéma D1 initial : comptes, sessions, listes, cadeaux, réservations, journal d'audit, limitation de débit.
- [x] API de départ : inscription, connexion, déconnexion, session courante, lecture/création de listes et ajout de cadeaux.
- [x] Interface responsive initiale : inscription, connexion, création de listes et ajout d'idées cadeaux.
- [x] API exposée via Pages Functions pour préserver l'origine des cookies.
- [x] En-têtes HTTP de sécurité de base sur le frontend.
- [x] Vérification TypeScript CI réussie sur la branche de travail.
- [x] Hachage de mot de passe PBKDF2-SHA-256 côté Worker avec sel aléatoire.
- [x] Sessions opaques en cookie HttpOnly/Secure/SameSite, jeton haché en base, expiration.
- [x] Vérification d'origine pour les requêtes mutantes et limitation de débit initiale en D1.
- [x] Configuration Cloudflare séparée, avec identifiant de base à remplacer avant tout déploiement.
- [x] Tests de fumée API (configuration, santé, validation Origin) dans Vitest.
- [x] Test automatisé des migrations SQL et contraintes de base avec SQLite en CI.
- [ ] Tests d'intégration complets, revue sécurité indépendante et déploiement staging.

## Phase 0.1 — fonctionnalités livrées depuis la première version
- [x] Lecture et modification des listes, suppression contrôlée, archivage/restauration et duplication.
- [x] Modification et suppression de cadeaux avec contrôle de propriété.
- [x] Champs cadeaux : catégorie, prix estimé, quantité, priorité, lien et description.
- [x] Création/révocation de liens secrets de partage.
- [x] Page publique de liste partagée via lien secret.
- [x] Réservation invité avec limite de quantité et code d'annulation à usage secret.
- [x] L'annulation invité nécessite l'identifiant de réservation et le code secret; seul le hachage du code est conservé.
- [x] Journal d'audit des opérations sensibles implémentées.
- [x] Export JSON des données du compte et suppression du compte après confirmation par mot de passe et adresse e-mail.
- [x] Tests automatisés exécutés en CI pour la configuration, la santé, l'origine des mutations et le schéma SQL.
- [x] Pages de brouillon confidentialité, conditions et mentions légales; elles restent à compléter et valider avant publication.
- [x] Page 404 accessible de base.
- [ ] Double confirmation de réservation, e-mail de vérification, récupération de compte, politique de conservation RGPD et tests navigateur.
- [ ] Validation de déploiement staging; aucune base D1 distante n'a été créée ni modifiée.

## Phase 1 — architecture et données (points 1–25)
- [ ] 1 API et architecture modulaire
- [x] 2 choix SQL documenté dans ARCHITECTURE.md
- [x] 3 schéma utilisateurs
- [x] 4 schéma listes
- [x] 5 schéma cadeaux
- [x] 6 contrat REST documenté
- [ ] 7 temps réel si besoin confirmé
- [x] 8 routes dynamiques
- [x] 9 variables d'environnement et garde-fous de configuration
- [x] 10 gestion d'erreur centralisée de base
- [ ] 11 cache seulement après mesure
- [ ] 12 limitation de débit durcie
- [ ] 13 logs structurés et expurgés
- [ ] 14 pagination cohérente
- [ ] 15 validation partagée
- [x] 16 migrations versionnées
- [ ] 17 files de tâches si besoin confirmé
- [x] 18 identifiants UUID
- [ ] 19 compression gérée par la plateforme
- [x] 20 index SQL
- [ ] 21 reprise sur erreurs transitoires
- [ ] 22 environnements dev/staging/prod séparés
- [x] 23 endpoint de santé
- [ ] 24 stratégie de sauvegarde et restauration testée
- [ ] 25 limites de ressources documentées

## Phase 2 — identité et sécurité (26–50, 176–200)
- [ ] 26 inscription
- [ ] 27 hachage robuste — PBKDF2 présent; comparer Argon2id selon support et benchmark
- [ ] 28 sessions serveur
- [ ] 29 OAuth — fournisseur à choisir
- [ ] 30 politique de mot de passe
- [ ] 31 réinitialisation par e-mail — fournisseur SMTP à configurer
- [ ] 32 MFA administrateur
- [ ] 33 RBAC et séparation des privilèges
- [ ] 34 vérification e-mail
- [ ] 35 prévention XSS
- [ ] 36 prévention CSRF
- [ ] 37 en-têtes et CSP
- [ ] 38 CORS strict
- [ ] 39 expiration/révocation des sessions
- [ ] 40 chiffrement des données sensibles
- [ ] 41 erreurs non révélatrices
- [x] 42 prévention des injections SQL via requêtes préparées
- [ ] 43 politique de comptes inactifs
- [x] 44 suppression/export du compte (cycle complet et politique de rétention encore à valider)
- [ ] 45 historique de connexion respectueux de la vie privée
- [ ] 46 verrouillage progressif et anti-bruteforce
- [ ] 47 alertes de sécurité par e-mail
- [ ] 48 audit dépendances automatisé
- [ ] 176 minimisation RGPD
- [ ] 177 CGU/CGV à adapter au modèle économique réel
- [ ] 178 mentions légales
- [ ] 179 internationalisation
- [ ] 180 détection de langue
- [ ] 181 navigation clavier
- [ ] 182 attributs ARIA
- [ ] 183 textes alternatifs
- [ ] 184 information jamais indiquée par la couleur seule
- [ ] 185 pays et paramètres régionaux
- [ ] 186 dates localisées
- [ ] 187 contact légal
- [ ] 188 options d'accessibilité
- [ ] 189 zoom à 200 %
- [ ] 190 transparence d'affiliation
- [ ] 191 politique adaptée aux mineurs
- [ ] 192 libellés de formulaires
- [ ] 193 prévention des débordements
- [ ] 194 analytique anonymisée et consentement si requis
- [ ] 195 messages d'erreur utiles
- [ ] 196 respect de prefers-reduced-motion
- [ ] 197 HTML sémantique
- [ ] 198 pages 404/500
- [ ] 199 sauvegardes et restauration testées
- [ ] 200 cycle de vie et effacement des données

## Phase 3 — listes et cadeaux (51–75, 101–125)
- [x] 51 accès invité par lien secret
- [x] 52 annulation de réservation par code secret
- [x] 53 nom de l'invité masqué au propriétaire dans l'API de partage
- [ ] 54 option de révélation contrôlée
- [ ] 55 contributions groupées
- [x] 56 priorité
- [x] 57 quantités
- [x] 58 archivage et duplication
- [x] 59 devises de liste et prix estimés
- [x] 60 catégories
- [ ] 61 tailles/options
- [x] 62 liens HTTP(S) validés et normalisés
- [x] 63 descriptions et notes de cadeaux
- [ ] 64 tri/filtres
- [x] 65 statut de cadeau modifiable dans l'interface
- [ ] 66 contributions invitées
- [ ] 67 statistiques agrégées
- [ ] 68 notifications
- [x] 69 détection et contrainte SQL sur les URL en doublon
- [ ] 70 échéances
- [ ] 71 coédition
- [ ] 72 brouillons
- [ ] 73 historique
- [ ] 74 confirmation de réservation en deux étapes
- [ ] 75 annulation avec contrôle de propriété
- [ ] 101 extraction URL sans contourner les protections
- [ ] 102 Open Graph/JSON-LD
- [ ] 103 extension navigateur
- [ ] 104 APIs d'affiliation officielles
- [ ] 105 respecter robots.txt, conditions d'utilisation et limites anti-bot
- [ ] 106 rafraîchissement de prix avec consentement/limites
- [ ] 107 disponibilité si source autorisée
- [ ] 108 sélection d'image
- [ ] 109 conversion de devise via source documentée
- [ ] 110 liens courts sûrs
- [ ] 111 QR code
- [ ] 112 e-mail transactionnel
- [ ] 113 webhooks signés
- [ ] 114 export calendrier
- [ ] 115 contributions paiement — prestataire et conformité à choisir
- [ ] 116 validation et normalisation URL
- [ ] 117 analytics respectueuses de la vie privée
- [ ] 118 SMS — prestataire et consentement à choisir
- [ ] 119 magasins locaux si données fiables disponibles
- [ ] 120 recommandations explicables
- [ ] 121 aperçus enrichis
- [ ] 122 export PDF/CSV
- [ ] 123 import/export utilisateur
- [ ] 124 protection SSRF de toute extraction serveur
- [ ] 125 quotas de scraping et cache par source

## Phase 4 — interface et accessibilité (76–100)
- [ ] 76 cohérence éditoriale
- [ ] 77 images optimisées
- [ ] 78 système de design
- [ ] 79 mode sombre
- [ ] 80 responsive mobile
- [ ] 81 skeletons
- [ ] 82 transitions sobres
- [ ] 83 toasts accessibles
- [ ] 84 progression
- [ ] 85 retour en haut
- [ ] 86 états vides
- [ ] 87 modales accessibles
- [ ] 88 contraste WCAG
- [ ] 89 partage natif
- [ ] 90 hover avec équivalent tactile/clavier
- [ ] 91 navigation mobile
- [ ] 92 icônes cohérentes
- [ ] 93 focus visible
- [ ] 94 prévisualisation live
- [ ] 95 typographie
- [ ] 96 glisser-déposer avec alternative
- [ ] 97 vue compacte/détaillée
- [ ] 98 pagination ou chargement progressif
- [ ] 99 bannières
- [ ] 100 compte à rebours accessible

## Phase 5 — administration (126–150)
- [ ] 126 interface admin isolée
- [ ] 127 KPI minimisés
- [ ] 128 modération
- [ ] 129 gestion comptes avec journalisation
- [ ] 130 audit des actions admin
- [ ] 131 réglages validés
- [ ] 132 signalements
- [ ] 133 anti-spam
- [ ] 134 monitoring
- [ ] 135 support
- [ ] 136 CMS pages légales
- [ ] 137 campagnes d'affiliation
- [ ] 138 testeur d'extraction URL
- [ ] 139 bannières
- [ ] 140 rapports financiers si paiements activés
- [ ] 141 taux de rebond uniquement si mesure licite et utile
- [ ] 142 configuration SMTP protégée
- [ ] 143 statistiques géographiques agrégées seulement
- [ ] 144 listes de blocage
- [ ] 145 accès base réservé aux opérateurs autorisés
- [ ] 146 alertes Slack/Discord optionnelles
- [ ] 147 FAQ
- [ ] 148 Core Web Vitals
- [ ] 149 versionnement API
- [ ] 150 purge cache contrôlée

## Phase 6 — performance et résilience (151–175)
- [ ] 151 lazy loading images
- [ ] 152 CDN
- [ ] 153 redimensionnement image avec source autorisée
- [ ] 154 minification
- [ ] 155 découpage du code
- [ ] 156 décision SSR/CSR fondée sur mesure
- [ ] 157 nettoyage CSS
- [ ] 158 mises à jour de dépendances
- [ ] 159 cache HTTP explicite
- [ ] 160 mesure TTFB
- [ ] 161 préchargement de polices justifié
- [ ] 162 tests de fuites mémoire
- [ ] 163 limitation du DOM
- [ ] 164 animations GPU si utile
- [ ] 165 requêtes SQL non bloquantes et mesurées
- [ ] 166 stratégie service worker testée
- [ ] 167 nettoyage données temporaires
- [ ] 168 redirections canoniques
- [ ] 169 compression appropriée
- [ ] 170 SVG intégrés sûrs
- [ ] 171 clés de rendu stables
- [ ] 172 audits Lighthouse
- [ ] 173 stockage local sans secret
- [ ] 174 reprise avec backoff exponentiel
- [ ] 175 tests de charge et budgets

## Décisions qui restent volontairement ouvertes
- Prestataire d'e-mail, OAuth et paiements.
- Politique de visibilité et de réservation pour les invités.
- Pays, devise et exigences juridiques au lancement.
- Analytics : option la plus minimisée, désactivée par défaut tant que la base légale n'est pas définie.
- Toute fonctionnalité d'extraction marchande doit respecter les conditions des sites sources et ne pas contourner leurs protections.

## Règle de livraison
Une case ne passe à « terminée » qu'après code, test reproductible et contrôle du comportement en environnement de test. Un déploiement n'est pas effectué automatiquement par ce document.