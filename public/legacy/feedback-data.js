/* Feedback data: mock samples + user-submitted items (localStorage) */
(function (global) {
  var STORAGE_KEY = "dcspace_user_feedback";

  var FEEDBACK_ITEMS = [
    {
      id: 1,
      listTitle: "Feedback Title",
      listType: "Feedback Type",
      title: "Excellent Event Organization",
      type: "General Feedback",
      rating: 1,
      submittedAt: "July 10, 2026, 9:30 AM",
      comment: "",
      media: ["media-1", "media-2"],
    },
    {
      id: 2,
      listTitle: "Feedback Title",
      listType: "Feedback Type",
      title: "Great Workshop Experience",
      type: "Event Feedback",
      rating: 4,
      submittedAt: "July 8, 2026, 2:15 PM",
      comment:
        "The session was well-paced and the facilitators were very engaging throughout the workshop.",
      media: ["media-1", "media-2"],
    },
    {
      id: 3,
      listTitle: "Feedback Title",
      listType: "Feedback Type",
      title: "Innovation Summit Review",
      type: "General Feedback",
      rating: 5,
      submittedAt: "July 5, 2026, 11:00 AM",
      comment:
        "Outstanding speakers and networking opportunities. Would love to attend again next year.",
      media: ["media-1", "media-2"],
    },
    {
      id: 4,
      listTitle: "Feedback Title",
      listType: "Feedback Type",
      title: "Research Symposium Notes",
      type: "Academic Feedback",
      rating: 3,
      submittedAt: "June 28, 2026, 4:45 PM",
      comment: "Good content but the venue was a bit crowded during peak sessions.",
      media: ["media-1", "media-2"],
    },
    {
      id: 5,
      listTitle: "Feedback Title",
      listType: "Feedback Type",
      title: "Team Building Feedback",
      type: "Event Feedback",
      rating: 5,
      submittedAt: "June 20, 2026, 6:00 PM",
      comment: "Amazing retreat! The activities helped our team bond significantly.",
      media: ["media-1", "media-2"],
    },
  ];

  var TYPE_LABELS = {
    general: "General Feedback",
    event: "Event Feedback",
    academic: "Academic Feedback",
    suggestion: "Suggestion",
  };

  function readUserFeedback() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function writeUserFeedback(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      /* quota */
    }
  }

  function getAllFeedback() {
    return readUserFeedback().concat(FEEDBACK_ITEMS);
  }

  function getFeedbackById(id) {
    var sid = String(id);
    var all = getAllFeedback();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === sid) return all[i];
    }
    return all[0] || FEEDBACK_ITEMS[0];
  }

  function getFeedbackDetailUrl(id) {
    return "/feedback/details?id=" + encodeURIComponent(String(id));
  }

  function formatSubmittedAt(date) {
    try {
      return date.toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch (err) {
      return date.toISOString();
    }
  }

  function saveSubmittedFeedback(input) {
    var userItems = readUserFeedback();
    var nextId = Date.now();
    var typeLabel = TYPE_LABELS[input.type] || input.type || "General Feedback";
    var title = String(input.title || "").trim() || "Untitled Feedback";
    var item = {
      id: nextId,
      listTitle: title,
      listType: typeLabel,
      title: title,
      type: typeLabel,
      rating: Number(input.rating) || 1,
      submittedAt: formatSubmittedAt(new Date()),
      comment: String(input.comment || "").trim(),
      media: Array.isArray(input.media) ? input.media.slice(0, 2) : [],
      isUserSubmitted: true,
    };
    userItems.unshift(item);
    writeUserFeedback(userItems);
    return item;
  }

  global.DCFeedback = {
    FEEDBACK_ITEMS: FEEDBACK_ITEMS,
    TYPE_LABELS: TYPE_LABELS,
    getAllFeedback: getAllFeedback,
    getFeedbackById: getFeedbackById,
    getFeedbackDetailUrl: getFeedbackDetailUrl,
    saveSubmittedFeedback: saveSubmittedFeedback,
  };
})(window);
