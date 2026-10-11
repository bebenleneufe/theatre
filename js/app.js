// Script classique (et non module ES) pour que la page s'ouvre par simple
// double-clic : les navigateurs bloquent les modules chargés depuis file://.
(() => {
  'use strict';

  // --- config ---
  const PAGE_SIZE = 24;
  const SEARCH_DEBOUNCE_MS = 400;
  const MINIMUM_YEAR = 2000;

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

  // Captations intégrales vérifiées une à une : publiées sur la chaîne YouTube officielle
  // du théâtre ou de la compagnie (pas de ré-upload), intégrables, tournées après 2000.
  // L'année n'est renseignée que lorsqu'elle a pu être confirmée.
  const CURATED_PLAYS = [
    {
      youtubeId: 'lgiuUY3zWfY', title: 'Îles flottantes', creator: 'Kenza Berrada, d’après Brigitte Giraud · Odéon', year: '2026', duration: '1:10:52',
      summary: 'Un lycéen, au fil d’un exposé, finit par cesser de mentir et dire qui il est. Librement adapté du roman Jour de courage de Brigitte Giraud et créé avec une vingtaine d’adolescents dans le cadre du programme « Adolescence et territoire(s) » de l’Odéon.',
    },
    { youtubeId: 'kJhd3q7wZE4', title: 'Le Chant d’ivresse', creator: 'Odéon – Théâtre de l’Europe', year: '', duration: '1:32:55', summary: '' },
    {
      youtubeId: '_BUbSJ-teQ0', title: 'Combat de nègre et de chiens', creator: 'Koltès · Cie Kobal’t, Théâtre de la Bastille', year: '2022', duration: '1:59:15',
      summary: 'Sur un chantier en Afrique de l’Ouest, à la tombée de la nuit, Alboury vient réclamer le corps de son frère, mort sur le chantier. Face à lui : Horn, le chef de chantier, Cal, l’ingénieur, et Léone, que Horn vient de faire venir de Paris. Mise en scène de Mathieu Boisliveau.',
    },
    {
      youtubeId: '2Bxz_-9VDlc', title: 'Un sentiment de vie', creator: 'Claudine Galea · Cie Rabeux, Théâtre de la Bastille', year: '', duration: '1:15:23',
      summary: 'Une autrice monte sur scène et trouve enfin les mots pour dire à son père, des années après sa mort, la force de son amour. Un récit traversé par les traces de la guerre d’Algérie, où la musique finit par relier le père et la fille. Mise en scène de Jean-Michel Rabeux.',
    },
    { youtubeId: 'eG_DjSg5HQ0', title: 'Les Derniers Jours', creator: 'Mise en scène Jean-Michel Rabeux · Cie Rabeux', year: '', duration: '1:24:02', summary: '' },
    {
      youtubeId: 'R5lwmbQ3eQk', title: 'Comme il vous plaira', creator: 'Shakespeare · Théâtre du Nord', year: '2018', duration: '2:37:38',
      summary: 'Chassée de la cour par son oncle usurpateur, Rosalinde se réfugie dans la forêt d’Arden, déguisée en jeune homme, avec sa cousine Célia. Elle y retrouve Orlando, amoureux d’elle, qui ne la reconnaît pas. Une comédie de Shakespeare sur l’amour et le travestissement.',
    },
    {
      youtubeId: 'ISzpB9gk2gg', title: 'Le Tartuffe ou l’Imposteur (lecture à la table)', creator: 'Molière · Comédie-Française', year: '', duration: '1:55:31',
      summary: 'Orgon, sous l’emprise du faux dévot Tartuffe, est prêt à lui donner sa fille et ses biens. Sa femme Elmire va tendre un piège pour démasquer l’imposteur. Lecture filmée par la troupe de la Comédie-Française dans sa série « Théâtre à la table ».',
    },
    {
      youtubeId: '9pZecJzEu8U', title: 'Les Fausses Confidences (lecture à la table)', creator: 'Marivaux · Comédie-Française', year: '', duration: '1:48:12',
      summary: 'Dorante, jeune homme ruiné, entre comme intendant chez la riche veuve Araminte, dont il est amoureux. Son ancien valet Dubois orchestre une série de mensonges pour qu’elle tombe amoureuse de lui. Lecture filmée par la troupe de la Comédie-Française.',
    },
    {
      youtubeId: 'Bv-YuTjXjhc', title: 'Le Menteur', creator: 'Corneille · Théâtre du Lyon', year: '', duration: '1:45:35',
      summary: 'Fraîchement arrivé à Paris, le jeune Dorante s’invente exploits et aventures pour séduire, et se trompe sur le nom de la femme qu’il aime. Ses mensonges s’enchaînent jusqu’à l’emmêler complètement. Comédie de Corneille.',
    },
    {
      youtubeId: 'na-kfkhTYQI', title: 'Cyrano de Bergerac', creator: 'Rostand · Cie du Berger', year: '2012', duration: '3:12:03',
      summary: 'Cyrano, poète et bretteur au nez immense, aime en secret sa cousine Roxane. Elle s’éprend du beau Christian, et Cyrano l’aide à la séduire en lui prêtant ses mots.',
    },
    {
      youtubeId: 'gekAlcby5xQ', title: 'Knock', creator: 'Jules Romains · Cie du Berger', year: '', duration: '2:17:20',
      summary: 'Le docteur Knock reprend le cabinet d’un village de montagne où personne n’est jamais malade. Il entreprend de convaincre chaque habitant qu’il est un malade qui s’ignore.',
    },
    {
      youtubeId: 'mBqQv0tV6ks', title: 'Henry VI', creator: 'Shakespeare · Machine Théâtre, Odéon', year: '2009', duration: '1:29:40',
      summary: 'Après la mort d’Henry V, le jeune roi Henry VI voit l’Angleterre se déchirer entre les maisons d’York et de Lancastre : c’est le début de la guerre des Deux-Roses.',
    },
    {
      youtubeId: 'V6dqwQUCrV8', title: 'Lorenzaccio', creator: 'Musset · Cie Philippe Wiart', year: '2009', duration: '1:55:42',
      summary: 'Florence, 1537. Lorenzo de Médicis, compagnon de débauche du duc Alexandre, passe pour un lâche. Il prépare en secret l’assassinat du tyran.',
    },
    {
      youtubeId: '6yC3Uh9Q5j8', title: 'L’Île des esclaves', creator: 'Marivaux · Théâtre de la vallée', year: '', duration: '1:14:05',
      summary: 'Après un naufrage, deux maîtres et leurs valets échouent sur une île gouvernée par d’anciens esclaves. La loi de l’île les oblige à échanger leurs rôles.',
    },
    { youtubeId: '6Z2wTrQXoW4', title: 'Le Misanthrope à tout prix', creator: 'Cie du Plateau Libre', year: '', duration: '1:15:11', summary: '' },
    {
      youtubeId: '6GZksuQggng', title: 'Le Mont Analogue', creator: 'D’après René Daumal · Temps Blancs', year: '', duration: '1:27:14',
      summary: 'D’après le roman inachevé de René Daumal : une petite expédition part à la recherche d’une montagne invisible qui relierait la Terre au Ciel.',
    },
    {
      youtubeId: 'IMs6bi0J-fA', title: 'L’Espèce humaine ou l’Inimaginable', creator: 'D’après Robert Antelme · Théâtre Amer', year: '', duration: '1:17:44',
      summary: 'D’après le récit de Robert Antelme, résistant déporté en 1944, sur sa détention dans un camp de travail nazi et sur ce qui reste d’humain quand tout est fait pour le nier.',
    },
    { youtubeId: 'TsboxpFnPrE', title: 'My Story', creator: 'Céline Ohrel · Cie Diplex', year: '', duration: '1:34:44', summary: '' },
    {
      youtubeId: '6XSZpF525Y0', title: 'Le Roi Lear', creator: 'Shakespeare · Mathieu Coblentz, Théâtre Amer', year: '2025', duration: '2:14:32',
      summary: 'Le vieux roi Lear veut abandonner le pouvoir et partager son royaume entre ses filles, à condition qu’elles lui déclarent publiquement leur amour. Une version épique, entre faste baroque et cabaret glam rock, avec sept comédiens-musiciens. Jouée au Théâtre du Soleil.',
    },
    {
      youtubeId: '3uc_JSJPTgU', title: 'La Mouette', creator: 'Tchekhov · Cie Kobal’t', year: '', duration: '1:46:41',
      summary: 'Dans une propriété à la campagne, le jeune Treplev fait jouer sa pièce d’avant-garde par Nina, dont il est amoureux. Mais Nina rêve de gloire et se tourne vers Trigorine, écrivain célèbre et amant de la mère de Treplev.',
    },
    {
      youtubeId: '1-W0HpdMVvM', title: 'Britannicus', creator: 'Racine · Cie du Berger', year: '2024', duration: '2:20:32',
      summary: 'Le jeune empereur Néron fait enlever Junie, promise à son demi-frère Britannicus, et cherche à s’affranchir de sa mère Agrippine. La naissance d’un tyran.',
    },
    {
      youtubeId: 'XjAWavSmbkg', title: 'L’École des femmes', creator: 'Molière · Jean-Marc Chotteau, La Virgule', year: '', duration: '2:10:59',
      summary: 'Arnolphe a fait élever Agnès dans l’ignorance pour l’épouser sans risque d’être trompé. Mais elle tombe amoureuse du jeune Horace, qui fait d’Arnolphe son confident sans savoir qui il est.',
    },
    {
      youtubeId: 'tZ5Pl6Kso0U', title: 'Le Bourgeois gentilhomme', creator: 'Molière et Lully · Opéra Royal de Versailles', year: '', duration: '2:45:20',
      summary: 'Monsieur Jourdain, riche bourgeois, veut à tout prix devenir gentilhomme : leçons de danse, de musique, d’escrime et de philosophie, jusqu’à une cérémonie turque grotesque. Comédie-ballet avec la musique de Lully.',
    },
    {
      youtubeId: 'RDoEtysSBqY', title: 'Les Amants magnifiques', creator: 'Molière et Lully · Les Malins Plaisirs', year: '', duration: '2:35:52',
      summary: 'En Thessalie, deux princes rivalisent de fêtes somptueuses pour obtenir la main de la princesse Ériphile, qui aime en secret Sostrate, un simple général. Comédie-ballet mise en scène par Vincent Tavernier.',
    },
    {
      youtubeId: 'ekAG1dgCCYQ', title: 'Le Dindon', creator: 'Feydeau · Cie du Berger', year: '', duration: '3:07:04',
      summary: 'Lucienne, épouse fidèle de Vatelin, a juré de le tromper le jour où il la tromperait. Deux séducteurs, Pontagnac et Rédillon, guettent ce moment. Vaudeville de Feydeau.',
    },
    {
      youtubeId: '_9WXMdlV4tI', title: 'Le Dindon', creator: 'Feydeau · La Comédie des Ternes', year: '', duration: '2:19:26',
      summary: 'Lucienne, épouse fidèle de Vatelin, a juré de le tromper le jour où il la tromperait. Deux séducteurs, Pontagnac et Rédillon, guettent ce moment. Vaudeville de Feydeau.',
    },
    {
      youtubeId: 'VBzB7cuQZvM', title: 'La Dispute', creator: 'Marivaux · Théâtre Olympia, CDN de Tours', year: '', duration: '1:05:48',
      summary: 'Qui, de l’homme ou de la femme, a été infidèle le premier ? Pour trancher, un prince et sa maîtresse observent quatre jeunes gens élevés à l’écart du monde, qui se rencontrent pour la première fois.',
    },
    {
      youtubeId: 'pcgyT_cPyvQ', title: 'La Cantatrice chauve', creator: 'Ionesco · Cie de la Toque Flamboyante', year: '2026', duration: '1:09:06',
      summary: 'Dans un salon anglais, les Smith reçoivent les Martin. Leurs banalités dérapent peu à peu vers l’absurde le plus complet. La pièce fondatrice du théâtre de l’absurde.',
    },
    {
      youtubeId: '7c6ehafEvyg', title: 'En attendant Godot', creator: 'Beckett · Écailles Productions', year: '', duration: '2:31:13',
      summary: 'Au bord d’une route, près d’un arbre, Vladimir et Estragon attendent un certain Godot, qui ne vient jamais.',
    },
    {
      youtubeId: '9_Dm6tje-eg', title: 'Je suis encore en vie', creator: 'Jacques Allaire · Le Tarmac', year: '2014', duration: '58:59',
      summary: 'Un spectacle presque sans paroles, porté par les corps : une femme sous l’autorité masculine, sous l’ombre de la poétesse afghane Nadia Anjuman, tuée par son mari. Avec Anissa Daoud et Jacques Allaire.',
    },
    { youtubeId: '8M1UvkqVQrM', title: 'Huit minutes-lumière', creator: 'Compagnie Inachevée', year: '2022', duration: '2:08:21', summary: '' },
    { youtubeId: '7912YrR9Pw4', title: 'Chère Amazone', creator: 'Compagnie en Amazone', year: '2015', duration: '1:06:38', summary: '' },
    {
      youtubeId: '1OU0cuGuPSk', title: 'Macbeth – 1re partie (EN)', creator: 'Shakespeare · Teller et Aaron Posner, Folger Theatre', year: '2008', duration: '1:09:39',
      summary: 'Poussé par la prophétie de trois sorcières et par l’ambition de sa femme, le général Macbeth assassine le roi Duncan pour prendre sa place. Mise en scène du magicien Teller et d’Aaron Posner, avec des effets d’illusion. En anglais.',
    },
    {
      youtubeId: 'GLc3w-yp3wk', title: 'Macbeth – 2e partie (EN)', creator: 'Shakespeare · Teller et Aaron Posner, Folger Theatre', year: '2008', duration: '54:40',
      summary: 'Suite et fin : devenu roi, Macbeth s’enfonce dans le crime et la paranoïa. En anglais.',
    },
    {
      youtubeId: 'wBWsaO7wgnQ', title: 'The Tempest (EN)', creator: 'Shakespeare · The Lord Chamberlain’s Men', year: '2018', duration: '1:56:28',
      summary: 'Prospero, duc de Milan détrôné et exilé sur une île avec sa fille Miranda, déclenche une tempête pour faire échouer ses ennemis sur son rivage. En anglais.',
    },
    {
      youtubeId: 'aAzvnV4Qz9w', title: 'Missing (théâtre physique)', creator: 'Gecko', year: '2012', duration: '1:05:03',
      summary: 'Spectacle de théâtre physique de la compagnie britannique Gecko : peu de dialogues, une histoire portée par le mouvement, la lumière et la musique.',
    },
    {
      youtubeId: 'YSvS9y1WjrE', title: 'The Overcoat (théâtre physique)', creator: 'Gecko', year: '', duration: '1:19:38',
      summary: 'D’après la nouvelle de Gogol : un modeste employé de bureau voit sa vie bouleversée par un nouveau manteau. Théâtre physique, quasiment sans paroles.',
    },
    {
      youtubeId: 'yRr9otK7_Ac', title: 'The Race (théâtre physique)', creator: 'Gecko', year: '', duration: '1:02:27',
      summary: 'Spectacle de théâtre physique de la compagnie britannique Gecko, porté par le mouvement et la musique plutôt que par le texte.',
    },
  ].map(({ duration, ...curatedPlay }) => ({
    ...curatedPlay,
    identifier: `youtube:${curatedPlay.youtubeId}`,
    badge: 'Vidéo',
    durationSeconds: parseDurationToSeconds(duration),
  }));

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
    const textClause = buildTextClause(searchText);
    return [`(${categoryQuery})`, recentOnlyClause, textClause]
      .filter((clause) => clause !== '')
      .join(' AND ');
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
        return Promise.resolve({ durationSeconds: play.durationSeconds, summary: play.summary });
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

  // --- playSources ---
  function isYoutubePlay(play) {
    return typeof play.youtubeId === 'string';
  }

  function thumbnailUrl(play) {
    return isYoutubePlay(play)
      ? `https://i.ytimg.com/vi/${encodeURIComponent(play.youtubeId)}/hqdefault.jpg`
      : `${ARCHIVE_ORIGIN}/services/img/${encodeURIComponent(play.identifier)}`;
  }

  function embedUrl(play) {
    return isYoutubePlay(play)
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(play.youtubeId)}`
      : `${ARCHIVE_ORIGIN}/embed/${encodeURIComponent(play.identifier)}`;
  }

  function detailsUrl(play) {
    return isYoutubePlay(play)
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(play.youtubeId)}`
      : `${ARCHIVE_ORIGIN}/details/${encodeURIComponent(play.identifier)}`;
  }

  function sourceName(play) {
    return isYoutubePlay(play) ? 'YouTube' : 'Internet Archive';
  }

  // --- curatedPlays ---
  const LOCAL_SORTERS = {
    'date desc': (first, second) => (second.year || '0').localeCompare(first.year || '0'),
    'date asc': (first, second) => (first.year || '9999').localeCompare(second.year || '9999'),
    'titleSorter asc': (first, second) => first.title.localeCompare(second.title, 'fr'),
  };

  function matchesSearchText(play, searchText) {
    const normalizedSearch = searchText.trim().toLocaleLowerCase('fr');
    return `${play.title} ${play.creator}`.toLocaleLowerCase('fr').includes(normalizedSearch);
  }

  function filterAndSortLocally(plays, { searchText, sort }) {
    const matchingPlays = plays.filter((play) => matchesSearchText(play, searchText));
    const sorter = LOCAL_SORTERS[sort];
    return sorter === undefined ? matchingPlays : matchingPlays.sort(sorter);
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
    #detailsLoader;
    #onOpenPlay;
    #playsByIdentifier = new Map();
    #cardsByIdentifier = new Map();
    #handleGridClick = (clickEvent) => this.#onGridClick(clickEvent);

    constructor({ gridElement, cardTemplate, library, detailsLoader, onOpenPlay }) {
      this.#gridElement = gridElement;
      this.#cardTemplate = cardTemplate;
      this.#library = library;
      this.#detailsLoader = detailsLoader;
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
      const newPlays = plays.filter((play) => !this.#playsByIdentifier.has(play.identifier));
      newPlays.forEach((play) => {
        this.#playsByIdentifier.set(play.identifier, play);
        fragment.append(this.#buildCard(play));
      });
      newPlays.forEach((play) => this.#showDurationWhenLoaded(play));
      return fragment;
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

    #buildCard(play) {
      const cardElement = this.#cardTemplate.content.firstElementChild.cloneNode(true);
      cardElement.dataset.identifier = play.identifier;

      cardElement.querySelector('.card-thumbnail').src = thumbnailUrl(play);
      cardElement.querySelector('.card-badge').textContent = play.badge;
      cardElement.querySelector('.card-title').textContent = play.title;
      cardElement.querySelector('.card-meta').textContent = [play.creator, play.year]
        .filter((metaPart) => metaPart !== '')
        .join(' · ');
      cardElement.querySelector('.card-open').setAttribute('aria-label', `Voir le résumé de « ${play.title} »`);

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
    #metaElement;
    #summaryElement;
    #frameWrapper;
    #sourceLink;
    #watchedButton;
    #closeButton;
    #library;
    #detailsLoader;
    #onPersonalStateChange;
    #currentPlay = null;

    #handleCloseClick = () => this.#dialogElement.close();
    #handleWatchedClick = () => this.#toggleWatched();
    #handleLaunchClick = (clickEvent) => {
      if (clickEvent.target.closest('.player-launch') !== null) {
        this.#launchPlayer();
      }
    };
    #handleDialogClose = () => this.#unloadPlayer();
    #handleBackdropClick = (clickEvent) => {
      if (clickEvent.target === this.#dialogElement) {
        this.#dialogElement.close();
      }
    };

    constructor({ dialogElement, library, detailsLoader, onPersonalStateChange }) {
      this.#dialogElement = dialogElement;
      this.#titleElement = dialogElement.querySelector('#player-title');
      this.#metaElement = dialogElement.querySelector('#player-meta');
      this.#summaryElement = dialogElement.querySelector('#player-summary');
      this.#frameWrapper = dialogElement.querySelector('#player-frame-wrapper');
      this.#sourceLink = dialogElement.querySelector('#player-source-link');
      this.#watchedButton = dialogElement.querySelector('#player-watched');
      this.#closeButton = dialogElement.querySelector('#player-close');
      this.#library = library;
      this.#detailsLoader = detailsLoader;
      this.#onPersonalStateChange = onPersonalStateChange;

      this.#closeButton.addEventListener('click', this.#handleCloseClick);
      this.#watchedButton.addEventListener('click', this.#handleWatchedClick);
      this.#frameWrapper.addEventListener('click', this.#handleLaunchClick);
      this.#dialogElement.addEventListener('close', this.#handleDialogClose);
      this.#dialogElement.addEventListener('click', this.#handleBackdropClick);
    }

    open(play) {
      this.#currentPlay = play;
      this.#titleElement.textContent = play.title;
      this.#sourceLink.href = detailsUrl(play);
      this.#sourceLink.textContent = `Voir sur ${sourceName(play)} ↗`;
      this.#renderWatchedButton();
      this.#renderMeta(play, 0);
      this.#summaryElement.textContent = 'Chargement du résumé…';
      this.#frameWrapper.replaceChildren(this.#buildPoster(play));

      this.#dialogElement.showModal();
      this.#showDetails(play);
    }

    destroy() {
      this.#closeButton.removeEventListener('click', this.#handleCloseClick);
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
        this.#summaryElement.textContent = summary === ''
          ? 'Pas de résumé pour cette captation.'
          : summary;
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
      this.#metaElement.textContent = [play.creator, play.year, durationSeconds > 0 ? formatDuration(durationSeconds) : '']
        .filter((metaPart) => metaPart !== '')
        .join(' · ');
    }

    #buildPoster(play) {
      const launchButton = document.createElement('button');
      launchButton.type = 'button';
      launchButton.className = 'player-launch';

      const posterImage = document.createElement('img');
      posterImage.className = 'player-poster';
      posterImage.src = thumbnailUrl(play);
      posterImage.alt = '';

      const launchLabel = document.createElement('span');
      launchLabel.className = 'player-launch-label';
      launchLabel.textContent = '▶ Lancer la pièce';

      launchButton.append(posterImage, launchLabel);
      return launchButton;
    }

    #launchPlayer() {
      if (this.#currentPlay === null) {
        return;
      }
      const playerFrame = document.createElement('iframe');
      playerFrame.src = embedUrl(this.#currentPlay);
      playerFrame.title = `Lecteur : ${this.#currentPlay.title}`;
      playerFrame.allow = 'fullscreen; autoplay; encrypted-media; picture-in-picture';
      // YouTube refuse de lire une vidéo intégrée sans en-tête Referer (erreur 153).
      playerFrame.referrerPolicy = 'strict-origin-when-cross-origin';
      playerFrame.className = 'player-frame';
      this.#frameWrapper.replaceChildren(playerFrame);
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
    #detailsLoader = new PlayDetailsLoader();
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
        detailsLoader: this.#detailsLoader,
        onOpenPlay: (play) => this.#playerDialog.open(play),
      });
      this.#playerDialog = new PlayerDialog({
        dialogElement: elements.playerDialog,
        library: this.#library,
        detailsLoader: this.#detailsLoader,
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
      this.#detailsLoader.destroy();
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
      this.#detailsLoader.cancelPending();
      this.#highlightActiveTab();
      this.#state.page = 1;
      this.#state.loadedCount = 0;

      if (this.#state.favoritesOnly) {
        this.#searchAbortController?.abort();
        this.#showFavorites();
        return;
      }
      if (this.#state.category.isCurated) {
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

    #showCuratedPlays() {
      const matchingPlays = filterAndSortLocally([...CURATED_PLAYS], this.#state);
      this.#resultsView.replace(matchingPlays);
      this.#elements.loadMoreButton.hidden = true;
      this.#setStatus(matchingPlays.length === 0
        ? 'Aucune pièce de la sélection ne correspond. Essayez les autres onglets.'
        : `${matchingPlays.length} captation(s) intégrale(s), publiées par les théâtres et compagnies eux-mêmes.`);
    }

    #showFavorites() {
      const matchingFavorites = this.#library.listFavorites()
        .filter((play) => matchesSearchText(play, this.#state.searchText));

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
