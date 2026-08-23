/* Live event helpers — list is populated from MongoDB via StudentDataBridge. */
(function (global) {
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function formatDateParts(dateStr) {
    var date = new Date(String(dateStr) + 'T12:00:00');
    if (Number.isNaN(date.getTime())) {
      return { month: '—', day: '—', year: '—' };
    }
    return {
      month: MONTH_SHORT[date.getMonth()],
      day: String(date.getDate()).padStart(2, '0'),
      year: String(date.getFullYear())
    };
  }

  function eventList() {
    return global.DCEvents && Array.isArray(global.DCEvents.list) ? global.DCEvents.list : [];
  }

  function getEventById(id) {
    var sid = String(id);
    var list = eventList();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === sid) return list[i];
    }
    return null;
  }

  function getEventsByCategory(category, limit) {
    var list = eventList();
    var results = [];
    for (var i = 0; i < list.length; i++) {
      var event = list[i];
      if (event.category === category || (event.tags && event.tags.indexOf(category) !== -1)) {
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
    graceRemaining: '00:00',
    progress: 0,
    logs: [
      { tapIn: '00:00 AM', tapOut: '00:00 PM' },
      { tapIn: '00:00 AM', tapOut: '00:00 PM' },
      { tapIn: '00:00 AM', tapOut: '00:00 PM' },
      { tapIn: '00:00 AM', tapOut: '00:00 PM' },
      { tapIn: '00:00 AM', tapOut: '00:00 PM' }
    ],
    page: { current: 0, total: 0 }
  };

  function getAttendanceRfid(id) {
    var store = (global.DCEvents && global.DCEvents.attendanceRfid) || {};
    var key = String(id);
    if (store[key]) return store[key];
    return DEFAULT_RFID;
  }

  global.DCEvents = {
    list: [],
    attendanceRfid: {},
    getEventById: getEventById,
    getEventsByCategory: getEventsByCategory,
    formatDateParts: formatDateParts,
    getEventDetailUrl: getEventDetailUrl,
    getEventSubmitUrl: getEventSubmitUrl,
    getAttendanceRfid: getAttendanceRfid
  };
})(window);
