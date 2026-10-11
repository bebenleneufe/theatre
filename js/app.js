// Script classique (et non module ES) pour que la page s'ouvre par simple
// double-clic : les navigateurs bloquent les modules chargés depuis file://.
(() => {
  'use strict';

  // --- config ---
  const PAGE_SIZE = 24;
  const SEARCH_DEBOUNCE_MS = 400;
  const MINIMUM_YEAR = 2000;
  const PROGRESS_SAVE_INTERVAL_MS = 5000;
  const WATCHED_COMPLETION_RATIO = 0.95;
  const MINIMUM_RESUME_SECONDS = 60;
  const BLOB_URL_REVOKE_DELAY_MS = 1000;
  const CURATED_PLAYS_EVENT = 'rideau:curated-plays';

  // Pour une vidéo supprimée ou privée, YouTube sert une vignette de remplacement
  // de 120 px de large à la place de la vraie (480 px) : c'est notre seul indice
  // côté navigateur, l'API oEmbed ne répondant pas aux requêtes cross-origin.
  const REMOVED_VIDEO_THUMBNAIL_WIDTH = 120;

  // Les sujets sont libres sur Internet Archive : comédies musicales, « proshots »
  // et spectacles tirés d'animes s'y glissent sous l'étiquette « théâtre ».
  const ARCHIVE_EXCLUSION_CLAUSE = 'NOT (title:(proshot OR musical OR "comédie musicale" OR "opéra rock" OR "opera rock" '
    + 'OR anime OR "english subs" OR "eng subs" OR "english sub" OR takarazuka OR "ace attorney" OR "the stage") '
    + 'OR subject:(anime OR manga OR musical OR "comédie musicale" OR "opéra rock" OR "musical theatre"))';

  // Requêtes Lucene d'Internet Archive, ajustées à la main : les sujets y sont saisis
  // librement par les contributeurs, d'où les nombreuses variantes orthographiques.
  const CATEGORIES = [
    {
      id: 'selection',
      label: 'Sélection récente',
      isCurated: true,
    },
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

  const MAXIMUM_SUMMARY_LENGTH = 1200;

  // DOMParser produit un document inerte : les scripts et gestionnaires d'événements
  // présents dans les descriptions (HTML libre saisi par les contributeurs) ne s'exécutent pas.
  function htmlToPlainText(rawHtml) {
    const htmlWithLineBreaks = String(rawHtml ?? '').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n');
    const parsedDocument = new DOMParser().parseFromString(htmlWithLineBreaks, 'text/html');
    const plainText = (parsedDocument.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
    return plainText.length > MAXIMUM_SUMMARY_LENGTH
      ? `${plainText.slice(0, MAXIMUM_SUMMARY_LENGTH).trimEnd()}…`
      : plainText;
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
    const recentOnlyClause = `year:[${MINIMUM_YEAR} TO 9999]`;
    return [`(${categoryQuery})`, recentOnlyClause, ARCHIVE_EXCLUSION_CLAUSE, buildTextClause(searchText)]
      .filter((clause) => clause !== '')
      .join(' AND ');
  }

  function toPlay(document, badge) {
    return {
      identifier: document.identifier,
      title: firstValue(document.title) ?? document.identifier,
      creator: firstValue(document.creator) ?? '',
      year: String(firstValue(document.year) ?? ''),
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

  // Plusieurs fichiers « original » = une captation découpée en parties : on additionne.
  // Sans original mesuré, on se rabat sur le plus long fichier dérivé.
  function computeTotalDuration(files) {
    const measuredFiles = files.filter((file) => file.length !== undefined);
    const originalSeconds = measuredFiles
      .filter((file) => file.source === 'original')
      .reduce((totalSeconds, file) => totalSeconds + parseDurationToSeconds(file.length), 0);
    if (originalSeconds > 0) {
      return originalSeconds;
    }
    return measuredFiles.reduce((longest, file) => Math.max(longest, parseDurationToSeconds(file.length)), 0);
  }

  async function fetchArchiveDetails(identifier, signal) {
    const response = await fetch(`${ARCHIVE_ORIGIN}/metadata/${encodeURIComponent(identifier)}`, { signal });
    if (!response.ok) {
      throw new Error(`Internet Archive a répondu ${response.status}`);
    }
    const payload = await response.json();
    return {
      durationSeconds: computeTotalDuration(payload.files ?? []),
      summary: htmlToPlainText(firstValue(payload.metadata?.description)),
    };
  }

  // --- playSources ---
  const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
  const YOUTUBE_ID_PATTERN = /^[\w-]{11}$/;

  function isYoutubePlay(play) {
    return typeof play.youtubeId === 'string';
  }

  function thumbnailUrl(play) {
    return isYoutubePlay(play)
      ? `https://i.ytimg.com/vi/${encodeURIComponent(play.youtubeId)}/hqdefault.jpg`
      : `${ARCHIVE_ORIGIN}/services/img/${encodeURIComponent(play.identifier)}`;
  }

  function embedUrl(play, startSeconds) {
    if (!isYoutubePlay(play)) {
      return `${ARCHIVE_ORIGIN}/embed/${encodeURIComponent(play.identifier)}`;
    }
    const playerParameters = new URLSearchParams({
      enablejsapi: '1',
      autoplay: '1',
      start: String(Math.floor(startSeconds)),
    });
    return `${YOUTUBE_EMBED_ORIGIN}/embed/${encodeURIComponent(play.youtubeId)}?${playerParameters}`;
  }

  function detailsUrl(play) {
    return isYoutubePlay(play)
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(play.youtubeId)}`
      : `${ARCHIVE_ORIGIN}/details/${encodeURIComponent(play.identifier)}`;
  }

  function sourceName(play) {
    return isYoutubePlay(play) ? 'YouTube' : 'Internet Archive';
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
      badge: 'Vidéo',
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

  function countUnofficial(plays) {
    return plays.filter((play) => play.isUnofficial === true).length;
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
  function sanitizeSavedPlay(rawPlay) {
    if (!isPlainObject(rawPlay) || typeof rawPlay.identifier !== 'string' || typeof rawPlay.title !== 'string') {
      return null;
    }
    const savedPlay = {
      identifier: rawPlay.identifier,
      title: rawPlay.title,
      creator: typeof rawPlay.creator === 'string' ? rawPlay.creator : '',
      year: typeof rawPlay.year === 'string' ? rawPlay.year : '',
      badge: typeof rawPlay.badge === 'string' ? rawPlay.badge : 'Vidéo',
      savedAt: Number.isFinite(rawPlay.savedAt) ? rawPlay.savedAt : Date.now(),
    };
    if (typeof rawPlay.youtubeId === 'string' && YOUTUBE_ID_PATTERN.test(rawPlay.youtubeId)) {
      savedPlay.youtubeId = rawPlay.youtubeId;
    }
    if (rawPlay.isUnofficial === true) {
      savedPlay.isUnofficial = true;
    }
    if (Number.isFinite(rawPlay.durationSeconds)) {
      savedPlay.durationSeconds = rawPlay.durationSeconds;
    }
    if (typeof rawPlay.summary === 'string') {
      savedPlay.summary = rawPlay.summary;
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

  // --- playDetailsLoader ---
  const MAXIMUM_PARALLEL_DETAIL_REQUESTS = 4;

  // Une requête par pièce : on en limite le nombre simultané pour ne pas saturer
  // le réseau ni Internet Archive, et on met en cache pour ne jamais redemander.
  class PlayDetailsLoader {
    #detailsByIdentifier = new Map();
    #pendingJobs = [];
    #activeRequestCount = 0;
    #abortController = new AbortController();

    load(play, { isUrgent = false } = {}) {
      if (isYoutubePlay(play)) {
        return Promise.resolve({ durationSeconds: play.durationSeconds ?? 0, summary: play.summary ?? '' });
      }

      const cachedDetails = this.#detailsByIdentifier.get(play.identifier);
      if (cachedDetails !== undefined) {
        if (isUrgent) {
          this.#moveJobToFront(play.identifier);
        }
        return cachedDetails;
      }

      const detailsPromise = new Promise((resolve, reject) => {
        const job = { identifier: play.identifier, resolve, reject };
        if (isUrgent) {
          this.#pendingJobs.unshift(job);
        } else {
          this.#pendingJobs.push(job);
        }
      });
      this.#detailsByIdentifier.set(play.identifier, detailsPromise);
      this.#startPendingJobs();
      return detailsPromise;
    }

    cancelPending() {
      const cancelledJobs = this.#pendingJobs.splice(0);
      cancelledJobs.forEach((job) => {
        this.#detailsByIdentifier.delete(job.identifier);
        job.reject(new DOMException('Chargement annulé', 'AbortError'));
      });
    }

    destroy() {
      this.cancelPending();
      this.#abortController.abort();
      this.#detailsByIdentifier.clear();
    }

    #moveJobToFront(identifier) {
      const jobIndex = this.#pendingJobs.findIndex((job) => job.identifier === identifier);
      if (jobIndex > 0) {
        this.#pendingJobs.unshift(...this.#pendingJobs.splice(jobIndex, 1));
      }
    }

    #startPendingJobs() {
      while (this.#activeRequestCount < MAXIMUM_PARALLEL_DETAIL_REQUESTS && this.#pendingJobs.length > 0) {
        this.#runJob(this.#pendingJobs.shift());
      }
    }

    async #runJob(job) {
      this.#activeRequestCount += 1;
      try {
        job.resolve(await fetchArchiveDetails(job.identifier, this.#abortController.signal));
      } catch (detailsError) {
        this.#detailsByIdentifier.delete(job.identifier);
        job.reject(detailsError);
      } finally {
        this.#activeRequestCount -= 1;
        this.#startPendingJobs();
      }
    }
  }

  // --- resultsView ---
  class ResultsView {
    #gridElement;
    #cardTemplate;
    #library;
    #detailsLoader;
    #availability;
    #onOpenPlay;
    #onPlayHidden;
    #playsByIdentifier = new Map();
    #cardsByIdentifier = new Map();
    #handleGridClick = (clickEvent) => this.#onGridClick(clickEvent);
    #handleThumbnailSettled = (settledEvent) => this.#onThumbnailSettled(settledEvent);

    constructor({ gridElement, cardTemplate, library, detailsLoader, availability, onOpenPlay, onPlayHidden }) {
      this.#gridElement = gridElement;
      this.#cardTemplate = cardTemplate;
      this.#library = library;
      this.#detailsLoader = detailsLoader;
      this.#availability = availability;
      this.#onOpenPlay = onOpenPlay;
      this.#onPlayHidden = onPlayHidden;
      this.#gridElement.addEventListener('click', this.#handleGridClick);
      // load/error ne remontent pas : la phase de capture permet un seul écouteur pour toutes les vignettes.
      this.#gridElement.addEventListener('load', this.#handleThumbnailSettled, true);
      this.#gridElement.addEventListener('error', this.#handleThumbnailSettled, true);
    }

    replace(plays) {
      this.#playsByIdentifier.clear();
      this.#cardsByIdentifier.clear();
      this.#gridElement.replaceChildren(this.#buildCards(plays));
    }

    append(plays) {
      this.#gridElement.append(this.#buildCards(plays));
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
      this.#cardsByIdentifier.get(identifier)?.remove();
      this.#cardsByIdentifier.delete(identifier);
      this.#playsByIdentifier.delete(identifier);
    }

    destroy() {
      this.#gridElement.removeEventListener('click', this.#handleGridClick);
      this.#gridElement.removeEventListener('load', this.#handleThumbnailSettled, true);
      this.#gridElement.removeEventListener('error', this.#handleThumbnailSettled, true);
      this.#playsByIdentifier.clear();
      this.#cardsByIdentifier.clear();
    }

    #buildCards(plays) {
      const fragment = document.createDocumentFragment();
      const newPlays = plays.filter((play) => !this.#playsByIdentifier.has(play.identifier));
      newPlays.forEach((play) => {
        this.#playsByIdentifier.set(play.identifier, play);
        fragment.append(this.#buildCard(play));
      });
      newPlays.forEach((play) => this.#showDurationWhenLoaded(play));
      return fragment;
    }

    #buildCard(play) {
      const cardElement = this.#cardTemplate.content.firstElementChild.cloneNode(true);
      cardElement.dataset.identifier = play.identifier;

      cardElement.querySelector('.card-thumbnail').src = thumbnailUrl(play);
      const badgeElement = cardElement.querySelector('.card-badge');
      badgeElement.textContent = play.isUnofficial === true ? 'Non officielle' : play.badge;
      badgeElement.classList.toggle('card-badge-unofficial', play.isUnofficial === true);
      cardElement.querySelector('.card-title').textContent = play.title;
      cardElement.querySelector('.card-meta').textContent = [play.creator, play.year]
        .filter((metaPart) => metaPart !== '')
        .join(' · ');
      cardElement.querySelector('.card-open').setAttribute('aria-label', `Voir le résumé de « ${play.title} »`);

      this.#applyPersonalState(cardElement, play.identifier);
      this.#applyAvailability(cardElement, play.identifier);
      this.#cardsByIdentifier.set(play.identifier, cardElement);
      return cardElement;
    }

    async #showDurationWhenLoaded(play) {
      try {
        const { durationSeconds } = await this.#detailsLoader.load(play);
        const durationBadge = this.#cardsByIdentifier.get(play.identifier)?.querySelector('.card-duration');
        if (durationBadge !== undefined && durationBadge !== null && durationSeconds > 0) {
          durationBadge.textContent = formatDuration(durationSeconds);
          durationBadge.hidden = false;
        }
      } catch (detailsError) {
        if (!isAbortError(detailsError)) {
          console.warn(`Durée indisponible pour ${play.identifier}`, detailsError);
        }
      }
    }

    #applyPersonalState(cardElement, identifier) {
      const isFavorite = this.#library.isFavorite(identifier);
      const favoriteButton = cardElement.querySelector('.card-favorite');
      favoriteButton.textContent = isFavorite ? '★' : '☆';
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
        const progressPercent = Math.min(100, Math.round((progress.seconds / progress.durationSeconds) * 100));
        progressElement.querySelector('.card-progress-bar').style.width = `${progressPercent}%`;
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
      if (play === undefined || !isYoutubePlay(play)) {
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
          this.#library.toggleFavorite(play);
          this.#applyPersonalState(cardElement, play.identifier);
          break;
        case 'watch-later':
          this.#library.toggleWatchLater(play);
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

  // --- playerDialog ---
  class PlayerDialog {
    #dialogElement;
    #titleElement;
    #metaElement;
    #summaryElement;
    #frameWrapper;
    #sourceLink;
    #watchLaterButton;
    #watchedButton;
    #closeButton;
    #library;
    #detailsLoader;
    #availability;
    #onPersonalStateChange;
    #currentPlay = null;
    #playerFrame = null;
    #lastPosition = null;

    #throttledProgressSave = throttle(() => this.#saveProgress(), PROGRESS_SAVE_INTERVAL_MS);
    #handleCloseClick = () => this.#dialogElement.close();
    #handleWatchLaterClick = () => this.#toggleWatchLater();
    #handleWatchedClick = () => this.#toggleWatched();
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

    constructor({ dialogElement, library, detailsLoader, availability, onPersonalStateChange }) {
      this.#dialogElement = dialogElement;
      this.#titleElement = dialogElement.querySelector('#player-title');
      this.#metaElement = dialogElement.querySelector('#player-meta');
      this.#summaryElement = dialogElement.querySelector('#player-summary');
      this.#frameWrapper = dialogElement.querySelector('#player-frame-wrapper');
      this.#sourceLink = dialogElement.querySelector('#player-source-link');
      this.#watchLaterButton = dialogElement.querySelector('#player-watch-later');
      this.#watchedButton = dialogElement.querySelector('#player-watched');
      this.#closeButton = dialogElement.querySelector('#player-close');
      this.#library = library;
      this.#detailsLoader = detailsLoader;
      this.#availability = availability;
      this.#onPersonalStateChange = onPersonalStateChange;

      this.#closeButton.addEventListener('click', this.#handleCloseClick);
      this.#watchLaterButton.addEventListener('click', this.#handleWatchLaterClick);
      this.#watchedButton.addEventListener('click', this.#handleWatchedClick);
      this.#frameWrapper.addEventListener('click', this.#handleLaunchClick);
      this.#dialogElement.addEventListener('close', this.#handleDialogClose);
      this.#dialogElement.addEventListener('click', this.#handleBackdropClick);
    }

    open(play) {
      this.#unloadPlayer();
      this.#currentPlay = play;
      this.#titleElement.textContent = play.title;
      this.#sourceLink.href = detailsUrl(play);
      this.#sourceLink.textContent = `Voir sur ${sourceName(play)} ↗`;
      this.#renderPersonalButtons();
      this.#renderMeta(play, 0);
      this.#summaryElement.textContent = 'Chargement du résumé…';
      this.#frameWrapper.replaceChildren(this.#buildPoster(play));

      if (!this.#dialogElement.open) {
        this.#dialogElement.showModal();
      }
      this.#showDetails(play);
    }

    destroy() {
      this.#closeButton.removeEventListener('click', this.#handleCloseClick);
      this.#watchLaterButton.removeEventListener('click', this.#handleWatchLaterClick);
      this.#watchedButton.removeEventListener('click', this.#handleWatchedClick);
      this.#frameWrapper.removeEventListener('click', this.#handleLaunchClick);
      this.#dialogElement.removeEventListener('close', this.#handleDialogClose);
      this.#dialogElement.removeEventListener('click', this.#handleBackdropClick);
      this.#unloadPlayer();
    }

    async #showDetails(play) {
      try {
        const { durationSeconds, summary } = await this.#detailsLoader.load(play, { isUrgent: true });
        if (this.#currentPlay !== play) {
          return;
        }
        this.#renderMeta(play, durationSeconds);
        this.#summaryElement.textContent = summary === '' ? 'Pas de résumé pour cette captation.' : summary;
      } catch (detailsError) {
        if (this.#currentPlay === play) {
          this.#summaryElement.textContent = 'Résumé indisponible pour le moment.';
        }
        if (!isAbortError(detailsError)) {
          console.warn(`Détails indisponibles pour ${play.identifier}`, detailsError);
        }
      }
    }

    #renderMeta(play, durationSeconds) {
      const unofficialNotice = play.isUnofficial === true ? 'mise en ligne non officielle, peut disparaître' : '';
      this.#metaElement.textContent = [play.creator, play.year, durationSeconds > 0 ? formatDuration(durationSeconds) : '', unofficialNotice]
        .filter((metaPart) => metaPart !== '')
        .join(' · ');
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
      const progress = isYoutubePlay(play) ? this.#library.getProgress(play.identifier) : null;
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

      if (isYoutubePlay(this.#currentPlay)) {
        this.#playerFrame = playerFrame;
        playerFrame.addEventListener('load', this.#handleFrameLoad);
        window.addEventListener('message', this.#handlePlayerMessage);
      }
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

    #toggleWatchLater() {
      if (this.#currentPlay === null) {
        return;
      }
      this.#library.toggleWatchLater(this.#currentPlay);
      this.#renderPersonalButtons();
      this.#onPersonalStateChange(this.#currentPlay.identifier);
    }

    #toggleWatched() {
      if (this.#currentPlay === null) {
        return;
      }
      this.#library.toggleWatched(this.#currentPlay.identifier);
      this.#renderPersonalButtons();
      this.#onPersonalStateChange(this.#currentPlay.identifier);
    }

    #renderPersonalButtons() {
      const { identifier } = this.#currentPlay;
      const isWatched = this.#library.isWatched(identifier);
      this.#watchedButton.textContent = isWatched ? '✓ Vu' : 'Marquer comme vu';
      this.#watchedButton.setAttribute('aria-pressed', String(isWatched));

      const isInWatchLater = this.#library.isInWatchLater(identifier);
      this.#watchLaterButton.textContent = isInWatchLater ? '✓ À voir plus tard' : '+ À voir plus tard';
      this.#watchLaterButton.setAttribute('aria-pressed', String(isInWatchLater));
    }
  }

  // --- main ---
  class RideauApp {
    #elements;
    #library = new PersonalLibrary();
    #availability = new VideoAvailability();
    #detailsLoader = new PlayDetailsLoader();
    #resultsView;
    #playerDialog;
    #curatedPlays = null;
    #searchAbortController = null;
    #revokeTimeoutId = null;
    #state = {
      category: CATEGORIES[0],
      searchText: '',
      sort: 'downloads desc',
      page: 1,
      loadedCount: 0,
      totalCount: 0,
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
      this.#startNewSearch();
    };
    #handleListModeChange = (changeEvent) => {
      this.#state.listMode = changeEvent.target.value;
      this.#startNewSearch();
    };
    #handleHideWatchedChange = (changeEvent) => {
      this.#state.hideWatched = changeEvent.target.checked;
      this.#startNewSearch();
    };
    #handleCuratedFilterChange = (changeEvent) => {
      const filterName = changeEvent.target.dataset.filter;
      if (Object.hasOwn(DEFAULT_CURATED_FILTERS, filterName)) {
        this.#state.curatedFilters[filterName] = changeEvent.target.value;
        this.#startNewSearch();
      }
    };
    #handleTabClick = (clickEvent) => this.#selectCategory(clickEvent);
    #handleLoadMoreClick = () => this.#loadNextPage();
    #handleSurpriseClick = () => this.#openRandomPlay();
    #handleExportClick = () => this.#exportLibrary();
    #handleImportChange = (changeEvent) => this.#importLibrary(changeEvent);
    #handleUnhideClick = () => this.#unhideAll();
    #handleCuratedPlaysReceived = (dataEvent) => this.#receiveCuratedPlays(dataEvent.detail);
    #handleDocumentReady = () => this.#checkCuratedPlaysLoaded();

    constructor(elements) {
      this.#elements = elements;
      this.#resultsView = new ResultsView({
        gridElement: elements.resultsGrid,
        cardTemplate: elements.cardTemplate,
        library: this.#library,
        detailsLoader: this.#detailsLoader,
        availability: this.#availability,
        onOpenPlay: (play) => this.#playerDialog.open(play),
        onPlayHidden: () => this.#onPlayHidden(),
      });
      this.#playerDialog = new PlayerDialog({
        dialogElement: elements.playerDialog,
        library: this.#library,
        detailsLoader: this.#detailsLoader,
        availability: this.#availability,
        onPersonalStateChange: (identifier) => this.#onPersonalStateChange(identifier),
      });
    }

    start() {
      // js/plays-data.js est chargé juste après ce script et annonce ses données par cet événement.
      document.addEventListener(CURATED_PLAYS_EVENT, this.#handleCuratedPlaysReceived);
      document.addEventListener('DOMContentLoaded', this.#handleDocumentReady);

      this.#renderCategoryTabs();
      this.#renderExternalLinks();
      this.#renderDataControls();

      this.#elements.searchInput.addEventListener('input', this.#handleSearchInput);
      this.#elements.sortSelect.addEventListener('change', this.#handleSortChange);
      this.#elements.listModeSelect.addEventListener('change', this.#handleListModeChange);
      this.#elements.hideWatchedCheckbox.addEventListener('change', this.#handleHideWatchedChange);
      this.#elements.curatedFilters.addEventListener('change', this.#handleCuratedFilterChange);
      this.#elements.categoryTabs.addEventListener('click', this.#handleTabClick);
      this.#elements.loadMoreButton.addEventListener('click', this.#handleLoadMoreClick);
      this.#elements.surpriseButton.addEventListener('click', this.#handleSurpriseClick);
      this.#elements.exportButton.addEventListener('click', this.#handleExportClick);
      this.#elements.importInput.addEventListener('change', this.#handleImportChange);
      this.#elements.unhideButton.addEventListener('click', this.#handleUnhideClick);

      this.#startNewSearch();
    }

    destroy() {
      this.#debouncedSearch.cancel();
      this.#searchAbortController?.abort();
      clearTimeout(this.#revokeTimeoutId);
      document.removeEventListener(CURATED_PLAYS_EVENT, this.#handleCuratedPlaysReceived);
      document.removeEventListener('DOMContentLoaded', this.#handleDocumentReady);
      this.#elements.searchInput.removeEventListener('input', this.#handleSearchInput);
      this.#elements.sortSelect.removeEventListener('change', this.#handleSortChange);
      this.#elements.listModeSelect.removeEventListener('change', this.#handleListModeChange);
      this.#elements.hideWatchedCheckbox.removeEventListener('change', this.#handleHideWatchedChange);
      this.#elements.curatedFilters.removeEventListener('change', this.#handleCuratedFilterChange);
      this.#elements.categoryTabs.removeEventListener('click', this.#handleTabClick);
      this.#elements.loadMoreButton.removeEventListener('click', this.#handleLoadMoreClick);
      this.#elements.surpriseButton.removeEventListener('click', this.#handleSurpriseClick);
      this.#elements.exportButton.removeEventListener('click', this.#handleExportClick);
      this.#elements.importInput.removeEventListener('change', this.#handleImportChange);
      this.#elements.unhideButton.removeEventListener('click', this.#handleUnhideClick);
      this.#resultsView.destroy();
      this.#playerDialog.destroy();
      this.#detailsLoader.destroy();
    }

    #receiveCuratedPlays(rawPlays) {
      this.#curatedPlays = Array.isArray(rawPlays) ? rawPlays.map(toCuratedPlay) : [];
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
        this.#setStatus('La liste des pièces (js/plays-data.js) n’a pas pu être chargée. Les autres onglets fonctionnent.');
      }
    }

    #isShowingCuratedPlays() {
      return this.#state.listMode === LIST_MODES.all && this.#state.category.isCurated === true;
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
      this.#renderControlsState();
    }

    #renderControlsState() {
      const isPersonalList = this.#state.listMode !== LIST_MODES.all;
      this.#elements.categoryTabs.querySelectorAll('.tab').forEach((tabButton) => {
        const isActive = tabButton.dataset.categoryId === this.#state.category.id;
        tabButton.setAttribute('aria-selected', String(isActive));
        tabButton.disabled = isPersonalList;
      });
      this.#elements.curatedFilters.hidden = !this.#isShowingCuratedPlays();
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

    #renderDataControls() {
      const hiddenCount = this.#library.countEntries().hidden;
      this.#elements.unhideButton.disabled = hiddenCount === 0;
      this.#elements.unhideButton.textContent = `Réafficher les résultats masqués (${hiddenCount})`;
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
      this.#detailsLoader.cancelPending();
      this.#renderControlsState();
      this.#state.page = 1;
      this.#state.loadedCount = 0;
      this.#state.maskedCount = 0;

      if (this.#state.listMode !== LIST_MODES.all) {
        this.#searchAbortController?.abort();
        this.#showPersonalList();
        return;
      }
      if (this.#state.category.isCurated === true) {
        this.#searchAbortController?.abort();
        this.#showCuratedPlays();
        return;
      }
      this.#fetchPage({ isFirstPage: true });
    }

    #loadNextPage() {
      this.#state.page += 1;
      this.#fetchPage({ isFirstPage: false });
    }

    #isVisibleInCatalog(play) {
      return !this.#library.isHidden(play.identifier)
        && !(this.#state.hideWatched && this.#library.isWatched(play.identifier));
    }

    #showCuratedPlays() {
      this.#elements.loadMoreButton.hidden = true;
      if (this.#curatedPlays === null) {
        this.#resultsView.replace([]);
        this.#setStatus('Chargement de la sélection…');
        return;
      }

      const matchingPlays = this.#curatedPlays.filter((play) => matchesSearchText(play, this.#state.searchText)
        && matchesCuratedFilters(play, this.#state.curatedFilters));
      const visiblePlays = sortLocally(matchingPlays.filter((play) => this.#isVisibleInCatalog(play)), this.#state.sort);
      this.#state.maskedCount = matchingPlays.length - visiblePlays.length;
      this.#resultsView.replace(visiblePlays);

      if (visiblePlays.length === 0) {
        this.#setStatus('Aucune pièce de la sélection ne correspond. Changez de filtres ou essayez les autres onglets.');
        return;
      }
      const unofficialCount = countUnofficial(visiblePlays);
      const unofficialPart = unofficialCount === 0 ? '' : `, dont ${unofficialCount} non officielle(s)`;
      this.#setStatus(`${pluralize(visiblePlays.length, 'captation intégrale', 'captations intégrales')}`
        + `${unofficialPart}${this.#describeMaskedCount()}.`);
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

      this.#resultsView.replace(visiblePlays);
      this.#elements.loadMoreButton.hidden = true;
      if (savedPlays.length === 0) {
        this.#setStatus(isFavoritesList
          ? 'Aucun favori pour l’instant. Cliquez sur ☆ sous une pièce pour l’ajouter.'
          : 'Votre liste « À voir plus tard » est vide. Cliquez sur le signet sous une pièce pour l’ajouter.');
        return;
      }
      this.#setStatus(`${pluralize(visiblePlays.length, 'pièce', 'pièces')}${this.#describeMaskedCount()}.`);
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

        const visiblePlays = plays.filter((play) => this.#isVisibleInCatalog(play));
        if (isFirstPage) {
          this.#resultsView.replace(visiblePlays);
        } else {
          this.#resultsView.append(visiblePlays);
        }
        this.#state.totalCount = totalCount;
        this.#state.loadedCount += plays.length;
        this.#state.maskedCount += plays.length - visiblePlays.length;
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
        : `${loadedCount} sur ${totalCount} résultat(s)${this.#describeMaskedCount()}.`);
    }

    #describeMaskedCount() {
      return this.#state.maskedCount === 0 ? '' : ` · ${this.#state.maskedCount} masquée(s) (vues ou retirées par vous)`;
    }

    #onPlayHidden() {
      this.#state.maskedCount += 1;
      this.#renderDataControls();
      this.#setStatus(`Résultat masqué. Pour le retrouver : « Réafficher les résultats masqués », en bas de page.`);
    }

    #onPersonalStateChange(identifier) {
      this.#resultsView.refreshCard(identifier);
      if (this.#state.hideWatched && this.#library.isWatched(identifier)) {
        this.#resultsView.removeCard(identifier);
      }
    }

    #openRandomPlay() {
      const candidatePlays = this.#resultsView.listDisplayedPlays()
        .filter((play) => !this.#library.isWatched(play.identifier) && !this.#availability.isUnavailable(play.identifier));
      const randomPlay = pickRandomItem(candidatePlays);
      if (randomPlay === undefined) {
        this.#setStatus('Aucune pièce non vue à tirer au sort ici. Changez d’onglet ou de filtres.');
        return;
      }
      this.#playerDialog.open(randomPlay);
    }

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
      this.#setDataStatus(`Sauvegarde téléchargée (${this.#describeCounts(this.#library.countEntries())}).`);
    }

    async #importLibrary(changeEvent) {
      const fileInput = changeEvent.target;
      const [backupFile] = fileInput.files ?? [];
      if (backupFile === undefined) {
        return;
      }
      try {
        const importedCounts = this.#library.importSnapshot(JSON.parse(await backupFile.text()));
        this.#setDataStatus(`Sauvegarde importée et fusionnée (${this.#describeCounts(importedCounts)}).`);
        this.#renderDataControls();
        this.#startNewSearch();
      } catch (importError) {
        console.error(importError);
        this.#setDataStatus('Ce fichier n’est pas une sauvegarde Rideau valide. Choisissez un fichier rideau-sauvegarde-….json.');
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
    categoryTabs: queryRequiredElement('#category-tabs'),
    sortSelect: queryRequiredElement('#sort-select'),
    listModeSelect: queryRequiredElement('#list-mode-select'),
    hideWatchedCheckbox: queryRequiredElement('#hide-watched'),
    curatedFilters: queryRequiredElement('#curated-filters'),
    surpriseButton: queryRequiredElement('#surprise-button'),
    statusMessage: queryRequiredElement('#status-message'),
    resultsGrid: queryRequiredElement('#results-grid'),
    loadMoreButton: queryRequiredElement('#load-more'),
    externalLinksList: queryRequiredElement('#external-links-list'),
    playerDialog: queryRequiredElement('#player-dialog'),
    cardTemplate: queryRequiredElement('#card-template'),
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
