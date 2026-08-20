(function () {
  'use strict';

  var PATH_TO_PAGE = {
    '/home': '09-home.html',
    '/events': '14-event.html',
    '/events/invited': '10-invited.html',
    '/events/today': '11-today.html',
    '/events/upcoming': '12-upcoming.html',
    '/events/past': '13-past.html',
    '/events/happening': '15-happen.html',
    '/events/academic': '16-acad.html',
    '/events/tech': '17-tech.html',
    '/events/organization': '18-organization.html',
    '/events/details': '19-event-details.html',
    '/events/explore': '20-event-explore.html',
    '/events/submit': '21-event-submit.html',
    '/attendance': '22-attendance.html',
    '/attendance/completed': '23-attendance-completed.html',
    '/attendance/incomplete': '24-attendance-incomplete.html',
    '/attendance/details': '25-attendance-details.html',
    '/certificates': '26-certificates.html',
    '/certificates/weekend': '27-certificates-weekend.html',
    '/certificates/month': '28-certificates-month.html',
    '/saved': '29-saved.html',
    '/saved/today': '30-saved-today.html',
    '/saved/upcoming': '31-saved-upcoming.html',
    '/saved/past': '32-saved-past.html',
    '/feedback': '33-feedbacl.html',
    '/feedback/details': '34-feedback-details.html',
    '/feedback/sign': '35-feedback-sign.html',
    '/profile': '36-profile.html',
    '/notifications': '37-notif.html'
  };

  function resolvePageName() {
    var path = window.location.pathname.replace(/\/$/, '');
    if (!path) return '09-home.html';
    return PATH_TO_PAGE[path] || '09-home.html';
  }

  var pageName = resolvePageName();
  var layer = null;
  var steps = [];
  var currentIndex = 0;
  var returnFocus = null;
  var resizeTimer = null;

  var pageSteps = {
    '09-home.html': [
      step('.search-bar', 'Search for events', 'Use the search bar to quickly find an event by its name or topic.'),
      step('.row-invited', 'Your invitations', 'Events you have been invited to appear here so you can review them right away.'),
      step('.calendar', 'Event calendar', 'Use the calendar to keep track of today and plan around upcoming events.'),
      step('[aria-labelledby="joined-heading"]', 'Events you joined', 'Track today, upcoming, and past events you have already joined.')
    ],
    '14-event.html': [
      step('.search-bar', 'Find an event', 'Search the complete events catalogue from here.'),
      step('[aria-labelledby="today-heading"]', 'Happening today', 'Browse events taking place today in this row.'),
      step('[aria-labelledby="academic-heading"]', 'Academic events', 'Academic events are grouped in their own section.'),
      step('[aria-labelledby="tech-heading"]', 'Technology events', 'Explore technology and innovation events here.')
    ],
    '19-event-details.html': detailSteps(),
    '20-event-explore.html': detailSteps(),
    '21-event-submit.html': [
      step('.detail-head', 'Event summary', 'Review the event date, venue, and schedule before submitting anything.'),
      step('.submit-panel', 'Required files', 'Upload each file requested by the event organizer in this section.'),
      step('#submit-action', 'Complete your submission', 'When all required files are ready, use this button to submit them.')
    ],
    '22-attendance.html': [
      step('.attendance-block', 'Today’s attendance', 'Your event for today and its attendance status appear first.'),
      step('#attendance-completed-grid', 'Completed attendance', 'Events with successfully completed attendance are collected here.'),
      step('#attendance-incomplete-grid', 'Incomplete attendance', 'Check this section for events that still need attendance action.')
    ],
    '25-attendance-details.html': [
      step('.detail-head', 'Event attendance', 'This summary identifies the event connected to these attendance records.'),
      step('.rfid-panel__stats', 'Attendance progress', 'See your grace period and current completion percentage here.'),
      step('.rfid-log-table', 'RFID activity', 'Your tap-in and tap-out history is listed in this table.')
    ],
    '26-certificates.html': [
      step('.search-bar', 'Find a certificate', 'Search your certificates by event or title.'),
      step('.cert-block', 'Certificate groups', 'Certificates are grouped by when they were earned.'),
      step('.cert-card', 'View a certificate', 'Select a certificate card to open or download the available certificate.')
    ],
    '29-saved.html': [
      step('.search-bar', 'Search saved events', 'Find an event you bookmarked without browsing the full catalogue.'),
      step('.saved-block', 'Saved event groups', 'Your bookmarks are organized into today, upcoming, and past events.'),
      step('.event-card', 'Manage a saved event', 'Open a card for details or use its bookmark control to remove it from Saved Events.')
    ],
    '33-feedbacl.html': [
      step('.feedback-cta', 'Share your experience', 'Start a new feedback submission from this panel.'),
      step('.feedback-section__tools', 'Find submitted feedback', 'Search and filter feedback you already sent.'),
      step('.feedback-list', 'Submission history', 'Select an item to review the details of a previous submission.')
    ],
    '34-feedback-details.html': [
      step('.detail-head', 'Submission date', 'See when this feedback was submitted and return to the feedback list.'),
      step('.detail-panel', 'Feedback details', 'Review the feedback type, rating, uploaded media, and written comments here.')
    ],
    '35-feedback-sign.html': [
      step('.sign-intro', 'Tell us what you think', 'This form lets you share your experience and suggestions.'),
      step('.sign-form-card', 'Complete your feedback', 'Add a title, choose a type, give a rating, and write your comments.'),
      step('.form-media__head', 'Add supporting media', 'You can optionally attach up to two images before submitting.')
    ],
    '36-profile.html': [
      step('#profile-hero', 'Your profile identity', 'Your cover photo and profile picture are displayed here.'),
      step('.profile-card--main', 'Personal information', 'Review your student, course, department, and organization details.'),
      step('[aria-labelledby="stats-heading"]', 'Account statistics', 'See your attendance, certificate, and feedback totals at a glance.'),
      step('[aria-labelledby="settings-heading"]', 'Account settings', 'Manage account actions such as updating your password from here.')
    ],
    '37-notif.html': [
      step('.notif-tabs', 'Filter notifications', 'Switch between all, recent, and unread notifications.'),
      step('.notif-toolbar__search', 'Search notifications', 'Search by event, status, or notification text.'),
      step('[data-group="today"]', 'Today\'s updates', 'Your newest notifications appear in this group first.'),
      step('[data-group="yesterday"]', 'Earlier updates', 'Older notifications stay organized by date below.')
    ]
  };

  var eventListPages = [
    '10-invited.html', '11-today.html', '12-upcoming.html', '13-past.html',
    '15-happen.html', '16-acad.html', '17-tech.html', '18-organization.html',
    '23-attendance-completed.html', '24-attendance-incomplete.html'
  ];

  var savedListPages = ['30-saved-today.html', '31-saved-upcoming.html', '32-saved-past.html'];

  var certificateListPages = ['27-certificates-weekend.html', '28-certificates-month.html'];

  function step(selector, title, description) {
    return { selector: selector, title: title, description: description };
  }

  function detailSteps() {
    return [
      step('.detail-head', 'Event information', 'Review the event date, venue, time, and organizer details here.'),
      step('.detail-actions', 'Save or share', 'Bookmark this event for later or share it with someone else.'),
      step('.detail-section', 'More event details', 'Read the announcements, description, host information, and requirements.')
    ];
  }

  function listingSteps() {
    return [
      step('.search-bar', 'Search this list', 'Use search to quickly narrow down the events shown on this page.'),
      step('.back-btn', 'Return to overview', 'Use this link to go back to the previous events page.'),
      step('.section-head', 'Category heading', 'This heading shows which event group you are viewing.'),
      step('#event-grid', 'Browse events', 'All events for this category are listed in this grid.')
    ];
  }

  function savedListingSteps() {
    return [
      step('.search-bar', 'Search saved events', 'Find a bookmarked event without leaving this page.'),
      step('.back-btn', 'Back to saved events', 'Return to the main Saved Events overview from here.'),
      step('.section-head', 'Saved event group', 'This section shows the saved events in the selected time period.'),
      step('#saved-grid', 'Your saved events', 'Bookmarked events for this page appear in this grid.')
    ];
  }

  function certificateListingSteps() {
    return [
      step('.search-bar', 'Search certificates', 'Find a certificate by event or title.'),
      step('.back-btn', 'Back to certificates', 'Return to the main Certificates page from here.'),
      step('#cert-grid', 'Your certificates', 'All certificates in this time period are displayed here.')
    ];
  }

  function getPageSteps() {
    var specific = pageSteps[pageName];
    if (!specific && eventListPages.indexOf(pageName) !== -1) specific = listingSteps();
    if (!specific && savedListPages.indexOf(pageName) !== -1) specific = savedListingSteps();
    if (!specific && certificateListPages.indexOf(pageName) !== -1) specific = certificateListingSteps();
    if (!specific) {
      specific = [
        step('.search-bar', 'Search this page', 'Use search to quickly find what you need.'),
        step('main section, main article', 'Page content', 'The main information and actions for this page are shown here.')
      ];
    }

    return [
      step('.main__top, .detail-topbar', 'Welcome to this page', 'This short tour highlights the most useful parts of the screen. You can close it at any time.'),
      step('.sidebar', 'Main navigation', 'Use the sidebar to move between Home, Events, Attendance, Saved Events, Certificates, and Feedback.')
    ].concat(specific);
  }

  function resolveSteps() {
    return getPageSteps().map(function (item) {
      var target = document.querySelector(item.selector);
      if (!target) return null;
      var rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return {
        target: target,
        title: item.title,
        description: item.description
      };
    }).filter(Boolean);
  }

  function createLayer() {
    layer = document.createElement('div');
    layer.className = 'dc-tour-layer';
    layer.innerHTML =
      '<div class="dc-tour-shade" data-shade="top"></div>' +
      '<div class="dc-tour-shade" data-shade="left"></div>' +
      '<div class="dc-tour-shade" data-shade="right"></div>' +
      '<div class="dc-tour-shade" data-shade="bottom"></div>' +
      '<div class="dc-tour-spotlight" aria-hidden="true"></div>' +
      '<section class="dc-tour-popover" role="dialog" aria-modal="true" aria-labelledby="dc-tour-title" aria-describedby="dc-tour-description">' +
        '<div class="dc-tour-popover__top">' +
          '<div>' +
            '<p class="dc-tour-popover__eyebrow">Website tour</p>' +
            '<h2 class="dc-tour-popover__title" id="dc-tour-title"></h2>' +
          '</div>' +
          '<button type="button" class="dc-tour-popover__close" aria-label="Close tour">&times;</button>' +
        '</div>' +
        '<p class="dc-tour-popover__description" id="dc-tour-description"></p>' +
        '<div class="dc-tour-popover__footer">' +
          '<span class="dc-tour-popover__progress" aria-live="polite"></span>' +
          '<div class="dc-tour-popover__actions">' +
            '<button type="button" class="dc-tour-btn dc-tour-btn--back">Back</button>' +
            '<button type="button" class="dc-tour-btn dc-tour-btn--next">Next</button>' +
          '</div>' +
        '</div>' +
      '</section>';

    document.body.appendChild(layer);
    layer.querySelector('.dc-tour-popover__close').addEventListener('click', closeTour);
    layer.querySelector('.dc-tour-btn--back').addEventListener('click', previousStep);
    layer.querySelector('.dc-tour-btn--next').addEventListener('click', nextStep);
  }

  function startTour(trigger) {
    if (layer) return;
    steps = resolveSteps();
    if (!steps.length) return;
    currentIndex = 0;
    returnFocus = trigger || document.activeElement;
    createLayer();
    document.body.classList.add('dc-tour-open');
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', positionCurrentStep, true);
    showStep();
  }

  function closeTour() {
    if (!layer) return;
    layer.remove();
    layer = null;
    steps = [];
    document.body.classList.remove('dc-tour-open');
    document.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('resize', handleViewportChange);
    window.removeEventListener('scroll', positionCurrentStep, true);
    window.clearTimeout(resizeTimer);
    if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
    returnFocus = null;
  }

  function showStep() {
    var item = steps[currentIndex];
    var rect = item.target.getBoundingClientRect();
    var isOutside = rect.bottom < 90 || rect.top > window.innerHeight - 90;

    if (isOutside) {
      item.target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      window.setTimeout(positionCurrentStep, 260);
    }

    layer.querySelector('.dc-tour-popover__title').textContent = item.title;
    layer.querySelector('.dc-tour-popover__description').textContent = item.description;
    layer.querySelector('.dc-tour-popover__progress').textContent = (currentIndex + 1) + ' of ' + steps.length;

    var back = layer.querySelector('.dc-tour-btn--back');
    var next = layer.querySelector('.dc-tour-btn--next');
    back.hidden = currentIndex === 0;
    next.textContent = currentIndex === steps.length - 1 ? 'Finish' : 'Next';

    positionCurrentStep();
    next.focus();
  }

  function positionCurrentStep() {
    if (!layer || !steps[currentIndex]) return;

    var targetRect = steps[currentIndex].target.getBoundingClientRect();
    var padding = 8;
    var viewportWidth = window.innerWidth;
    var viewportHeight = window.innerHeight;
    var left = Math.max(8, targetRect.left - padding);
    var top = Math.max(8, targetRect.top - padding);
    var right = Math.min(viewportWidth - 8, targetRect.right + padding);
    var bottom = Math.min(viewportHeight - 8, targetRect.bottom + padding);
    var width = Math.max(0, right - left);
    var height = Math.max(0, bottom - top);

    setBox(layer.querySelector('[data-shade="top"]'), 0, 0, viewportWidth, top);
    setBox(layer.querySelector('[data-shade="left"]'), 0, top, left, height);
    setBox(layer.querySelector('[data-shade="right"]'), right, top, Math.max(0, viewportWidth - right), height);
    setBox(layer.querySelector('[data-shade="bottom"]'), 0, bottom, viewportWidth, Math.max(0, viewportHeight - bottom));
    setBox(layer.querySelector('.dc-tour-spotlight'), left, top, width, height);

    positionPopover({ left: left, top: top, right: right, bottom: bottom, width: width, height: height });
  }

  function positionPopover(spotlight) {
    var popover = layer.querySelector('.dc-tour-popover');
    var gap = 18;
    var edge = 16;
    var popoverWidth = popover.offsetWidth;
    var popoverHeight = popover.offsetHeight;
    var viewportWidth = window.innerWidth;
    var viewportHeight = window.innerHeight;
    var left;
    var top;

    if (viewportHeight - spotlight.bottom >= popoverHeight + gap + edge) {
      top = spotlight.bottom + gap;
      left = spotlight.left + (spotlight.width - popoverWidth) / 2;
    } else if (spotlight.top >= popoverHeight + gap + edge) {
      top = spotlight.top - popoverHeight - gap;
      left = spotlight.left + (spotlight.width - popoverWidth) / 2;
    } else if (viewportWidth - spotlight.right >= popoverWidth + gap + edge) {
      left = spotlight.right + gap;
      top = spotlight.top + (spotlight.height - popoverHeight) / 2;
    } else if (spotlight.left >= popoverWidth + gap + edge) {
      left = spotlight.left - popoverWidth - gap;
      top = spotlight.top + (spotlight.height - popoverHeight) / 2;
    } else {
      left = (viewportWidth - popoverWidth) / 2;
      top = viewportHeight - popoverHeight - edge;
    }

    popover.style.left = clamp(left, edge, viewportWidth - popoverWidth - edge) + 'px';
    popover.style.top = clamp(top, edge, viewportHeight - popoverHeight - edge) + 'px';
  }

  function setBox(element, left, top, width, height) {
    element.style.left = left + 'px';
    element.style.top = top + 'px';
    element.style.width = width + 'px';
    element.style.height = height + 'px';
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, Math.max(min, max)));
  }

  function nextStep() {
    if (currentIndex >= steps.length - 1) {
      closeTour();
      return;
    }
    currentIndex += 1;
    showStep();
  }

  function previousStep() {
    if (currentIndex <= 0) return;
    currentIndex -= 1;
    showStep();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') closeTour();
    if (event.key === 'ArrowRight') nextStep();
    if (event.key === 'ArrowLeft') previousStep();
    if (event.key === 'Tab') trapFocus(event);
  }

  function trapFocus(event) {
    var focusable = Array.prototype.slice.call(layer.querySelectorAll('button:not([hidden])'));
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleViewportChange() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(positionCurrentStep, 80);
  }

  function bindHelpButtons() {
    document.querySelectorAll('.tool-btn--help, [aria-label="Help"]').forEach(function (button) {
      if (button.dataset.tourBound === 'true') return;
      button.dataset.tourBound = 'true';
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('title', 'Start page tour');
      button.addEventListener('click', function () {
        startTour(button);
      });
    });
  }

  window.DCWebsiteTour = {
    start: function () { startTour(document.activeElement); },
    close: closeTour
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindHelpButtons);
  } else {
    bindHelpButtons();
  }
})();
