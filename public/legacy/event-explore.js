/* Explore event details page renderer */
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

  function renderExploreDetails() {
    var id = getQueryParam('id') || '3';
    var event = DCEvents.getEventById(id);

    if (!event) {
      document.body.classList.add('detail-page--missing');
      setText('detail-title', 'Event Not Found');
      toggleBlock('detail-action', false);
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
    toggleBlock('detail-files-required', event.requiresFiles || requiredFiles.length > 0);
    if (requiredFiles.length) {
      var filesRequiredEl = document.getElementById('detail-files-required');
      if (filesRequiredEl) {
        filesRequiredEl.innerHTML =
          '<svg viewBox="0 0 24 24" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>' +
          'Required File(s): ' + requiredFiles.join(', ');
      }
    }

    if (DCEvents.bindDetailSaveButton) {
      DCEvents.bindDetailSaveButton(event.id);
    }
    if (DCEvents.bindDetailBack) {
      DCEvents.bindDetailBack('/events');
    }

    var actionBtn = document.getElementById('detail-action');
    if (!actionBtn) return;

    if (event.status === 'joined') {
      actionBtn.textContent = 'Registration Successful';
      actionBtn.className = 'detail-action detail-action--joined';
      actionBtn.disabled = true;
      actionBtn.hidden = false;
      actionBtn.onclick = null;
      return;
    }

    if (event.status === 'pending') {
      actionBtn.textContent = 'Registration Pending';
      actionBtn.className = 'detail-action detail-action--pending';
      actionBtn.disabled = true;
      actionBtn.hidden = false;
      actionBtn.onclick = null;
      return;
    }

    actionBtn.textContent = 'Join This Event';
    actionBtn.className = 'detail-action detail-action--join';
    actionBtn.disabled = false;
    actionBtn.hidden = false;

    actionBtn.onclick = function () {
      if (event.requiresFiles) {
        window.location.href = DCEvents.getEventSubmitUrl(id);
        return;
      }

      window.dispatchEvent(new CustomEvent('dc-join-event', {
        detail: { eventId: String(id), eventTitle: event.name }
      }));
    };
  }

  DCEvents.renderExploreDetails = renderExploreDetails;
})(window);
