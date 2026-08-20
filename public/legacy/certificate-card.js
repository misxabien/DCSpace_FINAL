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
    if (cert.downloadUrl) article.setAttribute('data-download-url', cert.downloadUrl);

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

  function fillCertificateContainer(container, filter, limit) {
    var root = typeof container === 'string' ? document.getElementById(container) : container;
    if (!root || !DCCertificates) return;

    var category = typeof filter === 'string' ? filter : (filter && filter.category);
    var cap = typeof filter === 'string' ? limit : (filter && filter.limit);
    var certs = DCCertificates.getCertificatesByCategory(category, cap);

    root.innerHTML = '';
    certs.forEach(function (cert) {
      root.appendChild(createCertificateCard(cert));
    });
  }

  function openCertificate(card) {
    var url = card && card.getAttribute('data-download-url');
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  }

  document.addEventListener('click', function (event) {
    var card = event.target && event.target.closest
      ? event.target.closest('.cert-card[data-download-url]')
      : null;
    if (!card) return;
    openCertificate(card);
  }, true);

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var card = event.target && event.target.closest
      ? event.target.closest('.cert-card[data-download-url]')
      : null;
    if (!card) return;
    event.preventDefault();
    openCertificate(card);
  }, true);

  global.DCCertificates = DCCertificates || {};
  DCCertificates.createCertificateCard = createCertificateCard;
  DCCertificates.fillCertificateContainer = fillCertificateContainer;
})(window);
