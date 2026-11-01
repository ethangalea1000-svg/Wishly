# Wishly - verification des mots de passe anciens (proposition de branche, pas production)

## Probleme conditionnel
Les inscriptions neuves utilisent 100000 iterations. Login et suppression verifient le nombre stocke.
Un ancien hash a 310000 iterations ne peut PAS etre verifie avec 100000 : le resultat est different.
Aucun ancien compte reel n'a ete recherche ou consulte.

## Ce patch fait
- Conserve exactement les parametres du hash stocke.
- Essaie la verification native existante avec ces parametres.
- Sur NotSupportedError : reponse 503 explicite, donnees conservees ; aucune reinitialisation, migration ou diminution des iterations.
- Meme protection pour confirmation de suppression de compte.
- Borne parametres malformes avant calcul (1..600000 iterations, sel16octets/hash32octets hex).
- Comparaison XOR sans retour anticipe (ne constitue pas une garantie de temps constant JavaScript).

## Voies comparees
1. Reutiliser crypto.subtle avec 310k si le runtime le permet : preserve le format, aucun cout logiciel nouveau. Si cap runtime reel, echec propre. Voie retenue ici.
2. PBKDF2 en JS/WASM : pourrait contourner la limite native mais coute CPU, augmente code cryptographique et risque DoS. Pas retenu sans benchmark runtime gratuit et audit.
3. Service externe : cout, transmission du mot de passe/secret et nouvelles conditions. Non retenu.
4. Reset controle avec verification de possession : possible plus tard une fois provider email qualifie ; actuellement non implemente. Ne jamais remplacer hash sans preuve.
5. Baisse aveugle de 310k a100k : incompatible, rejetee.

## Tests synthétiques
Node22 WebCrypto-equivalent PBKDF2-SHA256: 100k valide, 310k valide, mauvais mot de passe refuse.
Cap runtime simule a100k : 310k produit PasswordVerificationUnavailableError, envoi exact du parametre310k et aucune mutation du record.
Parametres excessifs/invalide : refuses avant calcul. Tests de module seulement, pas preuve Workers.
Temps observe verification310k ~39ms sur Node local : PAS un benchmark Cloudflare.
TypeScript strict module valide. Integration Worker complete non typecheckee faute types Cloudflare locaux.

## Sources
- Source actuelle worker/src/index.ts (login et suppression utilisent iterations stockees).
- https://github.com/cloudflare/workerd/issues/1346 : historique limite100k.
- https://github.com/cloudflare/workerd/pull/3541 : proposition hausse600k fermee, ne prouve pas capacite du runtime actuel.

Reste : tester sur runtime cible avec fixtures, sans donnees reelles et sans deployer prod, puis provider/reset de recuperation futur si necessaire. Ce patch ne rend pas un compte310k utilisable quand la limite native est presente : il preserve son hash et rend l'echec explicite.
