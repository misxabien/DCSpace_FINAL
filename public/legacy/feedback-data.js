/* Live feedback helpers — items are populated from MongoDB via StudentDataBridge. */
(function (global) {
  var TYPE_LABELS = {
    general: "General Feedback",
    event: "Event Feedback",
    academic: "Academic Feedback",
    suggestion: "Suggestion",
  };

  function getAllFeedback() {
    return Array.isArray(global.DCFeedback && global.DCFeedback.FEEDBACK_ITEMS)
      ? global.DCFeedback.FEEDBACK_ITEMS
      : [];
  }

  function getFeedbackById(id) {
    var sid = String(id);
    var all = getAllFeedback();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === sid) return all[i];
    }
    return null;
  }

  function getFeedbackDetailUrl(id) {
    return "/feedback/details?id=" + encodeURIComponent(String(id));
  }

  global.DCFeedback = {
    FEEDBACK_ITEMS: [],
    TYPE_LABELS: TYPE_LABELS,
    getAllFeedback: getAllFeedback,
    getFeedbackById: getFeedbackById,
    getFeedbackDetailUrl: getFeedbackDetailUrl,
  };
})(window);
