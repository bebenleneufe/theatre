import { detailsUrl, embedUrl } from '../archiveApi.js';

export class PlayerDialog {
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
