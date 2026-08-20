/* Feedback helpers — items come from /api/user/feedback via StudentDataBridge. */
(function (global) {
  function getFeedbackList() {
    return (global.DCFeedback && Array.isArray(global.DCFeedback.FEEDBACK_ITEMS))
      ? global.DCFeedback.FEEDBACK_ITEMS
      : [];
  }

  function getFeedbackById(id) {
    var sid = String(id);
    var items = getFeedbackList();
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].id) === sid) return items[i];
    }
    return null;
  }

  function getFeedbackDetailUrl(id) {
    return '/feedback/details?id=' + encodeURIComponent(String(id));
  }

  global.DCFeedback = {
    FEEDBACK_ITEMS: [],
    getFeedbackById: getFeedbackById,
    getFeedbackDetailUrl: getFeedbackDetailUrl
  };
})(window);
