/* Live certificate helpers — list is populated from MongoDB via StudentDataBridge. */
(function (global) {
  function certList() {
    return global.DCCertificates && Array.isArray(global.DCCertificates.list)
      ? global.DCCertificates.list
      : [];
  }

  function getCertificateById(id) {
    var sid = String(id);
    var list = certList();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === sid) return list[i];
    }
    return null;
  }

  function getCertificatesByCategory(category, limit) {
    var list = certList();
    var results = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].category === category) results.push(list[i]);
    }
    if (typeof limit === 'number') return results.slice(0, limit);
    return results;
  }

  global.DCCertificates = {
    list: [],
    getCertificateById: getCertificateById,
    getCertificatesByCategory: getCertificatesByCategory
  };
})(window);
