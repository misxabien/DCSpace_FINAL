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

  function renderActionButton(status) {
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
  }

  function renderEventDetails() {
    var id = getQueryParam('id') || '1';
    var event = DCEvents.getEventById(id);

    if (!event) {
      document.body.classList.add('detail-page--missing');
      setText('detail-title', 'Event Not Found');
      toggleBlock('detail-action', false);
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

    var statusText = STATUS_LABELS[event.status] || '';
    setText('detail-status', statusText);
    toggleBlock('detail-status-wrap', Boolean(statusText));

    toggleBlock('detail-files-approved', event.status === 'joined' && event.requiresFiles && event.filesApproved);
    toggleBlock('detail-files-rejected', event.status === 'rejected');
    toggleBlock('detail-files-required', event.requiresFiles && event.status !== 'joined' && event.status !== 'rejected');

    renderActionButton(event.status);

    toggleBlock('detail-footer-cancelled', event.status === 'cancelled');
    toggleBlock('detail-footer-postponed', event.status === 'postponed');
    toggleBlock('detail-rejection-note', event.status === 'cancelled' || event.status === 'postponed' || event.status === 'rejected');
  }

  DCEvents.renderEventDetails = renderEventDetails;
})(window);
