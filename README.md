# Rideau 🎭

Petite application personnelle pour trouver et regarder (ou écouter) des pièces de théâtre
disponibles **gratuitement et légalement** en ligne.

Les résultats viennent de l'API publique d'[Internet Archive](https://archive.org) :
captations filmées, théâtre radiophonique et lectures LibriVox (domaine public).

## Fonctionnalités

- Recherche par titre, auteur ou mot-clé (Molière, Feydeau, Beckett…)
- Catégories : théâtre filmé FR / EN, théâtre radiophonique, lectures LibriVox FR / EN
- Tri par popularité, date ou titre, pagination « Charger plus »
- Lecteur intégré (vidéo ou audio) dans une fenêtre
- Favoris ☆ et pièces « vues », enregistrés dans le navigateur (`localStorage`)
- Liens vers d'autres plateformes gratuites (France.tv, France Culture, ARTE…)
- Thème clair / sombre automatique, utilisable sur mobile

## Lancer l'application

Aucune dépendance, aucun build. Les modules JavaScript exigent juste un serveur HTTP local :

```bash
python3 -m http.server 8000
```

puis ouvrir <http://localhost:8000>.

On peut aussi l'héberger tel quel sur GitHub Pages (Settings → Pages → branche principale).

## Structure

```
index.html              Page et gabarits HTML
styles.css              Styles (variables de couleur, thème sombre)
js/main.js              Point d'entrée : état de l'app et orchestration
js/config.js            Catégories (requêtes Internet Archive) et liens externes
js/archiveApi.js        Appels à l'API de recherche d'Internet Archive
js/personalLibrary.js   Favoris et pièces vues (localStorage)
js/ui/resultsView.js    Grille de résultats
js/ui/playerDialog.js   Fenêtre du lecteur
js/utils.js             debounce, échappement Lucene…
```

## Ajouter une catégorie

Ajouter une entrée dans `CATEGORIES` (`js/config.js`) avec une requête au format
[recherche avancée d'Internet Archive](https://archive.org/advancedsearch.php).
