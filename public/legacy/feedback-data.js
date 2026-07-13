/* Mock submitted feedback data */
(function (global) {
  var FEEDBACK_ITEMS = [
    {
      id: 1,
      listTitle: 'Feedback Title',
      listType: 'Feedback Type',
      title: 'Excellent Event Organization',
      type: 'General Feedback',
      rating: 1,
      submittedAt: 'July 10, 2026, 9:30 AM',
      comment: '',
      media: ['media-1', 'media-2']
    },
    {
      id: 2,
      listTitle: 'Feedback Title',
      listType: 'Feedback Type',
      title: 'Great Workshop Experience',
      type: 'Event Feedback',
      rating: 4,
      submittedAt: 'July 8, 2026, 2:15 PM',
      comment: 'The session was well-paced and the facilitators were very engaging throughout the workshop.',
      media: ['media-1', 'media-2']
    },
    {
      id: 3,
      listTitle: 'Feedback Title',
      listType: 'Feedback Type',
      title: 'Innovation Summit Review',
      type: 'General Feedback',
      rating: 5,
      submittedAt: 'July 5, 2026, 11:00 AM',
      comment: 'Outstanding speakers and networking opportunities. Would love to attend again next year.',
      media: ['media-1', 'media-2']
    },
    {
      id: 4,
      listTitle: 'Feedback Title',
      listType: 'Feedback Type',
      title: 'Research Symposium Notes',
      type: 'Academic Feedback',
      rating: 3,
      submittedAt: 'June 28, 2026, 4:45 PM',
      comment: 'Good content but the venue was a bit crowded during peak sessions.',
      media: ['media-1', 'media-2']
    },
    {
      id: 5,
      listTitle: 'Feedback Title',
      listType: 'Feedback Type',
      title: 'Team Building Feedback',
      type: 'Event Feedback',
      rating: 5,
      submittedAt: 'June 20, 2026, 6:00 PM',
      comment: 'Amazing retreat! The activities helped our team bond significantly.',
      media: ['media-1', 'media-2']
    }
  ];

  function getFeedbackById(id) {
    var sid = String(id);
    for (var i = 0; i < FEEDBACK_ITEMS.length; i++) {
      if (String(FEEDBACK_ITEMS[i].id) === sid) return FEEDBACK_ITEMS[i];
    }
    return FEEDBACK_ITEMS[0];
  }

  function getFeedbackDetailUrl(id) {
    return '/feedback/details?id=' + encodeURIComponent(String(id));
  }

  global.DCFeedback = {
    FEEDBACK_ITEMS: FEEDBACK_ITEMS,
    getFeedbackById: getFeedbackById,
    getFeedbackDetailUrl: getFeedbackDetailUrl
  };
})(window);
