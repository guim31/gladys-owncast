# Owncast

[Owncast](https://owncast.online) est un serveur de diffusion en direct
auto-hébergé : votre propre Twitch, avec son chat. Cette intégration amène
votre Owncast dans Gladys : êtes-vous en direct, combien de personnes
regardent, le titre du direct, et des scènes qui réagissent quand un direct
commence, se termine ou atteint un nombre de spectateurs. Les scènes peuvent
aussi écrire dans le chat.

Owncast peut tourner chez vous ou sur un serveur loué : l'intégration marche
avec les deux (le badge de l'appareil dit « local » ou « cloud » selon
l'adresse).

Testée contre un vrai Owncast en Docker (version 0.3.0, octobre 2026), avec une
mire diffusée par ffmpeg : passage en direct, spectateurs, fin du direct,
statut d'administration, message dans le chat. Vos retours sont bienvenus dans
[les issues](https://github.com/guim31/gladys-owncast/issues).

## Ce qu'il faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un serveur Owncast joignable depuis Gladys (port 8080 par défaut, ou son
  adresse https://).
- Facultatif : le mot de passe de l'administration d'Owncast, pour le débit et
  la résolution entrants, et les spectateurs quand Owncast les masque.
- Facultatif : un jeton d'accès Owncast, pour écrire dans le chat depuis une
  scène.

## Mise en route

### 1. Trouver l'adresse d'Owncast

C'est l'adresse de la page qu'ouvrent vos spectateurs, par exemple
`http://192.168.1.2:8080` ou `https://live.example.org`. Une adresse copiée
depuis le navigateur marche aussi (`…/admin`) : l'intégration en garde le
début.

### 2. Configurer l'intégration

Dans Gladys, ouvrez l'intégration et remplissez :

- **Adresse d'Owncast**.
- **Mot de passe d'administration (facultatif)** : celui qui ouvre `/admin`
  (utilisateur `admin`). Il ajoute deux fonctionnalités à l'appareil : débit
  entrant et résolution entrante.
- **Jeton d'accès (facultatif)** : dans Owncast, ouvrez Admin → Integrations →
  Access Tokens, créez un jeton avec le droit d'envoyer des messages système,
  et collez-le ici. Seulement pour l'action « Envoyer un message dans le
  chat ».
- **Intervalle de rafraîchissement** : 30 secondes par défaut. Une requête
  légère à chaque fois (deux avec le mot de passe d'administration).
- **Langue des noms** : la langue des noms des fonctionnalités et des
  résultats de scène.

Utilisez ensuite **Tester la connexion** : elle lit Owncast et dit si vous êtes
en direct.

### 3. Ajouter l'appareil

Ouvrez l'onglet **Découverte** et ajoutez l'appareil, qui porte le nom de votre
serveur. Si vous saisissez le mot de passe d'administration plus tard, l'onglet
propose de mettre l'appareil à jour avec les deux nouvelles fonctionnalités.

## L'appareil

| Fonctionnalité      | Ce qu'elle dit                                                        |
| ------------------- | --------------------------------------------------------------------- |
| En direct           | Oui pendant le direct                                                 |
| Spectateurs         | Personnes qui regardent en ce moment (0 hors ligne)                   |
| Pic de spectateurs  | Le plus de spectateurs du direct en cours, ou du dernier              |
| Titre du direct     | Le titre réglé dans Owncast                                           |
| Durée du direct     | Minutes depuis le début du direct (0 hors ligne)                      |
| Débit entrant       | Avec le mot de passe d'administration : débit vidéo de votre logiciel |
| Résolution entrante | Avec le mot de passe d'administration : la résolution, ex. 1920×1080  |

Un direct se termine quand Owncast est hors ligne depuis une minute : si votre
logiciel de diffusion se reconnecte après une courte coupure réseau, le direct
continue.

## Tableau de bord

Le widget **Direct Owncast** montre le titre, puis en direct ou hors ligne. En
direct : les spectateurs, le pic et les minutes, plus la résolution et le débit
entrants avec le mot de passe d'administration. Hors ligne : la durée et le pic
du dernier direct. Le bouton **Actualiser** relit Owncast tout de suite ; le
bouton **Regarder** ouvre la page du direct quand son adresse est en https://.

## Scènes

### Déclencheurs

- **Un direct commence** : avec le titre du direct et le nom du serveur.
- **Un direct se termine** : avec le titre, la durée en minutes et le pic de
  spectateurs.
- **Les spectateurs atteignent un seuil** : choisissez 1, 5, 10, 25, 50, 100,
  250, 500 ou 1000 ; se déclenche une fois par direct quand les spectateurs
  l'atteignent. 1 veut dire « quelqu'un regarde ».

Le début, la fin et les seuils sont gardés par l'intégration : un redémarrage
de Gladys pendant un direct ne l'annonce pas une deuxième fois, et un direct
terminé pendant que Gladys était arrêtée est quand même annoncé, une fois.

### Actions

- **État du direct** : lit le direct pour les actions suivantes : en direct ou
  non, titre, spectateurs, pic, durée en minutes, et une phrase toute prête
  (« Mon direct : En direct, « Atelier du samedi », 12 spectateur(s), depuis
  45 min »).
- **Envoyer un message dans le chat** : publie un message système dans le chat
  du direct. Demande le jeton d'accès de la configuration.

### Idées de scènes

- **Lampe « On air »** : « Un direct commence » passe la lampe de la porte du
  bureau en rouge ; « Un direct se termine » l'éteint.
- **Ne pas déranger** : « Un direct commence » coupe le carillon de la
  sonnette ; si quelqu'un sonne quand même, « Envoyer un message dans le
  chat » prévient les spectateurs que vous revenez dans 2 minutes.
- **Audience** : « Les spectateurs atteignent un seuil » (50) vous envoie une
  notification avec le titre ; « Un direct se termine » envoie la durée et le
  pic.

## Dépannage

- **Owncast ne répond pas** : vérifiez l'adresse et le port depuis la machine
  de Gladys.
- **Aucun Owncast à cette adresse** : l'adresse mène à un autre service, ou à
  un sous-chemin qui n'est pas Owncast.
- **L'adresse redirige** : saisissez l'adresse en https://.
- **Mot de passe d'administration refusé par Owncast** : saisissez le mot de
  passe de `/admin` ; l'état du direct reste lu en attendant.
- **Jeton d'accès refusé** : recréez le jeton avec le droit d'envoyer des
  messages système.
- **Les spectateurs restent à 0 pendant le direct** : Owncast masque peut-être
  le nombre de spectateurs (Admin → Configuration) ; saisissez le mot de passe
  d'administration pour le lire quand même.

## Limites

- Un seul serveur Owncast par intégration.
- La durée et le pic sont mesurés par l'intégration ; un pic entre deux
  lectures n'est vu que par le statut d'administration.
- Prévue pour Owncast 0.1 et plus récent ; testée sur la 0.3.0.
- Sans lien avec le projet Owncast.
