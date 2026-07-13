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

    var progressBar = document.getElementById('rfid-progress-bar');
    if (progressBar) {
      progressBar.style.width = Math.min(100, Math.max(0, rfid.progress)) + '%';
    }

    renderRfidLogs(rfid);
  }

  DCEvents.renderAttendanceDetails = renderAttendanceDetails;
})(window);
