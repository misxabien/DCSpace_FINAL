/* Event file submission page renderer */
(function (global) {
  var DCEvents = global.DCEvents;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getQueryParam(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function renderFileRows(event) {
    var list = document.getElementById('submit-file-list');
    if (!list) return;

    var files = event.requiredFiles && event.requiredFiles.length
      ? event.requiredFiles
      : ["Parent's Consent Form"];

    list.innerHTML = files.map(function (fileName, index) {
      return (
        '<div class="submit-file-row">' +
          '<div class="submit-file-row__info">' +
            '<p class="submit-file-row__name">' + escapeHtml(fileName) + '</p>' +
            '<p class="submit-file-row__hint">Files must be in a viewable format, such as PNG, JPEG, PDF, or other supported types.</p>' +
          '</div>' +
          '<label class="submit-file-row__upload" aria-label="Upload ' + escapeHtml(fileName) + '">' +
            '<input type="file" class="submit-file-row__input" accept=".png,.jpg,.jpeg,.pdf" data-file-index="' + index + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
              '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>' +
              '<path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3"/>' +
            '</svg>' +
          '</label>' +
        '</div>'
      );
    }).join('');
  }

  function renderSubmitPage() {
    var id = getQueryParam('id') || '17';
    var event = DCEvents.getEventById(id);

    if (!event) {
      document.body.classList.add('detail-page--missing');
      setText('detail-title', 'Event Not Found');
      toggleBlock('submit-action', false);
      return;
    }

    var parts = DCEvents.formatDateParts(event.date);

    document.title = 'DC Space — Submit Files';
    setText('detail-title', event.name);
    setText('detail-month', parts.month);
    setText('detail-day', parts.day);
    setText('detail-year', parts.year);
    setText('detail-name', event.name);
    setText('detail-venue', event.venue);
    setText('detail-time', event.time);

    renderFileRows(event);

    var submitBtn = document.getElementById('submit-action');
    if (!submitBtn) return;

    submitBtn.onclick = function () {
      submitBtn.textContent = 'Registration Pending';
      submitBtn.disabled = true;
      submitBtn.className = 'detail-action detail-action--pending';
    };
  }

  function toggleBlock(id, show) {
    var el = document.getElementById(id);
    if (el) el.hidden = !show;
  }

  DCEvents.renderSubmitPage = renderSubmitPage;
})(window);
