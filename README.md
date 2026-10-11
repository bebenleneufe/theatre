# Rideau 🎭

Petite application personnelle pour trouver et regarder (ou écouter) des pièces de théâtre
disponibles **gratuitement et légalement** en ligne.

Les résultats viennent de l'API publique d'[Internet Archive](https://archive.org) :
captations filmées, théâtre radiophonique et lectures LibriVox (domaine public).

## Fonctionnalités

- Recherche par titre, auteur ou mot-clé (Molière, Feydeau, Beckett…)
- **Sélection récente** : 65 captations intégrales vérifiées sur YouTube, dont 38 publiées par les
  théâtres et compagnies eux-mêmes et 27 mises en ligne non officielles (badge orange)
  - filtres par langue, durée, genre et source
  - les vidéos retirées de YouTube sont repérées automatiquement (carte grisée « Vidéo retirée »)
  - **reprise de lecture** : la position est mémorisée, barre de progression sur la vignette,
    bouton « Reprendre à 47 min » ; la pièce passe en « Vu » une fois regardée à 95 %
- Catégories Internet Archive (depuis 2000) : théâtre filmé FR / EN, théâtre radiophonique,
  lectures LibriVox FR / EN ; comédies musicales, « proshots » et animes exclus d'office
- Durée sur chaque vignette, fiche avec résumé avant de lancer la pièce
- Listes perso : favoris ☆ et « À voir plus tard », pièces vues (option pour les masquer)
- Bouton ⊘ pour masquer définitivement un résultat sans intérêt
- 🎲 « Surprends-moi » : ouvre une pièce non vue au hasard parmi celles affichées
- **Mes données** : export / import d'un fichier de sauvegarde (fusion, rien n'est effacé)
- Liens vers d'autres plateformes gratuites (France.tv, France Culture, ARTE…)
- Rangée « Reprendre » en haut pour les pièces commencées
- Réglages retenus d'une visite à l'autre (onglet, filtres, tri, liste)
- Confirmations avec « Annuler » quand on masque un résultat, raccourci `/` pour chercher
- Thème sombre « salle obscure », pensé pour le mobile (fiche plein écran sur téléphone)

## Lancer l'application

Double-cliquer sur `index.html` : c'est tout. Aucune installation, aucun serveur.

(Pour récupérer les fichiers depuis GitHub : bouton **Code → Download ZIP**, puis dézipper.)

## Structure

```
index.html          Page et gabarits HTML
styles.css          Styles (variables de couleur, thème sombre)
js/app.js           Toute la logique, découpée en sections : config, utils, archiveApi,
                    playSources, curatedPlays, personalLibrary, videoAvailability,
                    playDetailsLoader, resultsView, playerDialog, main
js/plays-data.js    La liste des pièces de la « Sélection récente »
```

## Ajouter une pièce à la sélection

Ajouter une entrée dans `js/plays-data.js` (l'identifiant YouTube est la fin de l'URL
`youtube.com/watch?v=…`), en renseignant langue, genre et durée.

## Ajouter une catégorie

Ajouter une entrée dans `CATEGORIES` (section `config` de `js/app.js`) avec une requête au format
[recherche avancée d'Internet Archive](https://archive.org/advancedsearch.php).
