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
      document.body.classList.add('detail-page--missing');
      setText('detail-title', 'Event Not Found');
      toggleBlock('detail-action', false);
      return;
    }

    DCEvents.renderDetailContent(event);

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

      window.dispatchEvent(
        new CustomEvent('dc-join-event', {
          detail: { eventId: id, eventTitle: event.name }
        })
      );
    };
  }

  DCEvents.renderExploreDetails = renderExploreDetails;
})(window);
