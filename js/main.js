import { CATEGORIES, EXTERNAL_LINKS, SEARCH_DEBOUNCE_MS } from './config.js';
import { searchPlays } from './archiveApi.js';
import { PersonalLibrary } from './personalLibrary.js';
import { ResultsView } from './ui/resultsView.js';
import { PlayerDialog } from './ui/playerDialog.js';
import { debounce, isAbortError } from './utils.js';

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
