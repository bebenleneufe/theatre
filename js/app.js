// Script classique (et non module ES) pour que la page s'ouvre par simple
// double-clic : les navigateurs bloquent les modules chargés depuis file://.
(() => {
  'use strict';

  // --- config ---
  const SEARCH_DEBOUNCE_MS = 400;
  const PROGRESS_SAVE_INTERVAL_MS = 5000;
  const WATCHED_COMPLETION_RATIO = 0.95;
  const MINIMUM_RESUME_SECONDS = 60;
  const BLOB_URL_REVOKE_DELAY_MS = 1000;
  const CURATED_PLAYS_EVENT = 'rideau:curated-plays';

  // Pour une vidéo supprimée ou privée, YouTube sert une vignette de remplacement
  // de 120 px de large à la place de la vraie (480 px) : c'est notre seul indice
  // côté navigateur, l'API oEmbed ne répondant pas aux requêtes cross-origin.
  const REMOVED_VIDEO_THUMBNAIL_WIDTH = 120;

  const LIST_MODES = {
    all: 'all',
    favorites: 'favorites',
    watchLater: 'watchLater',
  };

  const DURATION_FILTERS = {
    all: () => true,
    short: (durationSeconds) => durationSeconds > 0 && durationSeconds < 90 * 60,
    medium: (durationSeconds) => durationSeconds >= 90 * 60 && durationSeconds <= 150 * 60,
    long: (durationSeconds) => durationSeconds > 150 * 60,
  };

  const SOURCE_FILTERS = {
    all: () => true,
    official: (play) => play.isUnofficial !== true,
    unofficial: (play) => play.isUnofficial === true,
  };

  const DEFAULT_CURATED_FILTERS = Object.freeze({ language: 'all', duration: 'all', genre: 'all', source: 'all' });

  const LANGUAGE_LABELS = { fr: 'Français', en: 'Anglais', autre: 'Autre langue ou sans paroles' };
  const GENRE_LABELS = { comedie: 'Comédie', classique: 'Classique', contemporain: 'Contemporain' };
  const LIST_MODE_TITLES = { all: 'Toutes les pièces', favorites: 'Mes favoris', watchLater: 'À voir plus tard' };

  const SKELETON_CARD_COUNT = 8;
  const TOAST_DURATION_MS = 5000;
  const RESUME_SHELF_LIMIT = 12;

  const EXTERNAL_LINKS = [
    {
      label: 'France.tv — Théâtre et danse',
      description: 'Captations récentes, disponibles en replay pour une durée limitée.',
      url: 'https://www.france.tv/spectacles-et-culture/theatre-et-danse/',
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

  function throttle(callback, intervalMs) {
    let lastCallTime = 0;
    let trailingTimeoutId = null;

    const throttled = (...callArguments) => {
      const elapsedMs = Date.now() - lastCallTime;
      clearTimeout(trailingTimeoutId);
      if (elapsedMs >= intervalMs) {
        lastCallTime = Date.now();
        callback(...callArguments);
        return;
      }
      trailingTimeoutId = setTimeout(() => {
        lastCallTime = Date.now();
        callback(...callArguments);
      }, intervalMs - elapsedMs);
    };

    throttled.cancel = () => {
      clearTimeout(trailingTimeoutId);
      trailingTimeoutId = null;
    };

    return throttled;
  }

  function parseDurationToSeconds(rawDuration) {
    const durationText = String(rawDuration ?? '').trim();
    if (durationText === '') {
      return 0;
    }
    const seconds = durationText
      .split(':')
      .reduce((totalSeconds, durationPart) => totalSeconds * 60 + Number(durationPart), 0);
    return Number.isFinite(seconds) ? seconds : 0;
  }

  function formatDuration(totalSeconds) {
    const totalMinutes = Math.round(totalSeconds / 60);
    if (totalMinutes < 60) {
      return `${totalMinutes} min`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = String(totalMinutes % 60).padStart(2, '0');
    return `${hours} h ${minutes}`;
  }

  function pickRandomItem(items) {
    return items.length === 0 ? undefined : items[Math.floor(Math.random() * items.length)];
  }

  function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function isPlainObject(candidate) {
    return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
  }

  function pluralize(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  // --- playSources ---
  const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
  const YOUTUBE_ID_PATTERN = /^[\w-]{11}$/;

  function thumbnailUrl(play) {
    return `https://i.ytimg.com/vi/${encodeURIComponent(play.youtubeId)}/hqdefault.jpg`;
  }

  function embedUrl(play, startSeconds) {
    const playerParameters = new URLSearchParams({
      enablejsapi: '1',
      autoplay: '1',
      start: String(Math.floor(startSeconds)),
    });
    return `${YOUTUBE_EMBED_ORIGIN}/embed/${encodeURIComponent(play.youtubeId)}?${playerParameters}`;
  }

  function watchUrl(play) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(play.youtubeId)}`;
  }

  // Le lecteur YouTube diffuse sa position par postMessage (protocole de l'IFrame API).
  // On l'écoute directement plutôt que de charger le script officiel, qui exige
  // de déclarer une fonction globale window.onYouTubeIframeAPIReady.
  function parsePlayerPosition(messageData) {
    try {
      const playerMessage = typeof messageData === 'string' ? JSON.parse(messageData) : messageData;
      const playerInfo = playerMessage?.info;
      if (playerMessage?.event !== 'infoDelivery' || typeof playerInfo?.currentTime !== 'number') {
        return null;
      }
      const durationSeconds = Number(playerInfo.duration);
      return durationSeconds > 0 ? { seconds: playerInfo.currentTime, durationSeconds } : null;
    } catch {
      return null;
    }
  }

  // --- curatedPlays ---
  function toCuratedPlay({ duration, ...rawPlay }) {
    return {
      ...rawPlay,
      identifier: `youtube:${rawPlay.youtubeId}`,
      durationSeconds: parseDurationToSeconds(duration),
    };
  }

  const LOCAL_SORTERS = {
    'date desc': (first, second) => (second.year || '0').localeCompare(first.year || '0'),
    'date asc': (first, second) => (first.year || '9999').localeCompare(second.year || '9999'),
    'titleSorter asc': (first, second) => first.title.localeCompare(second.title, 'fr'),
  };

  function matchesSearchText(play, searchText) {
    const normalizedSearch = searchText.trim().toLocaleLowerCase('fr');
    return `${play.title} ${play.creator}`.toLocaleLowerCase('fr').includes(normalizedSearch);
  }

  function matchesCuratedFilters(play, filters) {
    return (filters.language === 'all' || play.language === filters.language)
      && (filters.genre === 'all' || play.genre === filters.genre)
      && DURATION_FILTERS[filters.duration](play.durationSeconds)
      && SOURCE_FILTERS[filters.source](play);
  }

  function sortLocally(plays, sort) {
    const sorter = LOCAL_SORTERS[sort];
    return sorter === undefined ? [...plays] : [...plays].sort(sorter);
  }

  // --- personalLibrary ---
  const STORAGE_KEY = 'rideau.library.v1';
  const EXPORT_FORMAT = 'rideau-sauvegarde';
  const EXPORT_VERSION = 1;
  const LIBRARY_SECTIONS = ['favorites', 'watchLater', 'watched', 'hidden', 'progress'];

  function createEmptyLibrary() {
    return Object.fromEntries(LIBRARY_SECTIONS.map((section) => [section, {}]));
  }

  // Les fiches gardées (favoris, à voir plus tard) peuvent venir d'un fichier importé :
  // on ne conserve que des champs connus et typés avant qu'ils atteignent le DOM ou une URL.
  // Les fiches sans vidéo YouTube (anciens onglets Internet Archive, supprimés) sont écartées.
  function sanitizeSavedPlay(rawPlay) {
    if (!isPlainObject(rawPlay)
      || typeof rawPlay.title !== 'string'
      || typeof rawPlay.youtubeId !== 'string'
      || !YOUTUBE_ID_PATTERN.test(rawPlay.youtubeId)) {
      return null;
    }
    const savedPlay = {
      identifier: `youtube:${rawPlay.youtubeId}`,
      youtubeId: rawPlay.youtubeId,
      title: rawPlay.title,
      creator: typeof rawPlay.creator === 'string' ? rawPlay.creator : '',
      year: typeof rawPlay.year === 'string' ? rawPlay.year : '',
      savedAt: Number.isFinite(rawPlay.savedAt) ? rawPlay.savedAt : Date.now(),
    };
    if (rawPlay.isUnofficial === true) {
      savedPlay.isUnofficial = true;
    }
    if (Number.isFinite(rawPlay.durationSeconds)) {
      savedPlay.durationSeconds = rawPlay.durationSeconds;
    }
    if (typeof rawPlay.summary === 'string') {
      savedPlay.summary = rawPlay.summary;
    }
    if (Object.hasOwn(LANGUAGE_LABELS, rawPlay.language)) {
      savedPlay.language = rawPlay.language;
    }
    if (Object.hasOwn(GENRE_LABELS, rawPlay.genre)) {
      savedPlay.genre = rawPlay.genre;
    }
    return savedPlay;
  }

  function sanitizeProgress(rawProgress) {
    if (!isPlainObject(rawProgress)
      || !Number.isFinite(rawProgress.seconds)
      || !Number.isFinite(rawProgress.durationSeconds)
      || rawProgress.durationSeconds <= 0) {
      return null;
    }
    return {
      seconds: rawProgress.seconds,
      durationSeconds: rawProgress.durationSeconds,
      updatedAt: Number.isFinite(rawProgress.updatedAt) ? rawProgress.updatedAt : 0,
    };
  }

  function sanitizeTimestampMap(rawMap) {
    return Object.fromEntries(Object.entries(isPlainObject(rawMap) ? rawMap : {})
      .filter(([, timestamp]) => Number.isFinite(timestamp)));
  }

  function sanitizeEntryMap(rawMap, sanitizeEntry) {
    return Object.fromEntries(Object.entries(isPlainObject(rawMap) ? rawMap : {})
      .map(([identifier, rawEntry]) => [identifier, sanitizeEntry(rawEntry)])
      .filter(([, entry]) => entry !== null));
  }

  function sanitizeLibrary(rawLibrary) {
    const sourceLibrary = isPlainObject(rawLibrary) ? rawLibrary : {};
    return {
      favorites: sanitizeEntryMap(sourceLibrary.favorites, sanitizeSavedPlay),
      watchLater: sanitizeEntryMap(sourceLibrary.watchLater, sanitizeSavedPlay),
      watched: sanitizeTimestampMap(sourceLibrary.watched),
      hidden: sanitizeTimestampMap(sourceLibrary.hidden),
      progress: sanitizeEntryMap(sourceLibrary.progress, sanitizeProgress),
    };
  }

  function readStoredLibrary() {
    try {
      const storedJson = localStorage.getItem(STORAGE_KEY);
      return storedJson === null ? createEmptyLibrary() : sanitizeLibrary(JSON.parse(storedJson));
    } catch (storageError) {
      console.warn('Bibliothèque locale illisible, elle repart de zéro.', storageError);
      return createEmptyLibrary();
    }
  }

  class PersonalLibrary {
    #library = readStoredLibrary();

    isFavorite(identifier) {
      return Object.hasOwn(this.#library.favorites, identifier);
    }

    isInWatchLater(identifier) {
      return Object.hasOwn(this.#library.watchLater, identifier);
    }

    isWatched(identifier) {
      return Object.hasOwn(this.#library.watched, identifier);
    }

    isHidden(identifier) {
      return Object.hasOwn(this.#library.hidden, identifier);
    }

    toggleFavorite(play) {
      return this.#toggleSavedPlay('favorites', play);
    }

    toggleWatchLater(play) {
      return this.#toggleSavedPlay('watchLater', play);
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

    markWatched(identifier) {
      if (!this.isWatched(identifier)) {
        this.#library.watched[identifier] = Date.now();
        this.#persist();
      }
    }

    hide(identifier) {
      this.#library.hidden[identifier] = Date.now();
      this.#persist();
    }

    unhide(identifier) {
      if (Object.hasOwn(this.#library.hidden, identifier)) {
        delete this.#library.hidden[identifier];
        this.#persist();
      }
    }

    unhideAll() {
      this.#library.hidden = {};
      this.#persist();
    }

    getProgress(identifier) {
      return this.#library.progress[identifier] ?? null;
    }

    saveProgress(identifier, { seconds, durationSeconds }) {
      this.#library.progress[identifier] = { seconds, durationSeconds, updatedAt: Date.now() };
      this.#persist();
    }

    clearProgress(identifier) {
      if (Object.hasOwn(this.#library.progress, identifier)) {
        delete this.#library.progress[identifier];
        this.#persist();
      }
    }

    listInProgress() {
      return Object.entries(this.#library.progress)
        .map(([identifier, progress]) => ({ identifier, progress }))
        .sort((first, second) => second.progress.updatedAt - first.progress.updatedAt);
    }

    findSavedPlay(identifier) {
      return this.#library.favorites[identifier] ?? this.#library.watchLater[identifier] ?? null;
    }

    listFavorites() {
      return this.#listSavedPlays('favorites');
    }

    listWatchLater() {
      return this.#listSavedPlays('watchLater');
    }

    countEntries() {
      return Object.fromEntries(LIBRARY_SECTIONS.map((section) => [section, Object.keys(this.#library[section]).length]));
    }

    exportSnapshot() {
      return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        library: structuredClone(this.#library),
      };
    }

    // Fusion plutôt que remplacement : importer la sauvegarde du téléphone sur
    // l'ordinateur ne doit pas effacer ce qui n'existe que sur l'ordinateur.
    importSnapshot(snapshot) {
      if (!isPlainObject(snapshot) || snapshot.format !== EXPORT_FORMAT) {
        throw new Error('Format de sauvegarde inconnu');
      }
      const importedLibrary = sanitizeLibrary(snapshot.library);
      ['favorites', 'watchLater', 'watched', 'hidden'].forEach((section) => {
        this.#library[section] = { ...importedLibrary[section], ...this.#library[section] };
      });
      Object.entries(importedLibrary.progress).forEach(([identifier, importedProgress]) => {
        const currentProgress = this.#library.progress[identifier];
        if (currentProgress === undefined || importedProgress.updatedAt > currentProgress.updatedAt) {
          this.#library.progress[identifier] = importedProgress;
        }
      });
      this.#persist();
      return Object.fromEntries(LIBRARY_SECTIONS.map((section) => [section, Object.keys(importedLibrary[section]).length]));
    }

    #toggleSavedPlay(section, play) {
      if (Object.hasOwn(this.#library[section], play.identifier)) {
        delete this.#library[section][play.identifier];
      } else {
        const savedPlay = sanitizeSavedPlay({ ...play, savedAt: Date.now() });
        if (savedPlay !== null) {
          this.#library[section][play.identifier] = savedPlay;
        }
      }
      this.#persist();
      return Object.hasOwn(this.#library[section], play.identifier);
    }

    #listSavedPlays(section) {
      return Object.values(this.#library[section]).sort((first, second) => second.savedAt - first.savedAt);
    }

    #persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#library));
      } catch (storageError) {
        console.warn('Impossible d’enregistrer la bibliothèque locale.', storageError);
      }
    }
  }

  // --- preferences ---
  const PREFERENCES_KEY = 'rideau.preferences.v1';

  // Réglages d'affichage retrouvés d'une visite à l'autre ; toute valeur inconnue
  // (ancienne version, catégorie supprimée) retombe sur la valeur par défaut.
  class Preferences {
    read() {
      try {
        const storedPreferences = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}');
        return isPlainObject(storedPreferences) ? storedPreferences : {};
      } catch (storageError) {
        console.warn('Préférences illisibles, valeurs par défaut utilisées.', storageError);
        return {};
      }
    }

    save(preferences) {
      try {
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
      } catch (storageError) {
        console.warn('Impossible d’enregistrer les préférences.', storageError);
      }
    }
  }

  // --- toast ---
  class Toast {
    #toastElement;
    #messageElement;
    #actionButton;
    #hideTimeoutId = null;
    #onAction = null;
    #handleActionClick = () => {
      const actionCallback = this.#onAction;
      this.hide();
      actionCallback?.();
    };

    constructor(toastElement) {
      this.#toastElement = toastElement;
      this.#messageElement = toastElement.querySelector('.toast-message');
      this.#actionButton = toastElement.querySelector('.toast-action');
      this.#actionButton.addEventListener('click', this.#handleActionClick);
    }

    show(message, { actionLabel = '', onAction = null } = {}) {
      clearTimeout(this.#hideTimeoutId);
      this.#messageElement.textContent = message;
      this.#onAction = onAction;
      this.#actionButton.textContent = actionLabel;
      this.#actionButton.hidden = onAction === null;
      this.#toastElement.hidden = false;
      this.#hideTimeoutId = setTimeout(() => this.hide(), TOAST_DURATION_MS);
    }

    hide() {
      clearTimeout(this.#hideTimeoutId);
      this.#hideTimeoutId = null;
      this.#onAction = null;
      this.#toastElement.hidden = true;
    }

    destroy() {
      this.hide();
      this.#actionButton.removeEventListener('click', this.#handleActionClick);
    }
  }

  // --- videoAvailability ---
  class VideoAvailability {
    #unavailableIdentifiers = new Set();

    markUnavailable(identifier) {
      this.#unavailableIdentifiers.add(identifier);
    }

    isUnavailable(identifier) {
      return this.#unavailableIdentifiers.has(identifier);
    }
  }

  // --- resultsView ---
  class ResultsView {
    #gridElement;
    #cardTemplate;
    #library;
    #availability;
    #onOpenPlay;
    #onPlayHidden;
    #onPersonalToggle;
    #playsByIdentifier = new Map();
    #cardsByIdentifier = new Map();
    #lastRemoval = null;
    #handleGridClick = (clickEvent) => this.#onGridClick(clickEvent);
    #handleThumbnailSettled = (settledEvent) => this.#onThumbnailSettled(settledEvent);

    constructor({ gridElement, cardTemplate, library, availability, onOpenPlay, onPlayHidden, onPersonalToggle }) {
      this.#gridElement = gridElement;
      this.#cardTemplate = cardTemplate;
      this.#library = library;
      this.#availability = availability;
      this.#onOpenPlay = onOpenPlay;
      this.#onPlayHidden = onPlayHidden;
      this.#onPersonalToggle = onPersonalToggle;
      this.#gridElement.addEventListener('click', this.#handleGridClick);
      // load/error ne remontent pas : la phase de capture permet un seul écouteur pour toutes les vignettes.
      this.#gridElement.addEventListener('load', this.#handleThumbnailSettled, true);
      this.#gridElement.addEventListener('error', this.#handleThumbnailSettled, true);
    }

    replace(plays) {
      this.#playsByIdentifier.clear();
      this.#cardsByIdentifier.clear();
      this.#lastRemoval = null;
      this.#gridElement.setAttribute('aria-busy', 'false');
      this.#gridElement.replaceChildren(this.#buildCards(plays));
    }

    showSkeleton() {
      this.#playsByIdentifier.clear();
      this.#cardsByIdentifier.clear();
      const fragment = document.createDocumentFragment();
      for (let skeletonIndex = 0; skeletonIndex < SKELETON_CARD_COUNT; skeletonIndex += 1) {
        fragment.append(this.#buildSkeletonCard());
      }
      this.#gridElement.setAttribute('aria-busy', 'true');
      this.#gridElement.replaceChildren(fragment);
    }

    listDisplayedPlays() {
      return [...this.#playsByIdentifier.values()];
    }

    refreshCard(identifier) {
      const cardElement = this.#cardsByIdentifier.get(identifier);
      if (cardElement !== undefined) {
        this.#applyPersonalState(cardElement, identifier);
      }
    }

    removeCard(identifier) {
      const cardElement = this.#cardsByIdentifier.get(identifier);
      const play = this.#playsByIdentifier.get(identifier);
      if (cardElement === undefined || play === undefined) {
        return;
      }
      this.#lastRemoval = { play, cardElement, nextSibling: cardElement.nextElementSibling };
      cardElement.remove();
      this.#cardsByIdentifier.delete(identifier);
      this.#playsByIdentifier.delete(identifier);
    }

    // Annulation d'un masquage : on remet la carte à sa place exacte plutôt que de
    // relancer la recherche, qui ferait perdre les pages déjà chargées.
    restoreLastRemoved() {
      if (this.#lastRemoval === null) {
        return;
      }
      const { play, cardElement, nextSibling } = this.#lastRemoval;
      this.#gridElement.insertBefore(cardElement, nextSibling?.isConnected === true ? nextSibling : null);
      this.#playsByIdentifier.set(play.identifier, play);
      this.#cardsByIdentifier.set(play.identifier, cardElement);
      this.#applyPersonalState(cardElement, play.identifier);
      this.#lastRemoval = null;
    }

    destroy() {
      this.#gridElement.removeEventListener('click', this.#handleGridClick);
      this.#gridElement.removeEventListener('load', this.#handleThumbnailSettled, true);
      this.#gridElement.removeEventListener('error', this.#handleThumbnailSettled, true);
      this.#playsByIdentifier.clear();
      this.#cardsByIdentifier.clear();
      this.#lastRemoval = null;
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

    #buildSkeletonCard() {
      const skeletonCard = document.createElement('li');
      skeletonCard.className = 'card card-skeleton';
      skeletonCard.setAttribute('aria-hidden', 'true');
      const poster = document.createElement('span');
      poster.className = 'card-poster';
      const titleLine = document.createElement('span');
      titleLine.className = 'skeleton-line';
      const metaLine = document.createElement('span');
      metaLine.className = 'skeleton-line skeleton-line-short';
      skeletonCard.append(poster, titleLine, metaLine);
      return skeletonCard;
    }

    #buildCard(play) {
      const cardElement = this.#cardTemplate.content.firstElementChild.cloneNode(true);
      cardElement.dataset.identifier = play.identifier;

      cardElement.querySelector('.card-thumbnail').src = thumbnailUrl(play);
      this.#applyBadge(cardElement.querySelector('.card-badge'), play);
      cardElement.querySelector('.card-title').textContent = play.title;
      cardElement.querySelector('.card-meta').textContent = [play.creator, play.year]
        .filter((metaPart) => metaPart !== '')
        .join(' · ');
      cardElement.querySelector('.card-open').setAttribute('aria-label', `${play.title} : voir le résumé`);
      if (play.durationSeconds > 0) {
        const durationBadge = cardElement.querySelector('.card-duration');
        durationBadge.textContent = formatDuration(play.durationSeconds);
        durationBadge.hidden = false;
      }

      this.#applyPersonalState(cardElement, play.identifier);
      this.#applyAvailability(cardElement, play.identifier);
      this.#cardsByIdentifier.set(play.identifier, cardElement);
      return cardElement;
    }

    #applyBadge(badgeElement, play) {
      badgeElement.hidden = play.isUnofficial !== true;
      badgeElement.textContent = 'Non officielle';
      badgeElement.classList.add('card-badge-unofficial');
    }

    #applyPersonalState(cardElement, identifier) {
      const isFavorite = this.#library.isFavorite(identifier);
      const favoriteButton = cardElement.querySelector('.card-favorite');
      favoriteButton.setAttribute('aria-pressed', String(isFavorite));
      favoriteButton.setAttribute('aria-label', isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris');
      favoriteButton.title = favoriteButton.getAttribute('aria-label');

      const isInWatchLater = this.#library.isInWatchLater(identifier);
      const watchLaterButton = cardElement.querySelector('.card-watch-later');
      watchLaterButton.setAttribute('aria-pressed', String(isInWatchLater));
      watchLaterButton.setAttribute('aria-label', isInWatchLater ? 'Retirer de « À voir plus tard »' : 'Ajouter à « À voir plus tard »');
      watchLaterButton.title = watchLaterButton.getAttribute('aria-label');

      cardElement.querySelector('.card-watched-badge').hidden = !this.#library.isWatched(identifier);

      const progress = this.#library.getProgress(identifier);
      const progressElement = cardElement.querySelector('.card-progress');
      progressElement.hidden = progress === null;
      if (progress !== null) {
        progressElement.querySelector('.card-progress-bar').style.width = `${computeProgressPercent(progress)}%`;
      }
    }

    #applyAvailability(cardElement, identifier) {
      const isUnavailable = this.#availability.isUnavailable(identifier);
      cardElement.classList.toggle('is-unavailable', isUnavailable);
      cardElement.querySelector('.card-unavailable').hidden = !isUnavailable;
    }

    #onThumbnailSettled(settledEvent) {
      const thumbnail = settledEvent.target;
      if (!(thumbnail instanceof HTMLImageElement) || !thumbnail.classList.contains('card-thumbnail')) {
        return;
      }
      const cardElement = thumbnail.closest('.card');
      const play = this.#playsByIdentifier.get(cardElement?.dataset.identifier);
      if (play === undefined) {
        return;
      }
      const isRemovedVideo = settledEvent.type === 'error' || thumbnail.naturalWidth === REMOVED_VIDEO_THUMBNAIL_WIDTH;
      if (isRemovedVideo) {
        this.#availability.markUnavailable(play.identifier);
        this.#applyAvailability(cardElement, play.identifier);
      }
    }

    #onGridClick(clickEvent) {
      const actionElement = clickEvent.target.closest('[data-action]');
      const cardElement = actionElement?.closest('.card');
      const play = this.#playsByIdentifier.get(cardElement?.dataset.identifier);
      if (play === undefined) {
        return;
      }

      switch (actionElement.dataset.action) {
        case 'open':
          this.#onOpenPlay(play);
          break;
        case 'favorite':
          this.#onPersonalToggle(play, 'favorite', this.#library.toggleFavorite(play));
          this.#applyPersonalState(cardElement, play.identifier);
          break;
        case 'watch-later':
          this.#onPersonalToggle(play, 'watchLater', this.#library.toggleWatchLater(play));
          this.#applyPersonalState(cardElement, play.identifier);
          break;
        case 'hide':
          this.#library.hide(play.identifier);
          this.removeCard(play.identifier);
          this.#onPlayHidden(play);
          break;
        default:
          break;
      }
    }
  }

  function computeProgressPercent(progress) {
    return Math.min(100, Math.round((progress.seconds / progress.durationSeconds) * 100));
  }

  // --- resumeShelf ---
  class ResumeShelf {
    #sectionElement;
    #listElement;
    #itemTemplate;
    #onOpenPlay;
    #playsByIdentifier = new Map();
    #handleListClick = (clickEvent) => {
      const itemElement = clickEvent.target.closest('.shelf-item');
      const play = this.#playsByIdentifier.get(itemElement?.dataset.identifier);
      if (play !== undefined) {
        this.#onOpenPlay(play);
      }
    };

    constructor({ sectionElement, listElement, itemTemplate, onOpenPlay }) {
      this.#sectionElement = sectionElement;
      this.#listElement = listElement;
      this.#itemTemplate = itemTemplate;
      this.#onOpenPlay = onOpenPlay;
      this.#listElement.addEventListener('click', this.#handleListClick);
    }

    render(entries, { isVisible }) {
      this.#playsByIdentifier.clear();
      this.#sectionElement.hidden = !isVisible || entries.length === 0;
      if (this.#sectionElement.hidden) {
        this.#listElement.replaceChildren();
        return;
      }
      const fragment = document.createDocumentFragment();
      entries.forEach(({ play, progress }) => {
        this.#playsByIdentifier.set(play.identifier, play);
        fragment.append(this.#buildItem(play, progress));
      });
      this.#listElement.replaceChildren(fragment);
    }

    destroy() {
      this.#listElement.removeEventListener('click', this.#handleListClick);
      this.#playsByIdentifier.clear();
    }

    #buildItem(play, progress) {
      const itemElement = this.#itemTemplate.content.firstElementChild.cloneNode(true);
      itemElement.dataset.identifier = play.identifier;
      itemElement.querySelector('.shelf-thumbnail').src = thumbnailUrl(play);
      itemElement.querySelector('.shelf-title').textContent = play.title;
      const remainingSeconds = Math.max(0, progress.durationSeconds - progress.seconds);
      itemElement.querySelector('.shelf-meta').textContent = `Encore ${formatDuration(remainingSeconds)}`;
      itemElement.querySelector('.card-progress-bar').style.width = `${computeProgressPercent(progress)}%`;
      itemElement.querySelector('.shelf-open').setAttribute('aria-label', `Reprendre « ${play.title} »`);
      return itemElement;
    }
  }

  // --- playerDialog ---
  class PlayerDialog {
    #dialogElement;
    #creatorElement;
    #titleElement;
    #tagListElement;
    #summaryElement;
    #frameWrapper;
    #sourceLink;
    #favoriteButton;
    #watchLaterButton;
    #watchedButton;
    #closeButton;
    #library;
    #availability;
    #onPersonalStateChange;
    #currentPlay = null;
    #playerFrame = null;
    #lastPosition = null;

    #throttledProgressSave = throttle(() => this.#saveProgress(), PROGRESS_SAVE_INTERVAL_MS);
    #handleCloseClick = () => this.#dialogElement.close();
    #handleFavoriteClick = () => this.#togglePersonalState((play) => this.#library.toggleFavorite(play));
    #handleWatchLaterClick = () => this.#togglePersonalState((play) => this.#library.toggleWatchLater(play));
    #handleWatchedClick = () => this.#togglePersonalState((play) => this.#library.toggleWatched(play.identifier));
    #handleLaunchClick = (clickEvent) => {
      const launchButton = clickEvent.target.closest('[data-start-seconds]');
      if (launchButton !== null) {
        this.#launchPlayer(Number(launchButton.dataset.startSeconds));
      }
    };
    #handleFrameLoad = () => {
      this.#playerFrame?.contentWindow?.postMessage(
        JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
        YOUTUBE_EMBED_ORIGIN,
      );
    };
    #handlePlayerMessage = (messageEvent) => {
      if (messageEvent.origin !== YOUTUBE_EMBED_ORIGIN || messageEvent.source !== this.#playerFrame?.contentWindow) {
        return;
      }
      const position = parsePlayerPosition(messageEvent.data);
      if (position !== null) {
        this.#lastPosition = position;
        this.#throttledProgressSave();
      }
    };
    #handleDialogClose = () => this.#unloadPlayer();
    #handleBackdropClick = (clickEvent) => {
      if (clickEvent.target === this.#dialogElement) {
        this.#dialogElement.close();
      }
    };

    constructor({ dialogElement, library, availability, onPersonalStateChange }) {
      this.#dialogElement = dialogElement;
      this.#creatorElement = dialogElement.querySelector('#player-creator');
      this.#titleElement = dialogElement.querySelector('#player-title');
      this.#tagListElement = dialogElement.querySelector('#player-tags');
      this.#summaryElement = dialogElement.querySelector('#player-summary');
      this.#frameWrapper = dialogElement.querySelector('#player-frame-wrapper');
      this.#sourceLink = dialogElement.querySelector('#player-source-link');
      this.#favoriteButton = dialogElement.querySelector('#player-favorite');
      this.#watchLaterButton = dialogElement.querySelector('#player-watch-later');
      this.#watchedButton = dialogElement.querySelector('#player-watched');
      this.#closeButton = dialogElement.querySelector('#player-close');
      this.#library = library;
      this.#availability = availability;
      this.#onPersonalStateChange = onPersonalStateChange;

      this.#closeButton.addEventListener('click', this.#handleCloseClick);
      this.#favoriteButton.addEventListener('click', this.#handleFavoriteClick);
      this.#watchLaterButton.addEventListener('click', this.#handleWatchLaterClick);
      this.#watchedButton.addEventListener('click', this.#handleWatchedClick);
      this.#frameWrapper.addEventListener('click', this.#handleLaunchClick);
      this.#dialogElement.addEventListener('close', this.#handleDialogClose);
      this.#dialogElement.addEventListener('click', this.#handleBackdropClick);
    }

    open(play) {
      this.#unloadPlayer();
      this.#currentPlay = play;
      this.#creatorElement.textContent = play.creator ?? '';
      this.#titleElement.textContent = play.title;
      this.#sourceLink.href = watchUrl(play);
      this.#renderPersonalButtons();
      this.#renderTags(play);
      this.#summaryElement.textContent = play.summary || 'Pas de résumé pour cette captation.';
      this.#frameWrapper.replaceChildren(this.#buildPoster(play));

      if (!this.#dialogElement.open) {
        this.#dialogElement.showModal();
      }
      this.#frameWrapper.querySelector('.player-launch')?.focus();
    }

    destroy() {
      this.#closeButton.removeEventListener('click', this.#handleCloseClick);
      this.#favoriteButton.removeEventListener('click', this.#handleFavoriteClick);
      this.#watchLaterButton.removeEventListener('click', this.#handleWatchLaterClick);
      this.#watchedButton.removeEventListener('click', this.#handleWatchedClick);
      this.#frameWrapper.removeEventListener('click', this.#handleLaunchClick);
      this.#dialogElement.removeEventListener('close', this.#handleDialogClose);
      this.#dialogElement.removeEventListener('click', this.#handleBackdropClick);
      this.#unloadPlayer();
    }

    #renderTags(play) {
      const tagLabels = [
        play.year ?? '',
        play.durationSeconds > 0 ? formatDuration(play.durationSeconds) : '',
        GENRE_LABELS[play.genre] ?? '',
        LANGUAGE_LABELS[play.language] ?? '',
      ].filter((tagLabel) => tagLabel !== '');

      const fragment = document.createDocumentFragment();
      tagLabels.forEach((tagLabel) => fragment.append(this.#buildTag(tagLabel, 'tag')));
      if (play.isUnofficial === true) {
        fragment.append(this.#buildTag('Mise en ligne non officielle, peut disparaître', 'tag tag-warning'));
      }
      this.#tagListElement.replaceChildren(fragment);
    }

    #buildTag(label, className) {
      const tagElement = document.createElement('li');
      tagElement.className = className;
      tagElement.textContent = label;
      return tagElement;
    }

    #buildPoster(play) {
      const posterWrapper = document.createElement('div');
      posterWrapper.className = 'player-poster-wrapper';

      const posterImage = document.createElement('img');
      posterImage.className = 'player-poster';
      posterImage.src = thumbnailUrl(play);
      posterImage.alt = '';

      const launchActions = document.createElement('div');
      launchActions.className = 'player-launch-actions';

      if (this.#availability.isUnavailable(play.identifier)) {
        const unavailableNotice = document.createElement('p');
        unavailableNotice.className = 'player-unavailable';
        unavailableNotice.textContent = 'Cette vidéo a été retirée de YouTube.';
        launchActions.append(unavailableNotice);
      } else {
        launchActions.append(...this.#buildLaunchButtons(play));
      }

      posterWrapper.append(posterImage, launchActions);
      return posterWrapper;
    }

    #buildLaunchButtons(play) {
      const progress = this.#library.getProgress(play.identifier);
      if (progress === null || progress.seconds < MINIMUM_RESUME_SECONDS) {
        return [this.#buildLaunchButton('▶ Lancer la pièce', 0, 'player-launch')];
      }
      return [
        this.#buildLaunchButton(`▶ Reprendre à ${formatDuration(progress.seconds)}`, progress.seconds, 'player-launch'),
        this.#buildLaunchButton('Recommencer au début', 0, 'player-launch player-launch-secondary'),
      ];
    }

    #buildLaunchButton(label, startSeconds, className) {
      const launchButton = document.createElement('button');
      launchButton.type = 'button';
      launchButton.className = className;
      launchButton.dataset.startSeconds = String(Math.floor(startSeconds));
      launchButton.textContent = label;
      return launchButton;
    }

    #launchPlayer(startSeconds) {
      if (this.#currentPlay === null) {
        return;
      }
      const playerFrame = document.createElement('iframe');
      playerFrame.src = embedUrl(this.#currentPlay, startSeconds);
      playerFrame.title = `Lecteur : ${this.#currentPlay.title}`;
      playerFrame.allow = 'fullscreen; autoplay; encrypted-media; picture-in-picture';
      // YouTube refuse de lire une vidéo intégrée sans en-tête Referer (erreur 153).
      playerFrame.referrerPolicy = 'strict-origin-when-cross-origin';
      playerFrame.className = 'player-frame';

      this.#playerFrame = playerFrame;
      playerFrame.addEventListener('load', this.#handleFrameLoad);
      window.addEventListener('message', this.#handlePlayerMessage);
      this.#frameWrapper.replaceChildren(playerFrame);
    }

    #saveProgress() {
      if (this.#currentPlay === null || this.#lastPosition === null) {
        return;
      }
      const { identifier } = this.#currentPlay;
      const { seconds, durationSeconds } = this.#lastPosition;
      if (seconds / durationSeconds >= WATCHED_COMPLETION_RATIO) {
        this.#library.markWatched(identifier);
        this.#library.clearProgress(identifier);
        this.#renderPersonalButtons();
      } else if (seconds >= MINIMUM_RESUME_SECONDS) {
        this.#library.saveProgress(identifier, this.#lastPosition);
      }
      this.#onPersonalStateChange(identifier);
    }

    // Retirer l'iframe coupe la lecture : sinon le son continuerait après fermeture.
    #unloadPlayer() {
      this.#throttledProgressSave.cancel();
      this.#saveProgress();
      window.removeEventListener('message', this.#handlePlayerMessage);
      this.#playerFrame?.removeEventListener('load', this.#handleFrameLoad);
      this.#playerFrame = null;
      this.#lastPosition = null;
      this.#frameWrapper.replaceChildren();
      this.#currentPlay = null;
    }

    #togglePersonalState(toggleAction) {
      if (this.#currentPlay === null) {
        return;
      }
      toggleAction(this.#currentPlay);
      this.#renderPersonalButtons();
      this.#onPersonalStateChange(this.#currentPlay.identifier);
    }

    #renderPersonalButtons() {
      const { identifier } = this.#currentPlay;
      this.#renderToggleButton(this.#favoriteButton, this.#library.isFavorite(identifier), '★ Favori', '☆ Favori');
      this.#renderToggleButton(this.#watchLaterButton, this.#library.isInWatchLater(identifier), '✓ À voir plus tard', '+ À voir plus tard');
      this.#renderToggleButton(this.#watchedButton, this.#library.isWatched(identifier), '✓ Vu', 'Marquer comme vu');
    }

    #renderToggleButton(buttonElement, isPressed, pressedLabel, releasedLabel) {
      buttonElement.textContent = isPressed ? pressedLabel : releasedLabel;
      buttonElement.setAttribute('aria-pressed', String(isPressed));
    }
  }

  // --- main ---
  class RideauApp {
    #elements;
    #library = new PersonalLibrary();
    #preferences = new Preferences();
    #availability = new VideoAvailability();
    #toast;
    #resultsView;
    #resumeShelf;
    #playerDialog;
    #curatedPlays = null;
    #curatedPlaysByIdentifier = new Map();
    #revokeTimeoutId = null;
    #state = {
      searchText: '',
      sort: 'default',
      maskedCount: 0,
      listMode: LIST_MODES.all,
      hideWatched: false,
      curatedFilters: { ...DEFAULT_CURATED_FILTERS },
    };

    #debouncedSearch = debounce(() => this.#startNewSearch(), SEARCH_DEBOUNCE_MS);
    #handleSearchInput = (inputEvent) => {
      this.#state.searchText = inputEvent.target.value;
      this.#debouncedSearch();
    };
    #handleSortChange = (changeEvent) => {
      this.#state.sort = changeEvent.target.value;
      this.#onViewSettingsChanged();
    };
    #handleListModeChange = (changeEvent) => {
      if (Object.values(LIST_MODES).includes(changeEvent.target.value)) {
        this.#state.listMode = changeEvent.target.value;
        this.#onViewSettingsChanged();
      }
    };
    #handleHideWatchedChange = (changeEvent) => {
      this.#state.hideWatched = changeEvent.target.checked;
      this.#onViewSettingsChanged();
    };
    #handleCuratedFilterChange = (changeEvent) => {
      const filterName = changeEvent.target.dataset.filter;
      if (Object.hasOwn(DEFAULT_CURATED_FILTERS, filterName)) {
        this.#state.curatedFilters[filterName] = changeEvent.target.value;
        this.#onViewSettingsChanged();
      }
    };
    #handleResetFiltersClick = () => {
      this.#state.curatedFilters = { ...DEFAULT_CURATED_FILTERS };
      this.#onViewSettingsChanged();
    };
    #handleSurpriseClick = () => this.#openRandomPlay();
    #handleExportClick = () => this.#exportLibrary();
    #handleImportChange = (changeEvent) => this.#importLibrary(changeEvent);
    #handleUnhideClick = () => this.#unhideAll();
    #handleCuratedPlaysReceived = (dataEvent) => this.#receiveCuratedPlays(dataEvent.detail);
    #handleDocumentReady = () => this.#checkCuratedPlaysLoaded();
    #handleShortcutKeydown = (keyboardEvent) => this.#focusSearchOnShortcut(keyboardEvent);

    constructor(elements) {
      this.#elements = elements;
      this.#toast = new Toast(elements.toast);
      const openPlay = (play) => this.#playerDialog.open(play);
      this.#resultsView = new ResultsView({
        gridElement: elements.resultsGrid,
        cardTemplate: elements.cardTemplate,
        library: this.#library,
        availability: this.#availability,
        onOpenPlay: openPlay,
        onPlayHidden: (play) => this.#onPlayHidden(play),
        onPersonalToggle: (play, listName, isAdded) => this.#onPersonalToggle(play, listName, isAdded),
      });
      this.#resumeShelf = new ResumeShelf({
        sectionElement: elements.resumeShelf,
        listElement: elements.resumeShelfList,
        itemTemplate: elements.shelfItemTemplate,
        onOpenPlay: openPlay,
      });
      this.#playerDialog = new PlayerDialog({
        dialogElement: elements.playerDialog,
        library: this.#library,
        availability: this.#availability,
        onPersonalStateChange: (identifier) => this.#onPersonalStateChange(identifier),
      });
      this.#restorePreferences();
    }

    start() {
      // js/plays-data.js est chargé juste après ce script et annonce ses données par cet événement.
      document.addEventListener(CURATED_PLAYS_EVENT, this.#handleCuratedPlaysReceived);
      document.addEventListener('DOMContentLoaded', this.#handleDocumentReady);
      document.addEventListener('keydown', this.#handleShortcutKeydown);

      this.#renderExternalLinks();
      this.#renderDataControls();
      this.#syncControlsWithState();

      this.#elements.searchInput.addEventListener('input', this.#handleSearchInput);
      this.#elements.sortSelect.addEventListener('change', this.#handleSortChange);
      this.#elements.listMode.addEventListener('change', this.#handleListModeChange);
      this.#elements.hideWatchedCheckbox.addEventListener('change', this.#handleHideWatchedChange);
      this.#elements.curatedFilters.addEventListener('change', this.#handleCuratedFilterChange);
      this.#elements.resetFiltersButton.addEventListener('click', this.#handleResetFiltersClick);
      this.#elements.surpriseButton.addEventListener('click', this.#handleSurpriseClick);
      this.#elements.exportButton.addEventListener('click', this.#handleExportClick);
      this.#elements.importInput.addEventListener('change', this.#handleImportChange);
      this.#elements.unhideButton.addEventListener('click', this.#handleUnhideClick);

      this.#startNewSearch();
    }

    destroy() {
      this.#debouncedSearch.cancel();
      clearTimeout(this.#revokeTimeoutId);
      document.removeEventListener(CURATED_PLAYS_EVENT, this.#handleCuratedPlaysReceived);
      document.removeEventListener('DOMContentLoaded', this.#handleDocumentReady);
      document.removeEventListener('keydown', this.#handleShortcutKeydown);
      this.#elements.searchInput.removeEventListener('input', this.#handleSearchInput);
      this.#elements.sortSelect.removeEventListener('change', this.#handleSortChange);
      this.#elements.listMode.removeEventListener('change', this.#handleListModeChange);
      this.#elements.hideWatchedCheckbox.removeEventListener('change', this.#handleHideWatchedChange);
      this.#elements.curatedFilters.removeEventListener('change', this.#handleCuratedFilterChange);
      this.#elements.resetFiltersButton.removeEventListener('click', this.#handleResetFiltersClick);
      this.#elements.surpriseButton.removeEventListener('click', this.#handleSurpriseClick);
      this.#elements.exportButton.removeEventListener('click', this.#handleExportClick);
      this.#elements.importInput.removeEventListener('change', this.#handleImportChange);
      this.#elements.unhideButton.removeEventListener('click', this.#handleUnhideClick);
      this.#resultsView.destroy();
      this.#resumeShelf.destroy();
      this.#playerDialog.destroy();
      this.#toast.destroy();
    }

    // --- Préférences ---
    #restorePreferences() {
      const storedPreferences = this.#preferences.read();
      if (typeof storedPreferences.sort === 'string'
        && [...this.#elements.sortSelect.options].some((option) => option.value === storedPreferences.sort)) {
        this.#state.sort = storedPreferences.sort;
      }
      if (Object.values(LIST_MODES).includes(storedPreferences.listMode)) {
        this.#state.listMode = storedPreferences.listMode;
      }
      this.#state.hideWatched = storedPreferences.hideWatched === true;
      if (isPlainObject(storedPreferences.curatedFilters)) {
        Object.keys(DEFAULT_CURATED_FILTERS).forEach((filterName) => {
          const storedValue = storedPreferences.curatedFilters[filterName];
          const filterSelect = this.#findFilterSelect(filterName);
          if ([...(filterSelect?.options ?? [])].some((option) => option.value === storedValue)) {
            this.#state.curatedFilters[filterName] = storedValue;
          }
        });
      }
    }

    #savePreferences() {
      this.#preferences.save({
        sort: this.#state.sort,
        listMode: this.#state.listMode,
        hideWatched: this.#state.hideWatched,
        curatedFilters: this.#state.curatedFilters,
      });
    }

    #onViewSettingsChanged() {
      this.#savePreferences();
      this.#startNewSearch();
    }

    #findFilterSelect(filterName) {
      return this.#elements.curatedFilters.querySelector(`select[data-filter="${filterName}"]`);
    }

    #syncControlsWithState() {
      this.#elements.sortSelect.value = this.#state.sort;
      this.#elements.hideWatchedCheckbox.checked = this.#state.hideWatched;
      this.#elements.listMode.querySelectorAll('input[name="list-mode"]').forEach((radioInput) => {
        radioInput.checked = radioInput.value === this.#state.listMode;
      });
      let activeFilterCount = 0;
      Object.entries(this.#state.curatedFilters).forEach(([filterName, filterValue]) => {
        const filterSelect = this.#findFilterSelect(filterName);
        const isActive = filterValue !== DEFAULT_CURATED_FILTERS[filterName];
        filterSelect.value = filterValue;
        filterSelect.closest('.chip-select').classList.toggle('is-active', isActive);
        activeFilterCount += isActive ? 1 : 0;
      });
      this.#elements.resetFiltersButton.hidden = activeFilterCount === 0;
    }

    // --- Données de la sélection ---
    #receiveCuratedPlays(rawPlays) {
      this.#curatedPlays = Array.isArray(rawPlays) ? rawPlays.map(toCuratedPlay) : [];
      this.#curatedPlaysByIdentifier = new Map(this.#curatedPlays.map((play) => [play.identifier, play]));
      this.#renderResumeShelf();
      if (this.#isShowingCuratedPlays()) {
        this.#startNewSearch();
      }
    }

    #checkCuratedPlaysLoaded() {
      if (this.#curatedPlays !== null) {
        return;
      }
      this.#curatedPlays = [];
      if (this.#isShowingCuratedPlays()) {
        this.#showEmptyState('La sélection n’a pas pu être chargée', 'Le fichier js/plays-data.js est introuvable ou invalide.');
      }
    }

    #isShowingCuratedPlays() {
      return this.#state.listMode === LIST_MODES.all;
    }

    // --- Rendu des contrôles ---
    #renderControlsState() {
      this.#elements.curatedFilters.hidden = !this.#isShowingCuratedPlays();
      this.#elements.resultsTitle.textContent = LIST_MODE_TITLES[this.#state.listMode];
      this.#syncControlsWithState();
    }

    #renderExternalLinks() {
      const fragment = document.createDocumentFragment();
      EXTERNAL_LINKS.forEach((externalLink) => {
        const listItem = document.createElement('li');
        const anchor = document.createElement('a');
        anchor.href = externalLink.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = `${externalLink.label} ↗`;
        const description = document.createElement('span');
        description.textContent = externalLink.description;
        listItem.append(anchor, description);
        fragment.append(listItem);
      });
      this.#elements.externalLinksList.replaceChildren(fragment);
    }

    #renderDataControls() {
      const hiddenCount = this.#library.countEntries().hidden;
      this.#elements.unhideButton.disabled = hiddenCount === 0;
      this.#elements.unhideButton.textContent = `Réafficher les résultats masqués (${hiddenCount})`;
    }

    #renderResumeShelf() {
      const shelfEntries = this.#library.listInProgress()
        .map(({ identifier, progress }) => ({
          play: this.#curatedPlaysByIdentifier.get(identifier) ?? this.#library.findSavedPlay(identifier),
          progress,
        }))
        .filter(({ play }) => play !== null && play !== undefined && !this.#availability.isUnavailable(play.identifier))
        .slice(0, RESUME_SHELF_LIMIT);
      this.#resumeShelf.render(shelfEntries, { isVisible: this.#state.listMode === LIST_MODES.all });
    }

    #focusSearchOnShortcut(keyboardEvent) {
      const activeElement = document.activeElement;
      const isTyping = activeElement instanceof HTMLInputElement
        || activeElement instanceof HTMLTextAreaElement
        || activeElement instanceof HTMLSelectElement;
      if (keyboardEvent.key !== '/' || isTyping || this.#elements.playerDialog.open) {
        return;
      }
      keyboardEvent.preventDefault();
      this.#elements.searchInput.focus();
    }

    // --- Recherche et affichage ---
    #startNewSearch() {
      this.#debouncedSearch.cancel();
      this.#renderControlsState();
      this.#renderResumeShelf();
      this.#state.maskedCount = 0;

      if (this.#isShowingCuratedPlays()) {
        this.#showCuratedPlays();
      } else {
        this.#showPersonalList();
      }
    }

    #isVisibleInCatalog(play) {
      return !this.#library.isHidden(play.identifier)
        && !(this.#state.hideWatched && this.#library.isWatched(play.identifier));
    }

    #showPlays(plays, statusMessage) {
      this.#elements.emptyState.hidden = true;
      this.#resultsView.replace(plays);
      this.#setStatus(statusMessage);
    }

    #showEmptyState(title, hint) {
      this.#resultsView.replace([]);
      this.#elements.emptyState.querySelector('.empty-state-title').textContent = title;
      this.#elements.emptyState.querySelector('.empty-state-hint').textContent = hint;
      this.#elements.emptyState.hidden = false;
      this.#setStatus('');
    }

    #showCuratedPlays() {
      if (this.#curatedPlays === null) {
        this.#elements.emptyState.hidden = true;
        this.#resultsView.showSkeleton();
        this.#setStatus('');
        return;
      }

      const matchingPlays = this.#curatedPlays.filter((play) => matchesSearchText(play, this.#state.searchText)
        && matchesCuratedFilters(play, this.#state.curatedFilters));
      const visiblePlays = sortLocally(matchingPlays.filter((play) => this.#isVisibleInCatalog(play)), this.#state.sort);
      this.#state.maskedCount = matchingPlays.length - visiblePlays.length;

      if (visiblePlays.length === 0) {
        this.#showEmptyState('Aucune pièce ne correspond', 'Essayez d’effacer les filtres ou de changer de mot-clé.');
        return;
      }
      this.#showPlays(visiblePlays, `${pluralize(visiblePlays.length, 'captation intégrale', 'captations intégrales')}${this.#describeMaskedCount()}`);
    }

    #showPersonalList() {
      const isFavoritesList = this.#state.listMode === LIST_MODES.favorites;
      const savedPlays = isFavoritesList ? this.#library.listFavorites() : this.#library.listWatchLater();
      const matchingPlays = savedPlays.filter((play) => matchesSearchText(play, this.#state.searchText));
      const visiblePlays = sortLocally(
        matchingPlays.filter((play) => !(this.#state.hideWatched && this.#library.isWatched(play.identifier))),
        this.#state.sort,
      );
      this.#state.maskedCount = matchingPlays.length - visiblePlays.length;

      if (savedPlays.length === 0) {
        this.#showEmptyState(
          isFavoritesList ? 'Pas encore de favori' : 'Rien à voir plus tard pour l’instant',
          isFavoritesList
            ? 'Cliquez sur l’étoile sous une pièce pour la retrouver ici.'
            : 'Cliquez sur le signet sous une pièce pour la mettre de côté.',
        );
        return;
      }
      if (visiblePlays.length === 0) {
        this.#showEmptyState('Aucune pièce ne correspond', 'Changez de mot-clé ou désactivez « Masquer les vues ».');
        return;
      }
      this.#showPlays(visiblePlays, `${pluralize(visiblePlays.length, 'pièce', 'pièces')}${this.#describeMaskedCount()}`);
    }

    #describeMaskedCount() {
      return this.#state.maskedCount === 0 ? '' : ` · ${this.#state.maskedCount} masquée(s)`;
    }

    // --- Réactions aux actions sur les pièces ---
    #onPlayHidden(play) {
      this.#state.maskedCount += 1;
      this.#renderDataControls();
      this.#toast.show(`« ${play.title} » est masquée.`, {
        actionLabel: 'Annuler',
        onAction: () => {
          this.#library.unhide(play.identifier);
          this.#resultsView.restoreLastRemoved();
          this.#state.maskedCount = Math.max(0, this.#state.maskedCount - 1);
          this.#renderDataControls();
        },
      });
    }

    #onPersonalToggle(play, listName, isAdded) {
      const listLabel = listName === 'favorite' ? 'favoris' : '« À voir plus tard »';
      this.#toast.show(isAdded ? `Ajoutée à vos ${listLabel}.` : `Retirée de vos ${listLabel}.`);
    }

    #onPersonalStateChange(identifier) {
      this.#resultsView.refreshCard(identifier);
      this.#renderResumeShelf();
      if (this.#state.hideWatched && this.#library.isWatched(identifier)) {
        this.#resultsView.removeCard(identifier);
      }
    }

    #openRandomPlay() {
      const candidatePlays = this.#resultsView.listDisplayedPlays()
        .filter((play) => !this.#library.isWatched(play.identifier) && !this.#availability.isUnavailable(play.identifier));
      const randomPlay = pickRandomItem(candidatePlays);
      if (randomPlay === undefined) {
        this.#toast.show('Aucune pièce non vue à tirer au sort ici. Changez de liste ou de filtres.');
        return;
      }
      this.#playerDialog.open(randomPlay);
    }

    // --- Mes données ---
    #exportLibrary() {
      const snapshot = this.#library.exportSnapshot();
      const backupBlob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const downloadUrl = URL.createObjectURL(backupBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = `rideau-sauvegarde-${todayIsoDate()}.json`;
      downloadLink.click();
      // Révoquer l'URL dans la foulée peut interrompre le téléchargement sur certains navigateurs.
      clearTimeout(this.#revokeTimeoutId);
      this.#revokeTimeoutId = setTimeout(() => URL.revokeObjectURL(downloadUrl), BLOB_URL_REVOKE_DELAY_MS);
      this.#setDataStatus(`Sauvegarde téléchargée : ${this.#describeCounts(this.#library.countEntries())}.`);
    }

    async #importLibrary(changeEvent) {
      const fileInput = changeEvent.target;
      const [backupFile] = fileInput.files ?? [];
      if (backupFile === undefined) {
        return;
      }
      try {
        const importedCounts = this.#library.importSnapshot(JSON.parse(await backupFile.text()));
        this.#setDataStatus(`Sauvegarde importée et fusionnée : ${this.#describeCounts(importedCounts)}.`);
        this.#renderDataControls();
        this.#startNewSearch();
      } catch (importError) {
        console.error(importError);
        this.#setDataStatus('Ce fichier n’est pas une sauvegarde Rideau. Choisissez un fichier rideau-sauvegarde-….json.');
      } finally {
        fileInput.value = '';
      }
    }

    #describeCounts(counts) {
      return [
        pluralize(counts.favorites, 'favori', 'favoris'),
        `${counts.watchLater} à voir plus tard`,
        pluralize(counts.watched, 'pièce vue', 'pièces vues'),
        pluralize(counts.progress, 'lecture en cours', 'lectures en cours'),
        pluralize(counts.hidden, 'résultat masqué', 'résultats masqués'),
      ].join(', ');
    }

    #unhideAll() {
      this.#library.unhideAll();
      this.#renderDataControls();
      this.#setDataStatus('Tous les résultats masqués sont de nouveau visibles.');
      this.#startNewSearch();
    }

    #setStatus(message) {
      this.#elements.statusMessage.textContent = message;
    }

    #setDataStatus(message) {
      this.#elements.dataStatus.textContent = message;
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
    sortSelect: queryRequiredElement('#sort-select'),
    listMode: queryRequiredElement('#list-mode'),
    hideWatchedCheckbox: queryRequiredElement('#hide-watched'),
    curatedFilters: queryRequiredElement('#curated-filters'),
    resetFiltersButton: queryRequiredElement('#reset-filters'),
    surpriseButton: queryRequiredElement('#surprise-button'),
    resumeShelf: queryRequiredElement('#resume-shelf'),
    resumeShelfList: queryRequiredElement('#resume-shelf-list'),
    shelfItemTemplate: queryRequiredElement('#shelf-item-template'),
    resultsTitle: queryRequiredElement('#results-title'),
    statusMessage: queryRequiredElement('#status-message'),
    resultsGrid: queryRequiredElement('#results-grid'),
    emptyState: queryRequiredElement('#empty-state'),
    externalLinksList: queryRequiredElement('#external-links-list'),
    playerDialog: queryRequiredElement('#player-dialog'),
    cardTemplate: queryRequiredElement('#card-template'),
    toast: queryRequiredElement('#toast'),
    exportButton: queryRequiredElement('#export-button'),
    importInput: queryRequiredElement('#import-input'),
    unhideButton: queryRequiredElement('#unhide-button'),
    dataStatus: queryRequiredElement('#data-status'),
  });

  rideauApp.start();
  // Une page mise en cache (bfcache) peut être restaurée : on ne la détruit que si elle part vraiment.
  window.addEventListener('pagehide', (pageHideEvent) => {
    if (!pageHideEvent.persisted) {
      rideauApp.destroy();
    }
  });
})();
