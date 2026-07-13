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

    toggleBlock('detail-files-required', event.requiresFiles);

    var actionBtn = document.getElementById('detail-action');
    if (!actionBtn) return;

    actionBtn.textContent = 'Join This Event';
    actionBtn.className = 'detail-action detail-action--join';
    actionBtn.disabled = false;
    actionBtn.hidden = false;

    actionBtn.onclick = function () {
      if (event.requiresFiles) {
        window.location.href = DCEvents.getEventSubmitUrl(id);
        return;
      }

      actionBtn.textContent = 'Registration Successful';
      actionBtn.disabled = true;
      actionBtn.className = 'detail-action detail-action--joined';
    };
  }

  DCEvents.renderExploreDetails = renderExploreDetails;
})(window);
