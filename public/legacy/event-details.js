/* Event details page renderer */
(function (global) {
  var DCEvents = global.DCEvents;

  var STATUS_LABELS = {
    joined: '',
    pending: 'Pending File Submission Approval',
    rejected: 'File Submission Rejected',
    cancelled: 'Event Cancelled',
    postponed: 'Event Postponed',
    passed: 'Event has passed',
    open: ''
  };

  var ACTION_CONFIG = {
    joined: { text: 'Already Joined this Event', variant: 'joined', disabled: true },
    pending: { text: 'Registration Pending', variant: 'pending', disabled: true },
    passed: { text: 'Submit Feedback', variant: 'feedback', disabled: false },
    open: { text: 'Register for Event', variant: 'register', disabled: false }
  };

  function getQueryParam(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function toggleBlock(id, show) {
    var el = document.getElementById(id);
    if (el) el.hidden = !show;
  }

  function fillSectionParagraphs(headingText, paragraphs) {
    var sections = document.querySelectorAll('.detail-section');
    sections.forEach(function (section) {
      var h3 = section.querySelector('h3');
      if (!h3 || h3.textContent !== headingText) return;
      var nodes = Array.from(section.querySelectorAll('p'));
      var anchor = section.querySelector('.detail-types, .detail-list');
      paragraphs.forEach(function (text, index) {
        var paragraph = nodes[index];
        if (!paragraph) {
          paragraph = document.createElement('p');
          if (anchor) section.insertBefore(paragraph, anchor);
          else section.appendChild(paragraph);
        }
        paragraph.textContent = text;
        paragraph.hidden = false;
      });
      nodes.forEach(function (paragraph, index) {
        if (index >= paragraphs.length) paragraph.hidden = true;
      });
    });
  }

  function splitParagraphs(value) {
    return String(value || '')
      .split(/\n+/)
      .map(function (part) { return part.trim(); })
      .filter(Boolean);
  }

  function renderActionButton(status, event) {
    var actionBtn = document.getElementById('detail-action');
    if (!actionBtn) return;

    var config = ACTION_CONFIG[status];
    if (!config) {
      actionBtn.hidden = true;
      return;
    }

    actionBtn.hidden = false;
    actionBtn.textContent = config.text;
    actionBtn.className = 'detail-action detail-action--' + config.variant;
    actionBtn.disabled = config.disabled;
    actionBtn.onclick = function () {
      if (config.variant === 'register') {
        if (event && event.requiresFiles) {
          window.location.href = DCEvents.getEventSubmitUrl(event.id);
          return;
        }
        window.dispatchEvent(new CustomEvent('dc-join-event', {
          detail: { eventId: String(event && event.id), eventTitle: event && event.name }
        }));
        return;
      }
      if (config.variant === 'feedback') {
        window.location.href = '/feedback/sign';
      }
    };
  }

  function renderEventDetails() {
    var id = getQueryParam('id') || '1';
    var event = DCEvents.getEventById(id);

    if (!event) {
      document.body.classList.add('detail-page--missing');
      setText('detail-title', 'Event Not Found');
      toggleBlock('detail-action', false);
      if (DCEvents.bindDetailBack) DCEvents.bindDetailBack('/home');
      return;
    }

    var parts = DCEvents.formatDateParts(event.date);
    var page = document.querySelector('.detail-page');
    if (page) page.setAttribute('data-status', event.status);

    document.title = 'DC Space — ' + event.name;
    setText('detail-title', event.name);
    setText('detail-month', parts.month);
    setText('detail-day', parts.day);
    setText('detail-year', parts.year);
    setText('detail-name', event.name);
    setText('detail-venue', event.venue);
    setText('detail-time', event.time);
    setText('detail-venue-type-label', 'Venue Type (' + event.venueType + ')');
    setText('detail-event-type-label', 'Event Type (' + event.eventType + ')');
    setText('detail-organization', event.organization);
    setText('detail-course', event.course);
    setText('detail-department', event.department);
    setText('detail-attendance', event.attendanceRequired);
    setText('detail-grace', event.gracePeriod);

    fillSectionParagraphs(
      'Event Announcements',
      splitParagraphs(event.announcements).length
        ? splitParagraphs(event.announcements)
        : ['No announcements yet.']
    );
    fillSectionParagraphs(
      'Event Description',
      splitParagraphs(event.description).length
        ? splitParagraphs(event.description)
        : ['No description provided.']
    );

    var requiredFiles = Array.isArray(event.requiredFiles) ? event.requiredFiles : [];
    if (requiredFiles.length) {
      var filesRequiredEl = document.getElementById('detail-files-required');
      if (filesRequiredEl) {
        filesRequiredEl.innerHTML =
          '<svg viewBox="0 0 24 24" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>' +
          'Required File(s): ' + requiredFiles.join(', ');
      }
    }

    var statusText = STATUS_LABELS[event.status] || '';
    setText('detail-status', statusText);
    toggleBlock('detail-status-wrap', Boolean(statusText));

    toggleBlock('detail-files-approved', event.status === 'joined' && event.requiresFiles && event.filesApproved);
    toggleBlock('detail-files-rejected', event.status === 'rejected');
    toggleBlock('detail-files-required', event.requiresFiles && event.status !== 'joined' && event.status !== 'rejected');

    renderActionButton(event.status, event);

    toggleBlock('detail-footer-cancelled', event.status === 'cancelled');
    toggleBlock('detail-footer-postponed', event.status === 'postponed');
    toggleBlock('detail-rejection-note', event.status === 'cancelled' || event.status === 'postponed' || event.status === 'rejected');

    if (DCEvents.bindDetailSaveButton) {
      DCEvents.bindDetailSaveButton(event.id);
    }
    if (DCEvents.bindDetailBack) {
      DCEvents.bindDetailBack('/home');
    }
  }

  DCEvents.renderEventDetails = renderEventDetails;
})(window);
