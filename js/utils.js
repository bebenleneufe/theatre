export function debounce(callback, delayMs) {
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

export function escapeLuceneTerm(rawTerm) {
  return rawTerm.replace(LUCENE_SPECIAL_CHARACTERS, '\\$&');
}

export function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function firstValue(fieldValue) {
  return Array.isArray(fieldValue) ? fieldValue[0] : fieldValue;
}
