/* Live event helpers — lists come from StudentDataBridge / Mongo, not prototype cards. */
(function (global) {
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function formatDateParts(dateStr) {
    var date = new Date(String(dateStr || '') + (String(dateStr || '').indexOf('T') >= 0 ? '' : 'T12:00:00'));
    if (Number.isNaN(date.getTime())) {
      date = new Date();
    }
    return {
      month: MONTH_SHORT[date.getMonth()],
      day: String(date.getDate()).padStart(2, '0'),
      year: String(date.getFullYear())
    };
  }

  function getEventList() {
    return global.DCEvents && Array.isArray(global.DCEvents.list) ? global.DCEvents.list : [];
  }

  function getEventById(id) {
    var sid = String(id);
    var list = getEventList();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === sid) return list[i];
    }
    return null;
  }

  var CATEGORY_ALIASES = {
    'joined-today': ['today', 'joined-today'],
    'joined-upcoming': ['academic', 'tech', 'organization', 'joined-upcoming'],
    'joined-past': ['joined-past']
  };

  function getEventsByCategory(category, limit) {
    var aliases = CATEGORY_ALIASES[category] || [category];
    var results = [];
    var list = getEventList();
    for (var i = 0; i < list.length; i++) {
      var event = list[i];
      var tags = Array.isArray(event.tags) ? event.tags : [];
      if (aliases.indexOf(event.category) !== -1 || tags.some(function (tag) {
        return aliases.indexOf(tag) !== -1;
      })) {
        results.push(event);
      }
    }
    if (typeof limit === 'number') return results.slice(0, limit);
    return results;
  }

  function getEventDetailUrl(id, context) {
    if (context === 'explore') {
      return '/events/explore?id=' + encodeURIComponent(id);
    }
    if (context === 'attendance') {
      return '/attendance/details?id=' + encodeURIComponent(id);
    }
    return '/events/details?id=' + encodeURIComponent(id);
  }

  function getEventSubmitUrl(id) {
    return '/events/submit?id=' + encodeURIComponent(id);
  }

  var DEFAULT_RFID = {
    graceRemaining: '—',
    progress: 0,
    logs: [],
    page: { current: 0, total: 0 }
  };

  function getAttendanceRfid(id) {
    var live = global.DCEvents && global.DCEvents.attendanceRfid
      ? global.DCEvents.attendanceRfid[String(id)]
      : null;
    return live || DEFAULT_RFID;
  }

  global.DCEvents = {
    list: [],
    getEventById: getEventById,
    getEventsByCategory: getEventsByCategory,
    formatDateParts: formatDateParts,
    getEventDetailUrl: getEventDetailUrl,
    getEventSubmitUrl: getEventSubmitUrl,
    getAttendanceRfid: getAttendanceRfid
  };
})(window);
