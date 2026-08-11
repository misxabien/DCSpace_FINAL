/* Attendance event details page with RFID logs */
(function (global) {
  var DCEvents = global.DCEvents;

  function getQueryParam(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderRfidLogs(rfid) {
    var tbody = document.getElementById('rfid-log-body');
    if (!tbody) return;

    tbody.innerHTML = rfid.logs.map(function (row) {
      return (
        '<tr>' +
          '<td>' + escapeHtml(row.tapIn) + '</td>' +
          '<td>' + escapeHtml(row.tapOut) + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function renderAttendanceDetails() {
    var id = getQueryParam('id') || '1';
    var event = DCEvents.getEventById(id);
    var rfid = DCEvents.getAttendanceRfid(id);

    if (!event) {
      document.body.classList.add('detail-page--missing');
      setText('detail-title', 'Event Not Found');
      return;
    }

    var parts = DCEvents.formatDateParts(event.date);

    document.title = 'DC Space — ' + event.name;
    setText('detail-title', event.name);
    setText('detail-month', parts.month);
    setText('detail-day', parts.day);
    setText('detail-year', parts.year);
    setText('detail-name', event.name);
    setText('detail-venue', event.venue);
    setText('detail-time', event.time);
    setText('rfid-grace', rfid.graceRemaining);
    setText('rfid-progress', String(rfid.progress) + '%');
    setText('rfid-page', 'Page ' + rfid.page.current + ' of ' + rfid.page.total);

    var progress = Number(rfid.progress);
    var complete = progress >= 100;
    var noProgress = progress <= 0;
    var incomplete = !complete && !noProgress;

    var progressLabel = document.getElementById('rfid-progress');
    if (progressLabel) {
      progressLabel.classList.toggle('is-complete', complete);
      progressLabel.classList.toggle('is-incomplete', incomplete);
      progressLabel.classList.toggle('is-pending', noProgress);
    }

    var progressBar = document.getElementById('rfid-progress-bar');
    if (progressBar) {
      progressBar.style.width = Math.min(100, Math.max(0, progress)) + '%';
      progressBar.classList.toggle('is-complete', complete);
      progressBar.classList.toggle('is-incomplete', incomplete);
      progressBar.classList.toggle('is-pending', noProgress);
    }

    var note = document.getElementById('rfid-note');
    if (note) {
      note.textContent = complete
        ? 'Certificate Earned! You fulfilled the minimum attendance time requirement.'
        : incomplete
          ? 'Unfortunately, you did not meet the minimum attendance requirement needed to receive a certificate.'
          : 'Complete the attendance requirement to receive your certificate.';
      note.classList.toggle('is-complete', complete);
      note.classList.toggle('is-incomplete', incomplete);
      note.classList.toggle('is-pending', noProgress);
    }

    renderRfidLogs(rfid);
  }

  DCEvents.renderAttendanceDetails = renderAttendanceDetails;
})(window);
