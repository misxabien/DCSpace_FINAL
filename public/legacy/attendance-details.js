/* Attendance event details page with RFID logs */
(function (global) {
  var DCEvents = global.DCEvents;
  var LOGS_PER_PAGE = 10;
  var sortAscending = true;
  var currentPage = 1;
  var cachedLogs = [];

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

  function sortedLogs(logs) {
    var copy = logs.slice();
    copy.sort(function (a, b) {
      var aKey = String(a.tapIn || a.tapOut || '');
      var bKey = String(b.tapIn || b.tapOut || '');
      if (sortAscending) return aKey.localeCompare(bKey);
      return bKey.localeCompare(aKey);
    });
    return copy;
  }

  function renderRfidLogs(rfid) {
    var tbody = document.getElementById('rfid-log-body');
    if (!tbody) return;

    var logs = (rfid && rfid.logs) ? rfid.logs.filter(function (row) {
      return row && (row.tapIn !== '—' || row.tapOut !== '—');
    }) : [];

    cachedLogs = logs;
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:#94a3b8;padding:20px;">No tap in / tap out records yet.</td></tr>';
      setText('rfid-page', 'Page 0 of 0');
      var pagination = document.querySelector('.rfid-pagination');
      if (pagination) pagination.hidden = true;
      return;
    }

    var ordered = sortedLogs(logs);
    var totalPages = Math.max(1, Math.ceil(ordered.length / LOGS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    var start = (currentPage - 1) * LOGS_PER_PAGE;
    var pageRows = ordered.slice(start, start + LOGS_PER_PAGE);

    tbody.innerHTML = pageRows.map(function (row) {
      return (
        '<tr>' +
          '<td>' + escapeHtml(row.tapIn || '—') + '</td>' +
          '<td>' + escapeHtml(row.tapOut || '—') + '</td>' +
        '</tr>'
      );
    }).join('');

    setText('rfid-page', 'Page ' + currentPage + ' of ' + totalPages);

    var paginationEl = document.querySelector('.rfid-pagination');
    if (paginationEl) {
      paginationEl.hidden = totalPages <= 1;
      var prevBtn = paginationEl.querySelector('.rfid-pagination__btn:first-child');
      var nextBtn = paginationEl.querySelector('.rfid-pagination__btn:last-child');
      if (prevBtn) prevBtn.disabled = currentPage <= 1;
      if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    }
  }

  function wireSortButtons() {
    var host = document.querySelector('.rfid-sort');
    if (!host || host.dataset.dcWired === '1') return;
    host.dataset.dcWired = '1';

    var buttons = host.querySelectorAll('.rfid-sort__btn');
    buttons.forEach(function (btn, index) {
      btn.addEventListener('click', function () {
        sortAscending = index === 0;
        buttons.forEach(function (other, otherIndex) {
          var active = otherIndex === index;
          other.classList.toggle('is-active', active);
          other.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        currentPage = 1;
        renderRfidLogs({ logs: cachedLogs });
      });
    });
  }

  function wirePagination() {
    var pagination = document.querySelector('.rfid-pagination');
    if (!pagination || pagination.dataset.dcWired === '1') return;
    pagination.dataset.dcWired = '1';

    var buttons = pagination.querySelectorAll('.rfid-pagination__btn');
    var prevBtn = buttons[0];
    var nextBtn = buttons[1];

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        if (currentPage > 1) {
          currentPage -= 1;
          renderRfidLogs({ logs: cachedLogs });
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        var totalPages = Math.max(1, Math.ceil(cachedLogs.length / LOGS_PER_PAGE));
        if (currentPage < totalPages) {
          currentPage += 1;
          renderRfidLogs({ logs: cachedLogs });
        }
      });
    }
  }

  function updateRfidNote(rfid, event) {
    var note = document.getElementById('rfid-note');
    if (!note) return;

    note.classList.remove('is-complete', 'is-incomplete');
    var progressEl = document.getElementById('rfid-progress');
    if (progressEl) progressEl.classList.remove('is-complete', 'is-incomplete');

    if (rfid.qualified) {
      note.textContent =
        'Certificate earned! You fulfilled the minimum attendance time requirement.';
      note.classList.add('is-complete');
      if (progressEl) progressEl.classList.add('is-complete');
      return;
    }

    if (rfid.openTapIn) {
      note.textContent =
        'You are currently tapped in. Tap out when you leave to record your session.';
      return;
    }

    var required = rfid.requiredMinutes || event?.attendanceRequired || '30 minutes';
    var minutes = rfid.attendanceMinutes || 0;
    if (minutes > 0) {
      note.textContent =
        'Attendance progress: ' + minutes + ' of ' + String(required).replace(/\D/g, '') +
        ' minutes recorded. Complete the requirement to receive your certificate.';
      note.classList.add('is-incomplete');
      if (progressEl) progressEl.classList.add('is-incomplete');
      return;
    }

    note.textContent =
      'Complete the attendance requirement (' + (event?.attendanceRequired || '30 minutes') +
      ') to receive your certificate.';
  }

  function renderAttendanceDetails() {
    var id = getQueryParam('id');
    if (!id) {
      document.body.classList.add('detail-page--missing');
      setText('detail-title', 'Event Not Found');
      setText('detail-name', 'Missing event id');
      return;
    }

    var event = DCEvents.getEventById(id);
    var rfid = DCEvents.getAttendanceRfid(id);

    if (!event) {
      document.body.classList.add('detail-page--missing');
      setText('detail-title', 'Loading event…');
      setText('detail-name', 'Loading…');
      return;
    }

    document.body.classList.remove('detail-page--missing');
    DCEvents.renderDetailContent(event);

    var statusWrap = document.getElementById('detail-status-wrap');
    if (statusWrap) statusWrap.hidden = true;

    var heroWrap = document.querySelector('.detail-hero');
    var heroImg = heroWrap ? heroWrap.querySelector('img') : null;
    if (heroWrap) {
      if (event.imageUrl && heroImg) {
        heroWrap.style.display = '';
        heroImg.src = event.imageUrl;
        heroImg.alt = event.name || 'Event';
      } else {
        heroWrap.style.display = 'none';
      }
    }

    // Keep metadata icons sized — never let large SVG paths fill the page.
    document.querySelectorAll(
      '.detail-page .detail-list__item > svg, .detail-page .detail-types svg, .detail-page .detail-note > svg'
    ).forEach(function (svg) {
      svg.setAttribute('width', '22');
      svg.setAttribute('height', '22');
      svg.style.width = '22px';
      svg.style.height = '22px';
      svg.style.maxWidth = '22px';
      svg.style.maxHeight = '22px';
      svg.style.flexShrink = '0';
    });

    setText('rfid-grace', rfid.graceRemaining || event.gracePeriod || '—');
    setText('rfid-progress', String(rfid.progress || 0) + '%');
    updateRfidNote(rfid, event);

    var progressBar = document.getElementById('rfid-progress-bar');
    if (progressBar) {
      var pct = Math.min(100, Math.max(0, Number(rfid.progress || 0)));
      progressBar.style.width = pct + '%';
      progressBar.classList.toggle('is-complete', Boolean(rfid.qualified || pct >= 100));
      progressBar.classList.toggle('is-incomplete', !rfid.qualified && pct < 100);
    }

    wireSortButtons();
    wirePagination();
    if (DCEvents.wireDetailActions) DCEvents.wireDetailActions(id);
    renderRfidLogs(rfid);

    var rfidSection = document.querySelector('.rfid-section');
    if (rfidSection) rfidSection.hidden = false;
  }

  DCEvents.renderAttendanceDetails = renderAttendanceDetails;
})(window);
