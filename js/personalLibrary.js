const STORAGE_KEY = 'rideau.library.v1';

function readStoredLibrary() {
  try {
    const storedJson = localStorage.getItem(STORAGE_KEY);
    const parsedLibrary = storedJson === null ? {} : JSON.parse(storedJson);
    return {
      favorites: parsedLibrary.favorites ?? {},
      watched: parsedLibrary.watched ?? {},
    };
  } catch (storageError) {
    console.warn('Bibliothèque locale illisible, elle repart de zéro.', storageError);
    return { favorites: {}, watched: {} };
  }
}

// Les favoris gardent une copie des métadonnées pour s'afficher sans requête réseau.
export class PersonalLibrary {
  #library = readStoredLibrary();

  isFavorite(identifier) {
    return Object.hasOwn(this.#library.favorites, identifier);
  }

  isWatched(identifier) {
    return Object.hasOwn(this.#library.watched, identifier);
  }

  toggleFavorite(play) {
    if (this.isFavorite(play.identifier)) {
      delete this.#library.favorites[play.identifier];
    } else {
      this.#library.favorites[play.identifier] = { ...play, savedAt: Date.now() };
    }
    this.#persist();
    return this.isFavorite(play.identifier);
  }

  toggleWatched(identifier) {
    if (this.isWatched(identifier)) {
      delete this.#library.watched[identifier];
    } else {
      this.#library.watched[identifier] = Date.now();
    }
    this.#persist();
    return this.isWatched(identifier);
  }

  listFavorites() {
    return Object.values(this.#library.favorites).sort((first, second) => second.savedAt - first.savedAt);
  }

  #persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#library));
    } catch (storageError) {
      console.warn('Impossible d’enregistrer la bibliothèque locale.', storageError);
    }
  }
}
