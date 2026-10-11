export const PAGE_SIZE = 24;
export const SEARCH_DEBOUNCE_MS = 400;

// Requêtes Lucene d'Internet Archive, ajustées à la main : les sujets y sont saisis
// librement par les contributeurs, d'où les nombreuses variantes orthographiques.
export const CATEGORIES = [
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

export const EXTERNAL_LINKS = [
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
