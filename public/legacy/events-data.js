/* Live event helpers — list is populated from MongoDB via StudentDataBridge. */
(function (global) {
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function formatDateParts(dateStr) {
    var date = new Date(String(dateStr) + 'T12:00:00');
    if (Number.isNaN(date.getTime())) {
      return { month: '—', day: '—', year: '—' };
    }
    return {
      month: MONTH_SHORT[date.getMonth()],
      day: String(date.getDate()).padStart(2, '0'),
      year: String(date.getFullYear())
    };
  }

  function eventList() {
    return global.DCEvents && Array.isArray(global.DCEvents.list) ? global.DCEvents.list : [];
  }

  function getEventById(id) {
    var sid = String(id);
    var list = eventList();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === sid) return list[i];
    }
    return null;
  }

  function getEventsByCategory(category, limit) {
    var list = eventList();
    var results = [];
    var joinedOnly = String(category || '').indexOf('joined-') === 0;
    for (var i = 0; i < list.length; i++) {
      var event = list[i];
      // Home / Events Joined: only events this user registered for.
      if (joinedOnly) {
        var hasJoinedTag = event.tags && event.tags.indexOf(category) !== -1;
        if (event.category === category || hasJoinedTag) {
          results.push(event);
        }
        continue;
      }
      if (event.category === category || (event.tags && event.tags.indexOf(category) !== -1)) {
        results.push(event);
      }
    }
    results.sort(function (a, b) {
      var dateA = String(a.date || '');
      var dateB = String(b.date || '');
      var isPast = category === 'joined-past' || category === 'past';
      if (isPast) return dateB.localeCompare(dateA);
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    if (typeof limit === 'number') return results.slice(0, limit);
    return results;
  }

  function getEventDetailUrl(id, context) {
    if (context === 'explore') {
      return '/events/explore?id=' + encodeURIComponent(id);
    }
    if (context === 'attendance') {
      return '/attendance/details?id=' + encodeURIComponent(id);
    }
    return '/events/details?id=' + encodeURIComponent(id);
  }

  function getEventSubmitUrl(id) {
    return '/events/submit?id=' + encodeURIComponent(id);
  }

  var DEFAULT_RFID = {
    graceRemaining: '00:00',
    progress: 0,
    logs: [
      { tapIn: '00:00 AM', tapOut: '00:00 PM' },
      { tapIn: '00:00 AM', tapOut: '00:00 PM' },
      { tapIn: '00:00 AM', tapOut: '00:00 PM' },
      { tapIn: '00:00 AM', tapOut: '00:00 PM' },
      { tapIn: '00:00 AM', tapOut: '00:00 PM' }
    ],
    page: { current: 0, total: 0 }
  };

  function getAttendanceRfid(id) {
    var store = (global.DCEvents && global.DCEvents.attendanceRfid) || {};
    var key = String(id);
    if (store[key]) return store[key];
    return DEFAULT_RFID;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function splitParagraphs(text) {
    return String(text || '')
      .split(/\n+/)
      .map(function (part) { return part.trim(); })
      .filter(Boolean);
  }

  function upsertEvent(event) {
    if (!event || !event.id || !global.DCEvents) return;
    var sid = String(event.id);
    var list = global.DCEvents.list || [];
    var next = [];
    var replaced = false;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === sid) {
        next.push(Object.assign({}, list[i], event));
        replaced = true;
      } else {
        next.push(list[i]);
      }
    }
    if (!replaced) next.unshift(event);
    global.DCEvents.list = next;
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value || '—';
  }

  function toggleBlock(id, show) {
    var el = document.getElementById(id);
    if (el) el.hidden = !show;
  }

  function fillSectionParagraphs(title, paragraphs, fallback) {
    var sections = document.querySelectorAll('.detail-section');
    var lines = paragraphs && paragraphs.length ? paragraphs : [fallback || 'None provided.'];
    for (var i = 0; i < sections.length; i++) {
      var h3 = sections[i].querySelector('h3');
      if (!h3 || h3.textContent.trim() !== title) continue;
      var keep = sections[i].querySelector('.detail-types, .detail-list');
      sections[i].querySelectorAll('p').forEach(function (node) { node.remove(); });
      var anchor = keep || h3.nextSibling;
      lines.forEach(function (line) {
        var p = document.createElement('p');
        p.textContent = line;
        if (keep) {
          sections[i].insertBefore(p, keep);
        } else if (anchor) {
          sections[i].insertBefore(p, anchor);
        } else {
          sections[i].appendChild(p);
        }
      });
      return;
    }
  }

  function ensureExtraSection(id, title) {
    var existing = document.getElementById(id);
    if (existing) return existing;
    var page = document.querySelector('.detail-page');
    if (!page) return null;
    var section = document.createElement('section');
    section.className = 'detail-section';
    section.id = id;
    section.innerHTML = '<h3>' + escapeHtml(title) + '</h3><div class="detail-list"></div>';
    var actionWrap = page.querySelector('.detail-action-wrap');
    if (actionWrap) {
      page.insertBefore(section, actionWrap);
    } else {
      page.appendChild(section);
    }
    return section;
  }

  function fillListSection(id, title, items, emptyLabel) {
    var values = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!values.length) return;
    var section = ensureExtraSection(id, title);
    if (!section) return;
    var list = section.querySelector('.detail-list');
    if (!list) return;
    list.innerHTML = values.map(function (item) {
      return '<div class="detail-list__item"><span>' + escapeHtml(item) + '</span></div>';
    }).join('');
  }

  function fillAttachments(event) {
    var files = Array.isArray(event.attachmentFiles) ? event.attachmentFiles : [];
    if (!files.length) return;
    var section = ensureExtraSection('detail-attachments-section', 'Event Files');
    if (!section) return;
    var list = section.querySelector('.detail-list');
    if (!list) return;
    list.innerHTML = files.map(function (file) {
      return '<div class="detail-list__item"><a href="' + escapeHtml(file.url) + '" target="_blank" rel="noopener">' +
        escapeHtml(file.label + ': ' + file.fileName) + '</a></div>';
    }).join('');
  }

  function renderDetailContent(event) {
    if (!event) return;

    var parts = formatDateParts(event.date);
    document.title = 'DC Space — ' + event.name;
    setText('detail-title', event.name);
    setText('detail-month', parts.month);
    setText('detail-day', parts.day);
    setText('detail-year', parts.year);
    setText('detail-name', event.name);
    setText('detail-venue', event.venue);
    setText('detail-time', event.time);
    setText('detail-venue-type-label', 'Venue Type (' + (event.venueType || 'On Campus') + ')');
    setText('detail-event-type-label', 'Event Type (' + (event.eventType || 'Event') + ')');
    setText('detail-organization', event.organization);
    setText('detail-course', event.course);
    setText('detail-department', event.department);
    setText('detail-attendance', event.attendanceRequired);
    setText('detail-grace', event.gracePeriod);

    fillSectionParagraphs('Event Announcements', splitParagraphs(event.announcements), 'No announcements yet.');
    fillSectionParagraphs('Event Description', splitParagraphs(event.description), 'No description provided.');

    fillListSection('detail-speakers-section', 'Speakers', event.speakers);
    fillListSection('detail-program-section', 'Program Flow', event.programActivities);
    fillListSection('detail-audience-section', 'Audience / Schools', event.audienceSchools);
    fillListSection('detail-collab-section', 'Collaborating Departments', event.collaboratingDepartments);
    fillAttachments(event);

    var heroImg = document.querySelector('.detail-hero img');
    if (heroImg && event.imageUrl) {
      heroImg.src = event.imageUrl;
      heroImg.loading = 'eager';
      heroImg.alt = event.name;
    }

    var filesRequired = document.getElementById('detail-files-required');
    if (filesRequired) {
      var label = 'Required File(s)';
      if (event.requiredFiles && event.requiredFiles.length) {
        label += ': ' + event.requiredFiles.join(', ');
      }
      filesRequired.textContent = label;
      toggleBlock('detail-files-required', Boolean(event.requiresFiles));
    }

    var rejectionNote = document.getElementById('detail-rejection-note');
    if (rejectionNote) {
      rejectionNote.textContent = event.reviewNote || 'No additional details provided.';
    }
  }

  global.DCEvents = {
    list: [],
    attendanceRfid: {},
    getEventById: getEventById,
    getEventsByCategory: getEventsByCategory,
    formatDateParts: formatDateParts,
    getEventDetailUrl: getEventDetailUrl,
    getEventSubmitUrl: getEventSubmitUrl,
    getAttendanceRfid: getAttendanceRfid,
    upsertEvent: upsertEvent,
    renderDetailContent: renderDetailContent
  };
})(window);
