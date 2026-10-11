import { thumbnailUrl } from '../archiveApi.js';

export class ResultsView {
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
