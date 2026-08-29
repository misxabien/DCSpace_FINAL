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
    if (document.getElementById('dc-cert-empty-state-styles')) return;
    var style = document.createElement('style');
    style.id = 'dc-cert-empty-state-styles';
    style.textContent =
      '.dc-empty-state--certificates{grid-column:1/-1;width:100%;min-height:240px;display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto;padding:28px 16px 36px;text-align:center;}' +
      '.cert-grid:has(> .dc-empty-state--certificates){grid-template-columns:1fr !important;max-width:none !important;width:100%;justify-items:center;}' +
      '.dc-empty-state__icon--certificates{width:140px;height:auto;margin:0 auto 16px;display:block;}' +
      '.dc-empty-state--certificates .dc-empty-state__title{margin:0 auto 8px;max-width:680px;color:#b1a483;font-size:clamp(1.25rem,2vw,1.65rem);font-weight:600;line-height:1.3;text-align:center;}' +
      '.dc-empty-state--certificates .dc-empty-state__description{max-width:640px;margin:0 auto;color:#b7aa89;font-size:clamp(0.95rem,1.4vw,1.05rem);font-weight:500;line-height:1.45;}';
    document.head.appendChild(style);
  }

  function createEmptyState() {
    injectEmptyStateStyles();
    var emptyState = document.createElement('div');
    emptyState.className = 'dc-empty-state dc-empty-state--certificates';
    emptyState.setAttribute('role', 'status');
    emptyState.innerHTML =
      '<img class="dc-empty-state__icon dc-empty-state__icon--certificates" src="/no-certificates.svg" width="140" height="128" alt="" aria-hidden="true" />' +
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
