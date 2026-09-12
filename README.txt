LA ROUE DU CSE — V5 DÉMO
=========================

LANCEMENT
---------
Ouvrir index.html dans Chrome, Edge ou Firefox.
Compatible avec GitHub Pages.

AUTHENTIFICATION DÉMO
---------------------
1. Saisir n'importe quelle adresse e-mail valide.
2. Cliquer sur RECEVOIR MON CODE.
3. Utiliser le code :
   123456

Chaque adresse e-mail possède sa propre progression locale.

LIMITATION
----------
Chaque utilisateur dispose de 3 tirages maximum.
Après le troisième tirage :
- compteur = 3 / 3
- tirages restants = 0
- roue désactivée
- bouton TOURNER LA ROUE désactivé

STOCK INITIAL
-------------
Exalto : 3
CGR 26/12/2026 : 6
CGR 14/05/2027 : 8
Pathé 30/11/2026 : 5
Pathé 31/05/2027 : 20
UGC 31/07/2027 : 30
Caliceo : 2
TOTAL : 74

LOTS DÉMO
---------
Exalto : 1
CGR : 2 ou 3
Pathé : 2 ou 3
UGC : 2 ou 3
Caliceo : 2

OUTILS DÉMO
-----------
FORCER UN GAIN
Le prochain tirage est gagnant.

RESET MES 3 TIRAGES
Réinitialise uniquement les tirages de l'utilisateur actuellement connecté.

RESET STOCK
Réinitialise le stock global local.

IMPORTANT — SÉCURITÉ
--------------------
Cette V5 est une MAQUETTE.
Elle simule l'authentification et les quotas avec localStorage.

La version réelle NE DEVRA PAS gérer côté navigateur :
- la liste des utilisateurs
- les OTP
- le nombre réel de tirages
- l'attribution des lots
- le stock
- les tickets
- les e-mails

VERSION PRODUCTION
------------------
Backend recommandé :
PHP + MySQL

Le serveur devra gérer :
- liste des ~720 e-mails autorisés
- OTP à durée limitée
- hash des OTP
- limitation des tentatives
- sessions sécurisées
- cookies Secure / HttpOnly / SameSite
- 3 tirages maximum côté serveur
- attribution transactionnelle des lots
- stock réel
- tickets uniques
- envoi mail
- journalisation
- fermeture automatique du jeu
- administration CSE


RÈGLE 1 LOT PAR PERSONNE
------------------------
Chaque participant dispose toujours de 3 tirages maximum.

Cependant :
- un participant peut gagner au maximum 1 seul lot ;
- un lot peut contenir plusieurs places (ex. 2 UGC, 3 CGR) ;
- après un premier gain, les tirages restants sont forcément perdants ;
- le stock n'est donc jamais décrémenté une deuxième fois pour le même participant.

En production, cette règle sera contrôlée côté serveur et en base de données.
