import { PAGE_SIZE } from './config.js';
import { escapeLuceneTerm, firstValue } from './utils.js';

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

export async function searchPlays({ category, searchText, sort, page, signal }) {
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

export function thumbnailUrl(identifier) {
  return `${ARCHIVE_ORIGIN}/services/img/${encodeURIComponent(identifier)}`;
}

export function embedUrl(identifier) {
  return `${ARCHIVE_ORIGIN}/embed/${encodeURIComponent(identifier)}`;
}

export function detailsUrl(identifier) {
  return `${ARCHIVE_ORIGIN}/details/${encodeURIComponent(identifier)}`;
}
