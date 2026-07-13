/* Shared event card renderer, navigation, and saved-event bookmarks */
(function (global) {
  var DCEvents = global.DCEvents;
  var SAVED_STORAGE_KEY = 'dc_saved_events';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectBookmarkStyles() {
    if (document.getElementById('dc-bookmark-styles')) return;
    var style = document.createElement('style');
    style.id = 'dc-bookmark-styles';
    style.textContent =
      '.event-card__venue,.event-card__time{margin:0;}' +
      '.event-card__bookmark.is-saved{background:#FFE082;border:none;color:#448AFF;}' +
      '.event-card__bookmark.is-saved svg{fill:currentColor;stroke:currentColor;}';
    document.head.appendChild(style);
  }

  function getSavedIds() {
    try {
      var raw = localStorage.getItem(SAVED_STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (e) {
      return [];
    }
  }

  function setSavedIds(ids) {
    localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent('dc-saved-changed'));
  }

  function isEventSaved(id) {
    return getSavedIds().indexOf(String(id)) !== -1;
  }

  function toggleSaved(id) {
    var sid = String(id);
    var ids = getSavedIds();
    var index = ids.indexOf(sid);
    if (index === -1) {
      ids.push(sid);
    } else {
      ids.splice(index, 1);
    }
    setSavedIds(ids);
  }

  function syncBookmarkButton(btn, id) {
    if (!btn) return;
    var saved = isEventSaved(id);
    btn.classList.toggle('is-saved', saved);
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
    btn.setAttribute('aria-label', saved ? 'Remove from saved events' : 'Save event');
  }

  function initBookmarkButton(btn, id) {
    syncBookmarkButton(btn, id);
    btn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleSaved(id);
      syncBookmarkButton(btn, id);
    });
  }

  function toISODate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function classifyEventDate(dateStr) {
    var todayStr = toISODate(new Date());
    if (dateStr === todayStr) return 'today';
    if (dateStr > todayStr) return 'upcoming';
    return 'past';
  }

  function getSavedEventsByTiming(timing, limit) {
    var events = [];
    getSavedIds().forEach(function (id) {
      var event = DCEvents.getEventById(id);
      if (event && classifyEventDate(event.date) === timing) {
        events.push(event);
      }
    });

    events.sort(function (a, b) {
      if (timing === 'past') return b.date.localeCompare(a.date);
      return a.date.localeCompare(b.date);
    });

    if (typeof limit === 'number') return events.slice(0, limit);
    return events;
  }

  function createEventCard(event, options) {
    options = options || {};
    var detailContext = options.detailContext || 'joined';
    var parts = DCEvents.formatDateParts(event.date);
    var article = document.createElement('article');
    article.className = 'event-card';
    article.setAttribute('data-event-id', String(event.id));
    article.setAttribute('data-detail-context', detailContext);
    article.setAttribute('tabindex', '0');
    article.setAttribute('role', 'link');
    article.setAttribute('aria-label', 'View ' + event.name);

    article.innerHTML =
      '<div class="event-card__media">' +
        '<button type="button" class="event-card__bookmark" data-event-id="' + escapeHtml(String(event.id)) + '" aria-label="Save event">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="event-card__body">' +
        '<div class="event-card__date">' +
          '<span class="event-card__date-month">' + escapeHtml(parts.month) + '</span>' +
          '<span class="event-card__date-day">' + escapeHtml(parts.day) + '</span>' +
          '<span class="event-card__date-year">' + escapeHtml(parts.year) + '</span>' +
        '</div>' +
        '<div class="event-card__info">' +
          '<h3 class="event-card__name">' + escapeHtml(event.name) + '</h3>' +
          '<p class="event-card__venue">' + escapeHtml(event.venue) + '</p>' +
          '<p class="event-card__time">' + escapeHtml(event.time) + '</p>' +
        '</div>' +
      '</div>';

    initBookmarkButton(article.querySelector('.event-card__bookmark'), event.id);
    attachCardNavigation(article, event.id, detailContext);
    return article;
  }

  function navigateToEvent(id, context) {
    window.location.href = DCEvents.getEventDetailUrl(id, context || 'joined');
  }

  function attachCardNavigation(card, id, context) {
    var detailContext = context || card.getAttribute('data-detail-context') || 'joined';

    card.addEventListener('click', function (event) {
      if (event.target.closest('.event-card__bookmark')) {
        event.stopPropagation();
        return;
      }
      navigateToEvent(id, detailContext);
    });

    card.addEventListener('keydown', function (event) {
      if (event.target.closest('.event-card__bookmark')) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        navigateToEvent(id, detailContext);
      }
    });
  }

  function fillContainer(container, filter) {
    var root = typeof container === 'string' ? document.getElementById(container) : container;
    if (!root) return;

    var detailContext = filter.detailContext || 'joined';
    var events = [];
    if (filter.category) {
      events = DCEvents.getEventsByCategory(filter.category, filter.limit);
    } else if (filter.ids) {
      filter.ids.forEach(function (id) {
        var event = DCEvents.getEventById(id);
        if (event) events.push(event);
      });
    }

    root.innerHTML = '';
    events.forEach(function (event) {
      root.appendChild(createEventCard(event, { detailContext: detailContext }));
    });
  }

  function fillSavedContainer(container, filter) {
    var root = typeof container === 'string' ? document.getElementById(container) : container;
    if (!root) return;

    var events = getSavedEventsByTiming(filter.timing, filter.limit);
    var detailContext = filter.detailContext || 'explore';

    root.innerHTML = '';
    events.forEach(function (event) {
      root.appendChild(createEventCard(event, { detailContext: detailContext }));
    });
  }

  function initCardLinks(root) {
    var scope = root || document;
    var cards = scope.querySelectorAll('.event-card');

    cards.forEach(function (card, index) {
      if (card.getAttribute('data-event-id')) {
        attachCardNavigation(
          card,
          card.getAttribute('data-event-id'),
          card.getAttribute('data-detail-context') || 'joined'
        );
        var bookmark = card.querySelector('.event-card__bookmark');
        if (bookmark) initBookmarkButton(bookmark, card.getAttribute('data-event-id'));
        return;
      }

      var fallbackId = card.getAttribute('data-fallback-id');
      if (!fallbackId && cards.length === 1) fallbackId = '1';
      if (!fallbackId) fallbackId = String(index + 1);

      card.setAttribute('data-event-id', fallbackId);
      attachCardNavigation(card, fallbackId, card.getAttribute('data-detail-context') || 'joined');
    });
  }

  injectBookmarkStyles();

  DCEvents.createEventCard = createEventCard;
  DCEvents.fillContainer = fillContainer;
  DCEvents.fillSavedContainer = fillSavedContainer;
  DCEvents.initCardLinks = initCardLinks;
  DCEvents.navigateToEvent = navigateToEvent;
  DCEvents.getSavedIds = getSavedIds;
  DCEvents.isEventSaved = isEventSaved;
  DCEvents.toggleSaved = toggleSaved;
})(window);
