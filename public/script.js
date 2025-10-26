const form = document.querySelector('#proxy-form');
const urlInput = document.querySelector('#proxy-url');
const viewerSection = document.querySelector('#viewer-section');
const iframe = document.querySelector('#proxy-frame');
const currentUrlLabel = document.querySelector('#current-url');
const openNewTabButton = document.querySelector('#open-new-tab');

function buildProxyUrl(rawUrl) {
  const url = new URL(window.location.href);
  url.pathname = '/proxy';
  url.search = '';
  url.searchParams.set('url', rawUrl);
  return url.toString();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const rawUrl = urlInput.value.trim();
  if (!rawUrl) {
    return;
  }

  let proxiedUrl;
  try {
    const normalized = new URL(rawUrl);
    proxiedUrl = buildProxyUrl(normalized.toString());
  } catch (error) {
    alert('Enter a valid URL that includes the protocol, for example https://example.com');
    return;
  }

  viewerSection.hidden = false;
  currentUrlLabel.textContent = rawUrl;
  iframe.src = proxiedUrl;
  iframe.focus();
});

openNewTabButton.addEventListener('click', () => {
  const current = iframe.src;
  if (!current) return;
  window.open(current, '_blank');
});

iframe.addEventListener('load', () => {
  try {
    currentUrlLabel.textContent = iframe.contentWindow.location.href;
  } catch (error) {
    // Cross-origin access can fail; fall back to the original URL label.
  }
});
