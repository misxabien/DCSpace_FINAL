/* Event details page renderer */
(function (global) {
  var DCEvents = global.DCEvents;

  var STATUS_LABELS = {
    joined: 'You are registered for this event',
    pending: 'Pending File Submission Approval',
    rejected: 'File Submission Rejected',
    cancelled: 'Event Cancelled',
    postponed: 'Event Postponed',
    passed: 'Event has passed',
    open: ''
  };

  var ACTION_CONFIG = {
    joined: { text: 'You Are Registered', variant: 'joined', disabled: true },
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

  function renderActionButton(status, event, id) {
    var actionBtn = document.getElementById('detail-action');
    if (!actionBtn) return;

    var config = ACTION_CONFIG[status];
    if (!config) {
      actionBtn.hidden = true;
      actionBtn.onclick = null;
      return;
    }

    actionBtn.hidden = false;
    actionBtn.textContent = config.text;
    actionBtn.className = 'detail-action detail-action--' + config.variant;
    actionBtn.disabled = config.disabled;
    actionBtn.onclick = function () {
      if (status === 'open') {
        if (event.requiresFiles) {
          window.location.href = DCEvents.getEventSubmitUrl(id);
          return;
        }
        window.dispatchEvent(
          new CustomEvent('dc-join-event', {
            detail: { eventId: id, eventTitle: event.name }
          })
        );
        return;
      }
      if (status === 'passed') {
        window.location.href =
          '/feedback/sign?eventId=' + encodeURIComponent(id) +
          '&eventTitle=' + encodeURIComponent(event.name || '');
      }
    };
  }

  function renderEventDetails() {
    var id = getQueryParam('id') || '';
    var event = DCEvents.getEventById(id);

    if (!event) {
      document.body.classList.remove('detail-page--missing');
      setText('detail-title', 'Loading event…');
      setText('detail-name', 'Loading…');
      toggleBlock('detail-action', false);
      return;
    }

    document.body.classList.remove('detail-page--missing');
    DCEvents.renderDetailContent(event);

    var page = document.querySelector('.detail-page');
    if (page) page.setAttribute('data-status', event.status);

    var statusText = STATUS_LABELS[event.status] || '';
    setText('detail-status', statusText);
    toggleBlock('detail-status-wrap', Boolean(statusText));

    toggleBlock('detail-files-approved', event.status === 'joined' && event.requiresFiles && event.filesApproved);
    toggleBlock('detail-files-rejected', event.status === 'rejected');
    toggleBlock('detail-files-required', event.requiresFiles && event.status !== 'joined' && event.status !== 'rejected');

    renderActionButton(event.status, event, id);

    toggleBlock('detail-footer-cancelled', event.status === 'cancelled');
    toggleBlock('detail-footer-postponed', event.status === 'postponed');
    toggleBlock('detail-rejection-note', event.status === 'cancelled' || event.status === 'postponed' || event.status === 'rejected');
  }

  DCEvents.renderEventDetails = renderEventDetails;
})(window);
