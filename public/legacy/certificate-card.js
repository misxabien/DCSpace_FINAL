/* Certificate card renderer */
(function (global) {
  var DCCertificates = global.DCCertificates;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function createCertificateCard(cert) {
    var article = document.createElement('article');
    article.className = 'cert-card';
    article.setAttribute('tabindex', '0');
    article.setAttribute('role', 'button');
    article.setAttribute('aria-label', cert.name + ' for ' + cert.eventName);
    if (cert.id) article.setAttribute('data-cert-id', String(cert.id));
    if (cert.downloadUrl) article.setAttribute('data-download-url', String(cert.downloadUrl));

    article.innerHTML =
      '<div class="cert-card__preview" aria-hidden="true"></div>' +
      '<div class="cert-card__body">' +
        '<div class="cert-card__icon" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<circle cx="12" cy="8" r="6"/>' +
            '<path d="M8.5 14.5L7 22l5-3 5 3-1.5-7.5"/>' +
          '</svg>' +
        '</div>' +
        '<div class="cert-card__info">' +
          '<h3 class="cert-card__name">' + escapeHtml(cert.name) + '</h3>' +
          '<p class="cert-card__event">' + escapeHtml(cert.eventName) + '</p>' +
          '<p class="cert-card__date">Date Issued: ' + escapeHtml(cert.dateIssued) + '</p>' +
        '</div>' +
      '</div>';

    return article;
  }

  function openCertificateDownload(card) {
    var url = card.getAttribute('data-download-url');
    if (!url && card.getAttribute('data-cert-id')) {
      url = '/api/user/certificates/' + encodeURIComponent(card.getAttribute('data-cert-id')) + '/download';
    }
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function wireCertificateCards(root) {
    if (!root || root.dataset.dcCertWired === '1') return;
    root.dataset.dcCertWired = '1';
    root.addEventListener('click', function (event) {
      var card = event.target.closest('.cert-card');
      if (!card || !root.contains(card)) return;
      openCertificateDownload(card);
    });
    root.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var card = event.target.closest('.cert-card');
      if (!card || !root.contains(card)) return;
      event.preventDefault();
      openCertificateDownload(card);
    });
  }

  function injectEmptyStateStyles() {
    /* Styles live in /empty-state.css (loaded from app layout). */
  }

  var EMPTY_STATE_ICON = '/empty-state.svg';

  function createEmptyState() {
    injectEmptyStateStyles();
    var emptyState = document.createElement('div');
    emptyState.className = 'dc-empty-state dc-empty-state--compact dc-empty-state--certificates';
    emptyState.setAttribute('role', 'status');
    emptyState.innerHTML =
      '<img class="dc-empty-state__icon" src="' + EMPTY_STATE_ICON + '" width="160" height="161" alt="" aria-hidden="true" />' +
      '<h3 class="dc-empty-state__title">No certificates yet.</h3>' +
      '<p class="dc-empty-state__description">Certificates you earn from completed events will appear here.</p>';
    return emptyState;
  }

  function syncSectionSeeMore(root, visible) {
    if (!root) return;
    var previous = root.previousElementSibling;
    var head =
      previous && previous.classList.contains('section-head')
        ? previous
        : root.parentElement
          ? root.parentElement.querySelector('.section-head')
          : null;
    if (!head) return;
    var more = head.querySelector('.section-head__more');
    if (!more) return;
    if (visible) {
      more.hidden = false;
      more.removeAttribute('hidden');
      more.style.display = '';
    } else {
      more.hidden = true;
      more.setAttribute('hidden', '');
      more.style.display = 'none';
    }
  }

  function fillCertificateContainer(container, filter, limit) {
    var root = typeof container === 'string' ? document.getElementById(container) : container;
    if (!root || !DCCertificates) return;

    var category = typeof filter === 'string' ? filter : (filter && filter.category) || '';
    var max = typeof filter === 'string' ? limit : (filter && filter.limit);
    var allCerts = DCCertificates.getCertificatesByCategory(category);
    var totalCount = allCerts.length;
    var certs =
      typeof max === 'number' ? allCerts.slice(0, max) : allCerts.slice();

    root.innerHTML = '';
    wireCertificateCards(root);
    if (!certs.length) {
      root.appendChild(createEmptyState());
      syncSectionSeeMore(root, false);
      return;
    }
    certs.forEach(function (cert) {
      root.appendChild(createCertificateCard(cert));
    });
    syncSectionSeeMore(root, totalCount > (typeof max === 'number' ? max : 2));
  }

  global.DCCertificates = DCCertificates || {};
  DCCertificates.createCertificateCard = createCertificateCard;
  DCCertificates.fillCertificateContainer = fillCertificateContainer;
})(window);
