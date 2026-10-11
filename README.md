# Rideau 🎭

Petite application personnelle pour trouver et regarder (ou écouter) des pièces de théâtre
disponibles **gratuitement et légalement** en ligne.

Les résultats viennent de l'API publique d'[Internet Archive](https://archive.org) :
captations filmées, théâtre radiophonique et lectures LibriVox (domaine public).

## Fonctionnalités

- Recherche par titre, auteur ou mot-clé (Molière, Feydeau, Beckett…)
- **Sélection récente** : 38 captations intégrales vérifiées, publiées sur YouTube par les
  théâtres et compagnies eux-mêmes (Odéon, Comédie-Française, Théâtre du Nord, Gecko…)
- Catégories Internet Archive (depuis 2000) : théâtre filmé FR / EN, théâtre radiophonique,
  lectures LibriVox FR / EN
- Tri par popularité, date ou titre, pagination « Charger plus »
- Durée affichée sur chaque vignette
- Fiche avec résumé avant de lancer la pièce, puis lecteur intégré (vidéo ou audio)
- Favoris ☆ et pièces « vues », enregistrés dans le navigateur (`localStorage`)
- Liens vers d'autres plateformes gratuites (France.tv, France Culture, ARTE…)
- Thème clair / sombre automatique, utilisable sur mobile

## Lancer l'application

Double-cliquer sur `index.html` : c'est tout. Aucune installation, aucun serveur.

(Pour récupérer les fichiers depuis GitHub : bouton **Code → Download ZIP**, puis dézipper.)

## Structure

```
index.html    Page et gabarits HTML
styles.css    Styles (variables de couleur, thème sombre)
js/app.js     Toute la logique, découpée en sections :
              config, utils, archiveApi, personalLibrary,
              resultsView, playerDialog, main
```

## Ajouter une catégorie

Ajouter une entrée dans `CATEGORIES` (section `config` de `js/app.js`) avec une requête au format
[recherche avancée d'Internet Archive](https://archive.org/advancedsearch.php).
