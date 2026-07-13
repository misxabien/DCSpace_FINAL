/* Shared mock certificate data for static HTML prototype */
(function (global) {
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function addDays(base, days) {
    var d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
  }

  function formatIssuedDate(date) {
    return MONTH_SHORT[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
  }

  var today = new Date();

  var DC_CERTIFICATES = [
    { id: 1, name: 'Certificate of Participation', eventName: 'Campus Opening Ceremony', dateIssued: formatIssuedDate(today), category: 'cert-today' },
    { id: 2, name: 'Certificate of Attendance', eventName: 'Morning Orientation', dateIssued: formatIssuedDate(today), category: 'cert-today' },
    { id: 3, name: 'Certificate of Completion', eventName: 'Leadership Workshop', dateIssued: formatIssuedDate(addDays(today, 2)), category: 'cert-weekend' },
    { id: 4, name: 'Certificate of Participation', eventName: 'Skills Bootcamp', dateIssued: formatIssuedDate(addDays(today, 3)), category: 'cert-weekend' },
    { id: 5, name: 'Certificate of Excellence', eventName: 'Research Symposium', dateIssued: formatIssuedDate(addDays(today, 5)), category: 'cert-weekend' },
    { id: 6, name: 'Certificate of Attendance', eventName: 'AI Innovation Summit', dateIssued: formatIssuedDate(addDays(today, 8)), category: 'cert-month' },
    { id: 7, name: 'Certificate of Participation', eventName: 'Spring Festival', dateIssued: formatIssuedDate(addDays(today, -14)), category: 'cert-month' },
    { id: 8, name: 'Certificate of Completion', eventName: 'Career Fair 2026', dateIssued: formatIssuedDate(addDays(today, -20)), category: 'cert-month' },
    { id: 9, name: 'Certificate of Attendance', eventName: 'Future Leaders Forum', dateIssued: formatIssuedDate(addDays(today, 12)), category: 'cert-month' },
    { id: 10, name: 'Certificate of Participation', eventName: 'Org General Assembly', dateIssued: formatIssuedDate(addDays(today, 15)), category: 'cert-month' }
  ];

  function getCertificateById(id) {
    var numId = Number(id);
    for (var i = 0; i < DC_CERTIFICATES.length; i++) {
      if (DC_CERTIFICATES[i].id === numId) return DC_CERTIFICATES[i];
    }
    return null;
  }

  function getCertificatesByCategory(category, limit) {
    var results = [];
    for (var i = 0; i < DC_CERTIFICATES.length; i++) {
      if (DC_CERTIFICATES[i].category === category) results.push(DC_CERTIFICATES[i]);
    }
    if (typeof limit === 'number') return results.slice(0, limit);
    return results;
  }

  global.DCCertificates = {
    list: DC_CERTIFICATES,
    getCertificateById: getCertificateById,
    getCertificatesByCategory: getCertificatesByCategory
  };
})(window);
