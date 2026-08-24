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
      '.event-card__media{position:relative;overflow:hidden;}' +
      '.event-card__image{width:100%;height:100%;object-fit:cover;display:block;}' +
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

    var mediaHtml = '';
    if (event.imageUrl) {
      mediaHtml =
        '<img class="event-card__image" src="' + escapeHtml(String(event.imageUrl)) +
        '" alt="" loading="eager" decoding="async" fetchpriority="high" />';
    }

    article.innerHTML =
      '<div class="event-card__media">' +
        mediaHtml +
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
    var url = DCEvents.getEventDetailUrl(id, context || 'joined');
    if (typeof window.__dcNavigate === 'function') {
      window.__dcNavigate(url);
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent('dc-navigate', { detail: { href: url } }));
      return;
    } catch (e) {
      /* fall through */
    }
    window.location.assign(url);
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

  function injectEmptyStateStyles() {
    if (document.getElementById('dc-empty-state-styles')) return;
    var style = document.createElement('style');
    style.id = 'dc-empty-state-styles';
    style.textContent =
      '.dc-empty-state,.home-empty-state{grid-column:1/-1;width:100%;min-height:min(360px,calc(100vh - 300px));display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto;padding:40px 24px 48px;text-align:center;color:#b7aa89;}' +
      '.dc-empty-state--compact{min-height:240px;padding:28px 16px 36px;}' +
      '.dc-empty-state__icon,.home-empty-state__icon{width:140px;height:140px;margin:0 auto 16px;display:block;}' +
      '.dc-empty-state--compact .dc-empty-state__icon{width:110px;height:110px;}' +
      '.dc-empty-state__title,.home-empty-state__title{margin:0 auto 8px;max-width:680px;color:#b1a483;font-size:clamp(1.25rem,2vw,1.65rem);font-weight:600;line-height:1.3;text-align:center;}' +
      '.dc-empty-state__description,.home-empty-state__description{max-width:640px;margin:0 auto;color:#b7aa89;font-size:clamp(0.95rem,1.4vw,1.05rem);font-weight:500;line-height:1.45;}';
    document.head.appendChild(style);
  }

  function escapeEmptyHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var EMPTY_BY_CONTAINER = {
    'home-invited-grid': {
      title: 'No event invitations yet.',
      description: 'You do not have any event invitations right now. New invitations will appear here.'
    },
    'home-today-grid': {
      title: 'No joined events for today.',
      description: 'Events you register for that happen today will appear here under Events Joined.'
    },
    'home-upcoming-grid': {
      title: 'No upcoming joined events.',
      description: 'Join an event from Explore and it will show up here for your account only.'
    },
    'home-past-grid': {
      title: 'No past joined events yet.',
      description: 'Events you registered for will move here after they end.'
    },
    'row-today': {
      title: 'No events happening today.',
      description: 'There are no campus events scheduled for today. Check back later or explore other categories.'
    },
    'row-academic': {
      title: 'No academic events yet.',
      description: 'Academic events will appear here once they are published for your campus.'
    },
    'row-tech': {
      title: 'No tech events yet.',
      description: 'Technology and innovation events will appear here when they become available.'
    },
    'row-org': {
      title: 'No organization events yet.',
      description: 'Organization activities will appear here once they are published.'
    },
    'attendance-today-grid': {
      title: 'No attendance events today.',
      description: 'You have no events requiring attendance today. Check back when you join a live event.'
    },
    'attendance-completed-grid': {
      title: 'No completed attendance yet.',
      description: 'Events you fully attend will appear here with completed attendance records.'
    },
    'attendance-incomplete-grid': {
      title: 'No incomplete attendance.',
      description: 'Events with incomplete attendance will appear here so you can finish tapping in or out.'
    },
    'saved-today-grid': {
      title: 'No saved events today.',
      description: 'Bookmark events happening today and they will show up in this section.'
    },
    'saved-upcoming-grid': {
      title: 'No upcoming saved events.',
      description: 'Save upcoming events from Explore and they will appear here.'
    },
    'saved-past-grid': {
      title: 'No past saved events.',
      description: 'Saved events that have already ended will appear in this section.'
    },
    'saved-grid': {
      title: 'No saved events here.',
      description: 'Bookmark events from the Events page and they will appear in this list.'
    },
    'event-grid': {
      title: 'No events to show.',
      description: 'There are no events in this category right now. Check back later or explore another section.'
    }
  };

  var EMPTY_BY_CATEGORY = {
    today: {
      title: 'No events happening today.',
      description: 'There are no campus events scheduled for today. Check back later or explore other categories.'
    },
    academic: {
      title: 'No academic events yet.',
      description: 'Academic events will appear here once they are published for your campus.'
    },
    tech: {
      title: 'No tech events yet.',
      description: 'Technology and innovation events will appear here when they become available.'
    },
    organization: {
      title: 'No organization events yet.',
      description: 'Organization activities will appear here once they are published.'
    },
    invited: {
      title: 'No event invitations yet.',
      description: 'You do not have any event invitations right now. New invitations will appear here.'
    },
    'joined-today': {
      title: 'No events scheduled for today.',
      description: 'You currently have no events happening today. Check back later or join a new event to get started.'
    },
    'joined-upcoming': {
      title: 'No upcoming events found.',
      description: 'There are no scheduled events coming up. Join an event to stay connected and start planning ahead.'
    },
    'joined-past': {
      title: 'No past events available.',
      description: 'You do not have any completed events yet. Past events will appear here once they have ended.'
    },
    'attendance-today': {
      title: 'No attendance events today.',
      description: 'You have no events requiring attendance today. Check back when you join a live event.'
    },
    'attendance-completed': {
      title: 'No completed attendance yet.',
      description: 'Events you fully attend will appear here with completed attendance records.'
    },
    'attendance-incomplete': {
      title: 'No incomplete attendance.',
      description: 'Events with incomplete attendance will appear here so you can finish tapping in or out.'
    }
  };

  function resolveEmptyCopy(containerId, filter) {
    filter = filter || {};
    if (filter.emptyTitle) {
      return {
        title: filter.emptyTitle,
        description: filter.emptyDescription || 'When items are available, they will appear here.'
      };
    }
    if (containerId && EMPTY_BY_CONTAINER[containerId]) {
      return EMPTY_BY_CONTAINER[containerId];
    }
    if (filter.category && EMPTY_BY_CATEGORY[filter.category]) {
      return EMPTY_BY_CATEGORY[filter.category];
    }
    if (filter.timing === 'today') return EMPTY_BY_CONTAINER['saved-today-grid'];
    if (filter.timing === 'upcoming') return EMPTY_BY_CONTAINER['saved-upcoming-grid'];
    if (filter.timing === 'past') return EMPTY_BY_CONTAINER['saved-past-grid'];
    return {
      title: 'Nothing to show yet.',
      description: 'When items are available, they will appear here.'
    };
  }

  function createEmptyState(copy, compact) {
    injectEmptyStateStyles();
    var emptyState = document.createElement('div');
    emptyState.className = 'dc-empty-state home-empty-state' + (compact ? ' dc-empty-state--compact' : '');
    emptyState.setAttribute('role', 'status');
    emptyState.innerHTML =
      '<img class="dc-empty-state__icon home-empty-state__icon" src="/no-event.svg" width="160" height="160" alt="" aria-hidden="true" />' +
      '<h3 class="dc-empty-state__title home-empty-state__title">' + escapeEmptyHtml(copy.title) + '</h3>' +
      '<p class="dc-empty-state__description home-empty-state__description">' + escapeEmptyHtml(copy.description) + '</p>';
    return emptyState;
  }

  function showEmptyState(container, filter) {
    var root = typeof container === 'string' ? document.getElementById(container) : container;
    if (!root) return;
    if (root.querySelector('.event-card, .dc-empty-state, .home-empty-state')) return;
    var containerId = typeof container === 'string' ? container : root.id || '';
    var compact = Boolean(filter && filter.compactEmpty);
    root.appendChild(createEmptyState(resolveEmptyCopy(containerId, filter), compact));
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
    if (!events.length) {
      showEmptyState(root, filter);
      return;
    }
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
    if (!events.length) {
      showEmptyState(root, Object.assign({ compactEmpty: true }, filter || {}));
      return;
    }
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

      /* Skip cards without a real event id — live data fills containers via fillContainer. */
    });
  }

  injectBookmarkStyles();

  DCEvents.createEventCard = createEventCard;
  DCEvents.fillContainer = fillContainer;
  DCEvents.fillSavedContainer = fillSavedContainer;
  DCEvents.showEmptyState = showEmptyState;
  DCEvents.initCardLinks = initCardLinks;
  DCEvents.navigateToEvent = navigateToEvent;
  DCEvents.getSavedIds = getSavedIds;
  DCEvents.isEventSaved = isEventSaved;
  DCEvents.toggleSaved = toggleSaved;
})(window);
