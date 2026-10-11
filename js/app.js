// Script classique (et non module ES) pour que la page s'ouvre par simple
// double-clic : les navigateurs bloquent les modules chargés depuis file://.
(() => {
  'use strict';

  // --- config ---
  const PAGE_SIZE = 24;
  const SEARCH_DEBOUNCE_MS = 400;

  // Requêtes Lucene d'Internet Archive, ajustées à la main : les sujets y sont saisis
  // librement par les contributeurs, d'où les nombreuses variantes orthographiques.
  const CATEGORIES = [
    {
      id: 'video-fr',
      label: 'Théâtre filmé (FR)',
      badge: 'Vidéo',
      query: 'mediatype:movies AND (subject:("théâtre" OR "theatre" OR "pièce de théâtre" OR "théâtre filmé")) AND language:(fre OR french OR français)',
    },
    {
      id: 'video-en',
      label: 'Filmed plays (EN)',
      badge: 'Vidéo',
      query: 'mediatype:movies AND subject:("stage play" OR "filmed play" OR "theatre production" OR "filmed theatre")',
    },
    {
      id: 'radio-fr',
      label: 'Théâtre radiophonique',
      badge: 'Audio',
      query: 'mediatype:audio AND subject:("théâtre radiophonique" OR "pièce radiophonique" OR "fiction radiophonique")',
    },
    {
      id: 'audio-fr',
      label: 'Lectures LibriVox (FR)',
      badge: 'Audio',
      query: 'collection:librivoxaudio AND language:(french OR fre) AND subject:(théâtre OR "pièce de théâtre" OR tragédie OR "dramatic reading" OR drama)',
    },
    {
      id: 'audio-en',
      label: 'LibriVox plays (EN)',
      badge: 'Audio',
      query: 'collection:librivoxaudio AND language:(english OR eng) AND subject:(drama OR play OR "dramatic reading")',
    },
  ];

  const EXTERNAL_LINKS = [
    {
      label: 'France.tv — Théâtre et danse',
      description: 'Captations récentes, disponibles en replay pour une durée limitée.',
      url: 'https://www.france.tv/spectacles-et-culture/theatre-et-danse/',
    },
    {
      label: 'France Culture — Fictions / Théâtre et Cie',
      description: 'Pièces radiophoniques en podcast.',
      url: 'https://www.radiofrance.fr/franceculture/podcasts/fictions-theatre-et-cie',
    },
    {
      label: 'ARTE Concert',
      description: 'Spectacles vivants, dont du théâtre, en accès libre.',
      url: 'https://www.arte.tv/fr/arte-concert/',
    },
    {
      label: 'Comédie-Française',
      description: 'Programmation, captations et contenus en ligne de la troupe.',
      url: 'https://www.comedie-francaise.fr/',
    },
  ];
  // --- utils ---
  function debounce(callback, delayMs) {
    let timeoutId = null;

    const debounced = (...callArguments) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = null;
        callback(...callArguments);
      }, delayMs);
    };

    debounced.cancel = () => {
      clearTimeout(timeoutId);
      timeoutId = null;
    };

    return debounced;
  }

  const LUCENE_SPECIAL_CHARACTERS = /[+\-!(){}[\]^"~*?:\\/&|]/g;

  function escapeLuceneTerm(rawTerm) {
    return rawTerm.replace(LUCENE_SPECIAL_CHARACTERS, '\\$&');
  }

  function isAbortError(error) {
    return error instanceof DOMException && error.name === 'AbortError';
  }

  function firstValue(fieldValue) {
    return Array.isArray(fieldValue) ? fieldValue[0] : fieldValue;
  }
  // --- archiveApi ---

  const ARCHIVE_ORIGIN = 'https://archive.org';
  const RETURNED_FIELDS = ['identifier', 'title', 'creator', 'year', 'mediatype'];

  function buildTextClause(searchText) {
    const terms = searchText
      .trim()
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .map(escapeLuceneTerm);

    if (terms.length === 0) {
      return '';
    }

    const allTerms = terms.join(' AND ');
    return `(title:(${allTerms}) OR creator:(${allTerms}) OR subject:(${allTerms}) OR description:(${allTerms}))`;
  }

  function buildQuery(categoryQuery, searchText) {
    const textClause = buildTextClause(searchText);
    return textClause === '' ? `(${categoryQuery})` : `(${categoryQuery}) AND ${textClause}`;
  }

  function toPlay(document, badge) {
    return {
      identifier: document.identifier,
      title: firstValue(document.title) ?? document.identifier,
      creator: firstValue(document.creator) ?? '',
      year: firstValue(document.year) ?? '',
      badge,
    };
  }

  async function searchPlays({ category, searchText, sort, page, signal }) {
    const searchParameters = new URLSearchParams({
      q: buildQuery(category.query, searchText),
      rows: String(PAGE_SIZE),
      page: String(page),
      output: 'json',
    });
    RETURNED_FIELDS.forEach((field) => searchParameters.append('fl[]', field));
    searchParameters.append('sort[]', sort);

    const response = await fetch(`${ARCHIVE_ORIGIN}/advancedsearch.php?${searchParameters}`, { signal });
    if (!response.ok) {
      throw new Error(`Internet Archive a répondu ${response.status}`);
    }

    const payload = await response.json();
    return {
      totalCount: payload.response.numFound,
      plays: payload.response.docs.map((document) => toPlay(document, category.badge)),
    };
  }

  function thumbnailUrl(identifier) {
    return `${ARCHIVE_ORIGIN}/services/img/${encodeURIComponent(identifier)}`;
  }

  function embedUrl(identifier) {
    return `${ARCHIVE_ORIGIN}/embed/${encodeURIComponent(identifier)}`;
  }

  function detailsUrl(identifier) {
    return `${ARCHIVE_ORIGIN}/details/${encodeURIComponent(identifier)}`;
  }
  // --- personalLibrary ---
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
  class PersonalLibrary {
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
  // --- resultsView ---

  class ResultsView {
    #gridElement;
    #cardTemplate;
    #library;
    #onOpenPlay;
    #playsByIdentifier = new Map();
    #cardsByIdentifier = new Map();
    #handleGridClick = (clickEvent) => this.#onGridClick(clickEvent);

    constructor({ gridElement, cardTemplate, library, onOpenPlay }) {
      this.#gridElement = gridElement;
      this.#cardTemplate = cardTemplate;
      this.#library = library;
      this.#onOpenPlay = onOpenPlay;
      this.#gridElement.addEventListener('click', this.#handleGridClick);
    }

    replace(plays) {
      this.#playsByIdentifier.clear();
      this.#cardsByIdentifier.clear();
      this.#gridElement.replaceChildren(this.#buildCards(plays));
    }

    append(plays) {
      this.#gridElement.append(this.#buildCards(plays));
    }

    refreshCard(identifier) {
      const cardElement = this.#cardsByIdentifier.get(identifier);
      if (cardElement !== undefined) {
        this.#applyPersonalState(cardElement, identifier);
      }
    }

    destroy() {
      this.#gridElement.removeEventListener('click', this.#handleGridClick);
      this.#playsByIdentifier.clear();
      this.#cardsByIdentifier.clear();
    }

    #buildCards(plays) {
      const fragment = document.createDocumentFragment();
      plays
        .filter((play) => !this.#playsByIdentifier.has(play.identifier))
        .forEach((play) => {
          this.#playsByIdentifier.set(play.identifier, play);
          fragment.append(this.#buildCard(play));
        });
      return fragment;
    }

    #buildCard(play) {
      const cardElement = this.#cardTemplate.content.firstElementChild.cloneNode(true);
      cardElement.dataset.identifier = play.identifier;

      cardElement.querySelector('.card-thumbnail').src = thumbnailUrl(play.identifier);
      cardElement.querySelector('.card-badge').textContent = play.badge;
      cardElement.querySelector('.card-title').textContent = play.title;
      cardElement.querySelector('.card-meta').textContent = [play.creator, play.year]
        .filter((metaPart) => metaPart !== '')
        .join(' · ');
      cardElement.querySelector('.card-open').setAttribute('aria-label', `Lancer « ${play.title} »`);

      this.#applyPersonalState(cardElement, play.identifier);
      this.#cardsByIdentifier.set(play.identifier, cardElement);
      return cardElement;
    }

    #applyPersonalState(cardElement, identifier) {
      const isFavorite = this.#library.isFavorite(identifier);
      const favoriteButton = cardElement.querySelector('.card-favorite');
      favoriteButton.textContent = isFavorite ? '★' : '☆';
      favoriteButton.setAttribute('aria-pressed', String(isFavorite));
      favoriteButton.setAttribute('aria-label', isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris');

      cardElement.querySelector('.card-watched-badge').hidden = !this.#library.isWatched(identifier);
    }

    #onGridClick(clickEvent) {
      const cardElement = clickEvent.target.closest('.card');
      if (cardElement === null) {
        return;
      }

      const play = this.#playsByIdentifier.get(cardElement.dataset.identifier);
      if (play === undefined) {
        return;
      }

      if (clickEvent.target.closest('.card-favorite') !== null) {
        this.#library.toggleFavorite(play);
        this.#applyPersonalState(cardElement, play.identifier);
        return;
      }

      if (clickEvent.target.closest('.card-open') !== null) {
        this.#onOpenPlay(play);
      }
    }
  }
  // --- playerDialog ---

  class PlayerDialog {
    #dialogElement;
    #titleElement;
    #frameWrapper;
    #sourceLink;
    #watchedButton;
    #closeButton;
    #library;
    #onPersonalStateChange;
    #currentPlay = null;

    #handleCloseClick = () => this.#dialogElement.close();
    #handleWatchedClick = () => this.#toggleWatched();
    #handleDialogClose = () => this.#unloadPlayer();
    #handleBackdropClick = (clickEvent) => {
      if (clickEvent.target === this.#dialogElement) {
        this.#dialogElement.close();
      }
    };

    constructor({ dialogElement, library, onPersonalStateChange }) {
      this.#dialogElement = dialogElement;
      this.#titleElement = dialogElement.querySelector('#player-title');
      this.#frameWrapper = dialogElement.querySelector('#player-frame-wrapper');
      this.#sourceLink = dialogElement.querySelector('#player-source-link');
      this.#watchedButton = dialogElement.querySelector('#player-watched');
      this.#closeButton = dialogElement.querySelector('#player-close');
      this.#library = library;
      this.#onPersonalStateChange = onPersonalStateChange;

      this.#closeButton.addEventListener('click', this.#handleCloseClick);
      this.#watchedButton.addEventListener('click', this.#handleWatchedClick);
      this.#dialogElement.addEventListener('close', this.#handleDialogClose);
      this.#dialogElement.addEventListener('click', this.#handleBackdropClick);
    }

    open(play) {
      this.#currentPlay = play;
      this.#titleElement.textContent = play.title;
      this.#sourceLink.href = detailsUrl(play.identifier);
      this.#renderWatchedButton();

      const playerFrame = document.createElement('iframe');
      playerFrame.src = embedUrl(play.identifier);
      playerFrame.title = `Lecteur : ${play.title}`;
      playerFrame.allow = 'fullscreen; autoplay';
      playerFrame.allowFullscreen = true;
      playerFrame.className = 'player-frame';
      this.#frameWrapper.replaceChildren(playerFrame);

      this.#dialogElement.showModal();
    }

    destroy() {
      this.#closeButton.removeEventListener('click', this.#handleCloseClick);
      this.#watchedButton.removeEventListener('click', this.#handleWatchedClick);
      this.#dialogElement.removeEventListener('close', this.#handleDialogClose);
      this.#dialogElement.removeEventListener('click', this.#handleBackdropClick);
      this.#unloadPlayer();
    }

    // Retirer l'iframe coupe la lecture : sinon le son continuerait après fermeture.
    #unloadPlayer() {
      this.#frameWrapper.replaceChildren();
      this.#currentPlay = null;
    }

    #toggleWatched() {
      if (this.#currentPlay === null) {
        return;
      }
      this.#library.toggleWatched(this.#currentPlay.identifier);
      this.#renderWatchedButton();
      this.#onPersonalStateChange(this.#currentPlay.identifier);
    }

    #renderWatchedButton() {
      const isWatched = this.#library.isWatched(this.#currentPlay.identifier);
      this.#watchedButton.textContent = isWatched ? '✓ Vu' : 'Marquer comme vu';
      this.#watchedButton.setAttribute('aria-pressed', String(isWatched));
    }
  }
  // --- main ---

  class RideauApp {
    #elements;
    #library = new PersonalLibrary();
    #resultsView;
    #playerDialog;
    #searchAbortController = null;
    #state = {
      category: CATEGORIES[0],
      searchText: '',
      sort: 'downloads desc',
      page: 1,
      loadedCount: 0,
      totalCount: 0,
      favoritesOnly: false,
    };

    #debouncedSearch = debounce(() => this.#startNewSearch(), SEARCH_DEBOUNCE_MS);
    #handleSearchInput = (inputEvent) => {
      this.#state.searchText = inputEvent.target.value;
      this.#debouncedSearch();
    };
    #handleSortChange = (changeEvent) => {
      this.#state.sort = changeEvent.target.value;
      this.#startNewSearch();
    };
    #handleFavoritesToggle = (changeEvent) => {
      this.#state.favoritesOnly = changeEvent.target.checked;
      this.#startNewSearch();
    };
    #handleTabClick = (clickEvent) => this.#selectCategory(clickEvent);
    #handleLoadMoreClick = () => this.#loadNextPage();

    constructor(elements) {
      this.#elements = elements;
      this.#resultsView = new ResultsView({
        gridElement: elements.resultsGrid,
        cardTemplate: elements.cardTemplate,
        library: this.#library,
        onOpenPlay: (play) => this.#playerDialog.open(play),
      });
      this.#playerDialog = new PlayerDialog({
        dialogElement: elements.playerDialog,
        library: this.#library,
        onPersonalStateChange: (identifier) => this.#resultsView.refreshCard(identifier),
      });
    }

    start() {
      this.#renderCategoryTabs();
      this.#renderExternalLinks();

      this.#elements.searchInput.addEventListener('input', this.#handleSearchInput);
      this.#elements.sortSelect.addEventListener('change', this.#handleSortChange);
      this.#elements.favoritesCheckbox.addEventListener('change', this.#handleFavoritesToggle);
      this.#elements.categoryTabs.addEventListener('click', this.#handleTabClick);
      this.#elements.loadMoreButton.addEventListener('click', this.#handleLoadMoreClick);

      this.#startNewSearch();
    }

    destroy() {
      this.#debouncedSearch.cancel();
      this.#searchAbortController?.abort();
      this.#elements.searchInput.removeEventListener('input', this.#handleSearchInput);
      this.#elements.sortSelect.removeEventListener('change', this.#handleSortChange);
      this.#elements.favoritesCheckbox.removeEventListener('change', this.#handleFavoritesToggle);
      this.#elements.categoryTabs.removeEventListener('click', this.#handleTabClick);
      this.#elements.loadMoreButton.removeEventListener('click', this.#handleLoadMoreClick);
      this.#resultsView.destroy();
      this.#playerDialog.destroy();
    }

    #renderCategoryTabs() {
      const fragment = document.createDocumentFragment();
      CATEGORIES.forEach((category) => {
        const tabButton = document.createElement('button');
        tabButton.type = 'button';
        tabButton.className = 'tab';
        tabButton.setAttribute('role', 'tab');
        tabButton.dataset.categoryId = category.id;
        tabButton.textContent = category.label;
        fragment.append(tabButton);
      });
      this.#elements.categoryTabs.replaceChildren(fragment);
      this.#highlightActiveTab();
    }

    #highlightActiveTab() {
      this.#elements.categoryTabs.querySelectorAll('.tab').forEach((tabButton) => {
        const isActive = tabButton.dataset.categoryId === this.#state.category.id;
        tabButton.setAttribute('aria-selected', String(isActive));
        tabButton.disabled = this.#state.favoritesOnly;
      });
    }

    #renderExternalLinks() {
      const fragment = document.createDocumentFragment();
      EXTERNAL_LINKS.forEach((externalLink) => {
        const listItem = document.createElement('li');
        const anchor = document.createElement('a');
        anchor.href = externalLink.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = externalLink.label;
        const description = document.createElement('span');
        description.textContent = externalLink.description;
        listItem.append(anchor, description);
        fragment.append(listItem);
      });
      this.#elements.externalLinksList.replaceChildren(fragment);
    }

    #selectCategory(clickEvent) {
      const tabButton = clickEvent.target.closest('.tab');
      if (tabButton === null) {
        return;
      }
      const selectedCategory = CATEGORIES.find((category) => category.id === tabButton.dataset.categoryId);
      if (selectedCategory === undefined || selectedCategory === this.#state.category) {
        return;
      }
      this.#state.category = selectedCategory;
      this.#startNewSearch();
    }

    #startNewSearch() {
      this.#debouncedSearch.cancel();
      this.#highlightActiveTab();
      this.#state.page = 1;
      this.#state.loadedCount = 0;

      if (this.#state.favoritesOnly) {
        this.#searchAbortController?.abort();
        this.#showFavorites();
        return;
      }
      this.#fetchPage({ isFirstPage: true });
    }

    #loadNextPage() {
      this.#state.page += 1;
      this.#fetchPage({ isFirstPage: false });
    }

    #showFavorites() {
      const normalizedSearch = this.#state.searchText.trim().toLocaleLowerCase('fr');
      const matchingFavorites = this.#library.listFavorites().filter((play) =>
        `${play.title} ${play.creator}`.toLocaleLowerCase('fr').includes(normalizedSearch));

      this.#resultsView.replace(matchingFavorites);
      this.#elements.loadMoreButton.hidden = true;
      this.#setStatus(matchingFavorites.length === 0
        ? 'Aucun favori pour l’instant. Cliquez sur ☆ pour en ajouter.'
        : `${matchingFavorites.length} favori(s).`);
    }

    async #fetchPage({ isFirstPage }) {
      // Une recherche plus récente annule la précédente pour éviter qu'une réponse
      // lente n'écrase des résultats plus récents.
      this.#searchAbortController?.abort();
      const abortController = new AbortController();
      this.#searchAbortController = abortController;

      this.#elements.loadMoreButton.disabled = true;
      this.#setStatus('Chargement…');

      try {
        const { plays, totalCount } = await searchPlays({
          category: this.#state.category,
          searchText: this.#state.searchText,
          sort: this.#state.sort,
          page: this.#state.page,
          signal: abortController.signal,
        });

        if (isFirstPage) {
          this.#resultsView.replace(plays);
        } else {
          this.#resultsView.append(plays);
        }
        this.#state.totalCount = totalCount;
        this.#state.loadedCount += plays.length;
        this.#renderPaginationState();
      } catch (searchError) {
        if (isAbortError(searchError)) {
          return;
        }
        console.error(searchError);
        if (!isFirstPage) {
          this.#state.page -= 1;
        }
        this.#setStatus('Impossible de joindre Internet Archive. Vérifiez votre connexion et réessayez.');
      } finally {
        if (this.#searchAbortController === abortController) {
          this.#elements.loadMoreButton.disabled = false;
          this.#searchAbortController = null;
        }
      }
    }

    #renderPaginationState() {
      const { loadedCount, totalCount } = this.#state;
      this.#elements.loadMoreButton.hidden = loadedCount >= totalCount;
      this.#setStatus(totalCount === 0
        ? 'Aucune pièce trouvée. Essayez un autre mot-clé ou une autre catégorie.'
        : `${loadedCount} sur ${totalCount} résultat(s).`);
    }

    #setStatus(message) {
      this.#elements.statusMessage.textContent = message;
    }
  }

  function queryRequiredElement(selector) {
    const element = document.querySelector(selector);
    if (element === null) {
      throw new Error(`Élément introuvable : ${selector}`);
    }
    return element;
  }

  const rideauApp = new RideauApp({
    searchInput: queryRequiredElement('#search-input'),
    categoryTabs: queryRequiredElement('#category-tabs'),
    sortSelect: queryRequiredElement('#sort-select'),
    favoritesCheckbox: queryRequiredElement('#favorites-only'),
    statusMessage: queryRequiredElement('#status-message'),
    resultsGrid: queryRequiredElement('#results-grid'),
    loadMoreButton: queryRequiredElement('#load-more'),
    externalLinksList: queryRequiredElement('#external-links-list'),
    playerDialog: queryRequiredElement('#player-dialog'),
    cardTemplate: queryRequiredElement('#card-template'),
  });

  rideauApp.start();
  // Une page mise en cache (bfcache) peut être restaurée : on ne la détruit que si elle part vraiment.
  window.addEventListener('pagehide', (pageHideEvent) => {
    if (!pageHideEvent.persisted) {
      rideauApp.destroy();
    }
  });
})();
