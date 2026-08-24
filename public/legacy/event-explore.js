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

    toggleBlock('detail-files-required', event.requiresFiles && event.status !== 'joined' && event.status !== 'pending');

    var actionBtn = document.getElementById('detail-action');
    if (!actionBtn) return;

    if (event.status === 'joined') {
      actionBtn.textContent = 'You Are Registered';
      actionBtn.className = 'detail-action detail-action--joined';
      actionBtn.disabled = true;
      actionBtn.hidden = false;
      actionBtn.onclick = null;
      var statusEl = document.getElementById('detail-status');
      var statusWrap = document.getElementById('detail-status-wrap');
      if (!statusWrap) {
        var page = document.querySelector('.detail-page');
        if (page) {
          statusWrap = document.createElement('div');
          statusWrap.id = 'detail-status-wrap';
          statusWrap.className = 'detail-status-wrap';
          statusWrap.innerHTML = '<p id="detail-status" class="detail-status"></p>';
          var actionWrap = page.querySelector('.detail-action-wrap');
          if (actionWrap) page.insertBefore(statusWrap, actionWrap);
          else page.appendChild(statusWrap);
          statusEl = statusWrap.querySelector('#detail-status');
        }
      }
      if (statusEl) statusEl.textContent = 'You are registered for this event';
      if (statusWrap) statusWrap.hidden = false;
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

    if (event.status === 'passed' || event.dbStatus === 'completed') {
      actionBtn.textContent = 'Submit Feedback';
      actionBtn.className = 'detail-action detail-action--feedback';
      actionBtn.disabled = false;
      actionBtn.hidden = false;
      actionBtn.onclick = function () {
        window.location.href =
          '/feedback/sign?eventId=' + encodeURIComponent(id) +
          '&eventTitle=' + encodeURIComponent(event.name || '');
      };
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

      window.dispatchEvent(
        new CustomEvent('dc-join-event', {
          detail: { eventId: id, eventTitle: event.name }
        })
      );
    };
  }

  DCEvents.renderExploreDetails = renderExploreDetails;
})(window);
