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
    midSurvey: { text: 'Answer Mid-Event Survey', variant: 'feedback', disabled: false },
    open: { text: 'Register for Event', variant: 'register', disabled: false }
  };

  /** Registered participants get the mid-event survey while live, post-event after. */
  function effectiveStatus(status, event) {
    var dbStatus = event && event.dbStatus;
    if (status === 'joined' && dbStatus === 'live') return 'midSurvey';
    if (status === 'joined' && dbStatus === 'completed') return 'passed';
    return status;
  }

  function feedbackUrl(id, event) {
    return '/feedback/sign?eventId=' + encodeURIComponent(id) +
      '&eventTitle=' + encodeURIComponent((event && event.name) || '');
  }

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

    status = effectiveStatus(status, event);
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
      if (status === 'passed' || status === 'midSurvey') {
        window.location.href = feedbackUrl(id, event);
      }
    };
  }

  /** Registered participants share photos when the organizer allows it. */
  function renderPhotoShare(event, id) {
    var actionBtn = document.getElementById('detail-action');
    var existing = document.getElementById('detail-photo-share');
    var allowed =
      event &&
      event.allowParticipantPhotos === true &&
      (event.dbStatus === 'live' || event.dbStatus === 'completed') &&
      (event.status === 'joined' || event.status === 'passed');
    if (!allowed || !actionBtn || !actionBtn.parentNode) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;

    var wrap = document.createElement('div');
    wrap.id = 'detail-photo-share';
    wrap.className = 'detail-photo-share';
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'detail-action detail-action--feedback';
    btn.textContent = 'Share Event Photo';
    btn.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (!file || file.type.indexOf('image/') !== 0) return;
      if (file.size > 5 * 1024 * 1024) {
        window.alert('Photo is too large (max 5 MB).');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        btn.disabled = true;
        btn.textContent = 'Uploading…';
        fetch('/api/user/events/' + encodeURIComponent(id) + '/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ dataUrl: String(reader.result || '') })
        })
          .then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
              window.alert(res.ok ? 'Photo shared with the organizer. Thank you!' : (data.error || 'Upload failed.'));
            });
          })
          .catch(function () { window.alert('Upload failed. Please try again.'); })
          .then(function () {
            btn.disabled = false;
            btn.textContent = 'Share Event Photo';
          });
      };
      reader.readAsDataURL(file);
    });
    wrap.appendChild(btn);
    wrap.appendChild(input);
    actionBtn.parentNode.insertBefore(wrap, actionBtn.nextSibling);
  }

  function renderEventDetails() {
    var id = getQueryParam('id') || '';
    var event = DCEvents.getEventById(id);

    if (!event) {
      document.body.classList.remove('detail-page--missing');
      setText('detail-title', 'Loading event…');
      setText('detail-name', 'Loading…');
      // Hide the design sample text (Lorem ipsum, Organization Name…) while the real event loads.
      ['detail-venue', 'detail-time', 'detail-organization', 'detail-course', 'detail-department', 'detail-attendance', 'detail-grace', 'detail-venue-type-label', 'detail-event-type-label'].forEach(function (fieldId) { setText(fieldId, '—'); });
      document.querySelectorAll('.detail-section p').forEach(function (p) { p.textContent = ''; });
      if (!id) {
        // Opened without choosing an event: go back to the list instead of showing sample content.
        window.location.replace('/events');
        return;
      }
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
    renderPhotoShare(event, id);

    toggleBlock('detail-footer-cancelled', event.status === 'cancelled');
    toggleBlock('detail-footer-postponed', event.status === 'postponed');
    toggleBlock('detail-rejection-note', event.status === 'cancelled' || event.status === 'postponed' || event.status === 'rejected');
  }

  DCEvents.renderEventDetails = renderEventDetails;
})(window);
