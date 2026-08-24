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
    if (document.getElementById('dc-empty-state-styles')) return;
    var style = document.createElement('style');
    style.id = 'dc-empty-state-styles';
    style.textContent =
      '.dc-empty-state{grid-column:1/-1;width:100%;min-height:min(360px,calc(100vh - 300px));display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto;padding:40px 24px 48px;text-align:center;color:#b7aa89;}' +
      '.dc-empty-state--compact{min-height:240px;padding:28px 16px 36px;}' +
      '.dc-empty-state__icon{width:140px;height:140px;margin:0 auto 16px;display:block;}' +
      '.dc-empty-state--compact .dc-empty-state__icon{width:110px;height:110px;}' +
      '.dc-empty-state__title{margin:0 auto 8px;max-width:680px;color:#b1a483;font-size:clamp(1.25rem,2vw,1.65rem);font-weight:600;line-height:1.3;text-align:center;}' +
      '.dc-empty-state__description{max-width:640px;margin:0 auto;color:#b7aa89;font-size:clamp(0.95rem,1.4vw,1.05rem);font-weight:500;line-height:1.45;}';
    document.head.appendChild(style);
  }

  function createEmptyState(title, description) {
    injectEmptyStateStyles();
    var emptyState = document.createElement('div');
    emptyState.className = 'dc-empty-state dc-empty-state--compact';
    emptyState.setAttribute('role', 'status');
    emptyState.innerHTML =
      '<img class="dc-empty-state__icon" src="/no-event.svg" width="160" height="160" alt="" aria-hidden="true" />' +
      '<h3 class="dc-empty-state__title">' + escapeHtml(title) + '</h3>' +
      '<p class="dc-empty-state__description">' + escapeHtml(description) + '</p>';
    return emptyState;
  }

  function fillCertificateContainer(container, filter, limit) {
    var root = typeof container === 'string' ? document.getElementById(container) : container;
    if (!root || !DCCertificates) return;

    var category = typeof filter === 'string' ? filter : (filter && filter.category) || '';
    var max = typeof filter === 'string' ? limit : (filter && filter.limit);
    var certs = DCCertificates.getCertificatesByCategory(category, max);

    root.innerHTML = '';
    wireCertificateCards(root);
    if (!certs.length) {
      root.appendChild(
        createEmptyState(
          'No certificates yet.',
          'Certificates you earn from completed events will appear here.'
        )
      );
      return;
    }
    certs.forEach(function (cert) {
      root.appendChild(createCertificateCard(cert));
    });
  }

  global.DCCertificates = DCCertificates || {};
  DCCertificates.createCertificateCard = createCertificateCard;
  DCCertificates.fillCertificateContainer = fillCertificateContainer;
})(window);
