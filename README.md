# Rideau 🎭

Petite application personnelle pour regarder des pièces de théâtre filmées, gratuites,
jouées depuis 2000.

Le catalogue est une sélection de 65 captations intégrales sur YouTube, vérifiées une à une
(intégrables, en couleur, tournées après 2000) : 38 publiées par les théâtres et compagnies
eux-mêmes (Odéon, Comédie-Française, Théâtre du Nord, Gecko…) et 27 mises en ligne non
officielles, signalées par un badge orange car elles peuvent disparaître.

## Fonctionnalités

- Recherche par titre, auteur ou troupe, filtres par langue, durée, genre et source
- Fiche avec résumé, durée et étiquettes avant de lancer la pièce
- **Reprise de lecture** : position mémorisée, rangée « Reprendre » en haut, barre de progression
  sur la vignette ; la pièce passe en « Vu » une fois regardée à 95 %
- Listes perso : favoris et « À voir plus tard », pièces vues (option pour les masquer)
- Vidéos retirées de YouTube repérées automatiquement (carte grisée « Vidéo retirée »)
- Bouton pour masquer une pièce (avec « Annuler »), 🎲 « Surprends-moi »
- Réglages retenus d'une visite à l'autre, raccourci `/` pour chercher
- **Mes données** : export / import d'un fichier de sauvegarde (fusion, rien n'est effacé)
- **Écran du salon** : diffuse l'image sur le tableau ScreenDisplay (Fully Kiosk) pendant que le
  son reste sur le téléphone, avec un écran télécommande (pause, ±30 s, barre de progression).
  Les deux appareils se présentent par un canal ntfy (2 à 4 messages), puis la position passe
  chaque seconde par une connexion directe WebRTC sur le Wi-Fi ; si elle échoue, la diffusion
  continue par ntfy (messages aux changements et toutes les 2 minutes, quota de 250/jour).
  Liaison une seule fois via « Écran du salon » en bas de page, ou avec `#ecran=<canal>`.
- Liens vers d'autres plateformes gratuites (France.tv, ARTE, Comédie-Française)
- Thème sombre « salle obscure », pensé pour le mobile

## Lancer l'application

Double-cliquer sur `index.html` : c'est tout. Aucune installation, aucun serveur.

Pour récupérer les fichiers depuis GitHub : bouton **Code → Download ZIP**, puis dézipper.

## Structure

```
index.html          Page et gabarits HTML
styles.css          Styles (thème sombre)
js/app.js           Toute la logique, découpée en sections : config, utils, playSources,
                    curatedPlays, personalLibrary, preferences, toast, videoAvailability,
                    resultsView, resumeShelf, playerDialog, main
js/plays-data.js    La liste des pièces
```

## Ajouter une pièce

Ajouter une entrée dans `js/plays-data.js` (l'identifiant YouTube est la fin de l'URL
`youtube.com/watch?v=…`), en renseignant langue, genre, durée et un résumé.
