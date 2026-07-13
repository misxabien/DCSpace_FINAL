/* Shared mock event data for static HTML prototype */
(function (global) {
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function addDays(base, days) {
    var d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
  }

  function toISODate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  var today = new Date();

  var DC_EVENTS = [
    { id: 1, name: 'Campus Opening Ceremony', venue: 'Main Auditorium', time: '8:00 AM - 11:00 AM', date: toISODate(today), category: 'today', status: 'joined', venueType: 'On Campus', eventType: 'Seminar', organization: 'Student Council', course: 'General', department: 'Student Affairs', attendanceRequired: '30 minutes', gracePeriod: '15 minutes', requiresFiles: true, requiredFiles: ["Parent's Consent Form"], filesApproved: true },
    { id: 2, name: 'Leadership Workshop', venue: 'Room 204', time: '1:00 PM - 4:00 PM', date: toISODate(today), category: 'today', status: 'pending', venueType: 'On Campus', eventType: 'Workshop', organization: 'Leadership Org', course: 'BSIT', department: 'College of IT', attendanceRequired: '45 minutes', gracePeriod: '10 minutes', requiresFiles: true, requiredFiles: ["Parent's Consent Form"], filesApproved: false },
    { id: 3, name: 'Community Outreach Day', venue: 'City Plaza', time: '9:00 AM - 3:00 PM', date: toISODate(today), category: 'today', status: 'open', venueType: 'Off Campus', eventType: 'Outreach', organization: 'Volunteer Club', course: 'General', department: 'Student Affairs', attendanceRequired: '1 hour', gracePeriod: '20 minutes', requiresFiles: false, requiredFiles: [] },
    { id: 4, name: 'Evening Networking Mixer', venue: 'Student Lounge', time: '6:00 PM - 8:00 PM', date: toISODate(today), category: 'today', status: 'rejected', venueType: 'On Campus', eventType: 'Party', organization: 'Alumni Network', course: 'General', department: 'Alumni Office', attendanceRequired: '30 minutes', gracePeriod: '15 minutes', requiresFiles: true, requiredFiles: ["Parent's Consent Form"], filesApproved: false },
    { id: 5, name: 'Research Symposium', venue: 'Science Hall', time: '10:00 AM - 12:00 PM', date: toISODate(addDays(today, 3)), category: 'academic', status: 'joined', venueType: 'On Campus', eventType: 'Seminar', organization: 'Research Society', course: 'BSCS', department: 'College of Science', attendanceRequired: '1 hour', gracePeriod: '10 minutes', requiresFiles: true, requiredFiles: ["Parent's Consent Form"], filesApproved: true },
    { id: 6, name: 'Thesis Defense Open Forum', venue: 'Room 301', time: '2:00 PM - 5:00 PM', date: toISODate(addDays(today, 7)), category: 'academic', status: 'pending', venueType: 'On Campus', eventType: 'Seminar', organization: 'Academic Board', course: 'BSIT', department: 'College of IT', attendanceRequired: '45 minutes', gracePeriod: '15 minutes', requiresFiles: true, requiredFiles: ["Parent's Consent Form"], filesApproved: false },
    { id: 7, name: 'Literature Week Panel', venue: 'Library Hall', time: '9:30 AM - 11:30 AM', date: toISODate(addDays(today, 12)), category: 'academic', status: 'open', venueType: 'On Campus', eventType: 'Seminar', organization: 'Literary Guild', course: 'AB English', department: 'College of Arts', attendanceRequired: '30 minutes', gracePeriod: '10 minutes', requiresFiles: false, requiredFiles: [] },
    { id: 8, name: 'Math Olympiad Finals', venue: 'Room 105', time: '1:00 PM - 3:00 PM', date: toISODate(addDays(today, 18)), category: 'academic', status: 'cancelled', venueType: 'On Campus', eventType: 'Competition', organization: 'Math Club', course: 'General', department: 'College of Science', attendanceRequired: '1 hour', gracePeriod: '5 minutes', requiresFiles: false, requiredFiles: [] },
    { id: 9, name: 'AI Innovation Summit', venue: 'Tech Hub', time: '9:00 AM - 5:00 PM', date: toISODate(addDays(today, 5)), category: 'tech', status: 'joined', venueType: 'On Campus', eventType: 'Seminar', organization: 'Tech Guild', course: 'BSIT', department: 'College of IT', attendanceRequired: '2 hours', gracePeriod: '15 minutes', requiresFiles: true, requiredFiles: ["Parent's Consent Form"], filesApproved: true },
    { id: 10, name: 'Hackathon Kickoff', venue: 'Innovation Lab', time: '8:00 AM - 6:00 PM', date: toISODate(addDays(today, 9)), category: 'tech', status: 'pending', venueType: 'On Campus', eventType: 'Competition', organization: 'Developers Club', course: 'BSCS', department: 'College of IT', attendanceRequired: '3 hours', gracePeriod: '20 minutes', requiresFiles: true, requiredFiles: ["Parent's Consent Form"], filesApproved: false },
    { id: 11, name: 'Robotics Demo Day', venue: 'Engineering Wing', time: '10:00 AM - 1:00 PM', date: toISODate(addDays(today, 14)), category: 'tech', status: 'postponed', venueType: 'On Campus', eventType: 'Exhibit', organization: 'Robotics Team', course: 'BSCE', department: 'College of Engineering', attendanceRequired: '45 minutes', gracePeriod: '10 minutes', requiresFiles: false, requiredFiles: [] },
    { id: 12, name: 'Startup Pitch Night', venue: 'Auditorium B', time: '6:00 PM - 9:00 PM', date: toISODate(addDays(today, 21)), category: 'tech', status: 'open', venueType: 'On Campus', eventType: 'Seminar', organization: 'Entrepreneurship Hub', course: 'General', department: 'Business School', attendanceRequired: '1 hour', gracePeriod: '15 minutes', requiresFiles: false, requiredFiles: [] },
    { id: 13, name: 'Org General Assembly', venue: 'Student Center', time: '3:00 PM - 5:00 PM', date: toISODate(addDays(today, 2)), category: 'organization', status: 'joined', venueType: 'On Campus', eventType: 'Meeting', organization: 'Your Organization', course: 'BSIT', department: 'College of IT', attendanceRequired: '30 minutes', gracePeriod: '10 minutes', requiresFiles: false, requiredFiles: [] },
    { id: 14, name: 'Team Building Retreat', venue: 'Mountain View Resort', time: '7:00 AM - 6:00 PM', date: toISODate(addDays(today, 10)), category: 'organization', status: 'pending', venueType: 'Off Campus', eventType: 'Outreach', organization: 'Your Organization', course: 'BSIT', department: 'College of IT', attendanceRequired: '4 hours', gracePeriod: '30 minutes', requiresFiles: true, requiredFiles: ["Parent's Consent Form", 'Medical Clearance'], filesApproved: false },
    { id: 15, name: 'Charity Fundraiser', venue: 'Campus Grounds', time: '11:00 AM - 4:00 PM', date: toISODate(addDays(today, 16)), category: 'organization', status: 'open', venueType: 'On Campus', eventType: 'Outreach', organization: 'Your Organization', course: 'General', department: 'Student Affairs', attendanceRequired: '1 hour', gracePeriod: '15 minutes', requiresFiles: false, requiredFiles: [] },
    { id: 16, name: 'Annual Org Awards', venue: 'Grand Hall', time: '5:00 PM - 8:00 PM', date: toISODate(addDays(today, 24)), category: 'organization', status: 'passed', venueType: 'On Campus', eventType: 'Party', organization: 'Your Organization', course: 'General', department: 'Student Affairs', attendanceRequired: '1 hour', gracePeriod: '15 minutes', requiresFiles: false, requiredFiles: [] },
    { id: 17, name: 'Invited Gala Night', venue: 'Hotel Ballroom', time: '7:00 PM - 10:00 PM', date: toISODate(addDays(today, 14)), category: 'invited', status: 'open', venueType: 'Off Campus', eventType: 'Party', organization: 'Alumni Association', course: 'General', department: 'Alumni Office', attendanceRequired: '1 hour', gracePeriod: '20 minutes', requiresFiles: true, requiredFiles: ["Parent's Consent Form"], filesApproved: false },
    { id: 18, name: 'Guest Lecture Series', venue: 'Lecture Hall A', time: '2:00 PM - 4:00 PM', date: toISODate(addDays(today, 21)), category: 'invited', status: 'joined', venueType: 'On Campus', eventType: 'Seminar', organization: 'Academic Council', course: 'BSCS', department: 'College of IT', attendanceRequired: '45 minutes', gracePeriod: '10 minutes', requiresFiles: false, requiredFiles: [] },
    { id: 19, name: 'Morning Orientation', venue: 'Room 101', time: '9:00 AM - 11:00 AM', date: toISODate(today), category: 'joined-today', status: 'joined', venueType: 'On Campus', eventType: 'Seminar', organization: 'Student Council', course: 'General', department: 'Student Affairs', attendanceRequired: '30 minutes', gracePeriod: '10 minutes', requiresFiles: false, requiredFiles: [] },
    { id: 20, name: 'Skills Bootcamp', venue: 'Lab 3', time: '1:00 PM - 3:00 PM', date: toISODate(today), category: 'joined-today', status: 'pending', venueType: 'On Campus', eventType: 'Workshop', organization: 'Skills Org', course: 'BSIT', department: 'College of IT', attendanceRequired: '1 hour', gracePeriod: '15 minutes', requiresFiles: true, requiredFiles: ["Parent's Consent Form"], filesApproved: false },
    { id: 21, name: 'Future Leaders Forum', venue: 'Auditorium C', time: '10:00 AM - 12:00 PM', date: toISODate(addDays(today, 5)), category: 'joined-upcoming', status: 'joined', venueType: 'On Campus', eventType: 'Seminar', organization: 'Leadership Org', course: 'General', department: 'Student Affairs', attendanceRequired: '45 minutes', gracePeriod: '10 minutes', requiresFiles: false, requiredFiles: [] },
    { id: 22, name: 'Design Thinking Lab', venue: 'Room 210', time: '3:00 PM - 5:00 PM', date: toISODate(addDays(today, 12)), category: 'joined-upcoming', status: 'joined', venueType: 'On Campus', eventType: 'Workshop', organization: 'Design Club', course: 'BSIT', department: 'College of IT', attendanceRequired: '1 hour', gracePeriod: '15 minutes', requiresFiles: false, requiredFiles: [] },
    { id: 23, name: 'Spring Festival', venue: 'Campus Oval', time: '4:00 PM - 9:00 PM', date: toISODate(addDays(today, -14)), category: 'joined-past', status: 'passed', venueType: 'On Campus', eventType: 'Party', organization: 'Student Council', course: 'General', department: 'Student Affairs', attendanceRequired: '1 hour', gracePeriod: '20 minutes', requiresFiles: false, requiredFiles: [] },
    { id: 24, name: 'Career Fair 2026', venue: 'Gymnasium', time: '9:00 AM - 4:00 PM', date: toISODate(addDays(today, -30)), category: 'joined-past', status: 'passed', venueType: 'On Campus', eventType: 'Seminar', organization: 'Career Office', course: 'General', department: 'Student Affairs', attendanceRequired: '2 hours', gracePeriod: '15 minutes', requiresFiles: false, requiredFiles: [] }
  ];

  var ATTENDANCE_CATEGORIES = {
    'attendance-today': [1],
    'attendance-completed': [23, 24, 5, 9, 16, 13],
    'attendance-incomplete': [2, 20, 14, 6, 10, 4]
  };

  function formatDateParts(dateStr) {
    var date = new Date(dateStr + 'T12:00:00');
    return {
      month: MONTH_SHORT[date.getMonth()],
      day: String(date.getDate()).padStart(2, '0'),
      year: String(date.getFullYear())
    };
  }

  function getEventById(id) {
    var numId = Number(id);
    for (var i = 0; i < DC_EVENTS.length; i++) {
      if (DC_EVENTS[i].id === numId) return DC_EVENTS[i];
    }
    return null;
  }

  function getEventsByCategory(category, limit) {
    if (ATTENDANCE_CATEGORIES[category]) {
      var attendanceEvents = [];
      ATTENDANCE_CATEGORIES[category].forEach(function (id) {
        var event = getEventById(id);
        if (event) attendanceEvents.push(event);
      });
      if (typeof limit === 'number') return attendanceEvents.slice(0, limit);
      return attendanceEvents;
    }

    var results = [];
    for (var i = 0; i < DC_EVENTS.length; i++) {
      if (DC_EVENTS[i].category === category) results.push(DC_EVENTS[i]);
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

  var ATTENDANCE_RFID = {
    1: {
      graceRemaining: '15:00',
      progress: 0,
      logs: [
        { tapIn: '00:00 AM', tapOut: '00:00 PM' },
        { tapIn: '00:00 AM', tapOut: '00:00 PM' },
        { tapIn: '00:00 AM', tapOut: '00:00 PM' },
        { tapIn: '00:00 AM', tapOut: '00:00 PM' },
        { tapIn: '00:00 AM', tapOut: '00:00 PM' }
      ],
      page: { current: 0, total: 0 }
    },
    2: {
      graceRemaining: '08:30',
      progress: 35,
      logs: [
        { tapIn: '1:05 PM', tapOut: '1:42 PM' },
        { tapIn: '2:10 PM', tapOut: '2:55 PM' },
        { tapIn: '00:00 AM', tapOut: '00:00 PM' },
        { tapIn: '00:00 AM', tapOut: '00:00 PM' },
        { tapIn: '00:00 AM', tapOut: '00:00 PM' }
      ],
      page: { current: 1, total: 1 }
    },
    23: {
      graceRemaining: '00:00',
      progress: 100,
      logs: [
        { tapIn: '4:02 PM', tapOut: '5:18 PM' },
        { tapIn: '5:25 PM', tapOut: '6:40 PM' },
        { tapIn: '6:50 PM', tapOut: '8:05 PM' },
        { tapIn: '8:12 PM', tapOut: '9:00 PM' },
        { tapIn: '00:00 AM', tapOut: '00:00 PM' }
      ],
      page: { current: 1, total: 1 }
    },
    24: {
      graceRemaining: '00:00',
      progress: 100,
      logs: [
        { tapIn: '9:05 AM', tapOut: '11:30 AM' },
        { tapIn: '11:45 AM', tapOut: '1:15 PM' },
        { tapIn: '1:30 PM', tapOut: '3:45 PM' },
        { tapIn: '00:00 AM', tapOut: '00:00 PM' },
        { tapIn: '00:00 AM', tapOut: '00:00 PM' }
      ],
      page: { current: 1, total: 1 }
    }
  };

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
    var key = Number(id);
    if (ATTENDANCE_RFID[key]) return ATTENDANCE_RFID[key];
    return DEFAULT_RFID;
  }

  global.DCEvents = {
    list: DC_EVENTS,
    getEventById: getEventById,
    getEventsByCategory: getEventsByCategory,
    formatDateParts: formatDateParts,
    getEventDetailUrl: getEventDetailUrl,
    getEventSubmitUrl: getEventSubmitUrl,
    getAttendanceRfid: getAttendanceRfid
  };
})(window);
