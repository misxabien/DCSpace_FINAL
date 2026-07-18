(function () {
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderStars(rating) {
    var html = "";
    for (var i = 1; i <= 5; i++) {
      var filled = i <= rating;
      html +=
        '<span class="detail-stars__star' +
        (filled ? " is-filled" : "") +
        '" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>' +
        "</span>";
    }
    return html;
  }

  function renderMedia(media) {
    var items = Array.isArray(media) ? media : [];
    if (!items.length) {
      return (
        '<div class="detail-media">' +
        '<div class="detail-media__thumb" role="img" aria-label="Uploaded media 1"></div>' +
        '<div class="detail-media__thumb detail-media__thumb--alt" role="img" aria-label="Uploaded media 2"></div>' +
        "</div>"
      );
    }

    var html = '<div class="detail-media">';
    for (var i = 0; i < Math.min(2, items.length); i++) {
      var src = items[i];
      if (typeof src === "string" && src.indexOf("data:image") === 0) {
        html +=
          '<div class="detail-media__thumb has-image" role="img" aria-label="Uploaded media ' +
          (i + 1) +
          '" style="background-image:url(\'' +
          src.replace(/'/g, "%27") +
          "');background-size:cover;background-position:center;\"></div>";
      } else {
        html +=
          '<div class="detail-media__thumb' +
          (i === 1 ? " detail-media__thumb--alt" : "") +
          '" role="img" aria-label="Uploaded media ' +
          (i + 1) +
          '"></div>';
      }
    }
    html += "</div>";
    return html;
  }

  function renderFeedbackDetails() {
    if (!window.DCFeedback) return;

    var params = new URLSearchParams(window.location.search);
    var id = params.get("id") || "1";
    var feedback = DCFeedback.getFeedbackById(id);

    document.title = "DC Space — " + feedback.title;

    var submittedEl = document.getElementById("detail-submitted");
    if (submittedEl) {
      submittedEl.textContent = "SUBMITTED ON " + String(feedback.submittedAt || "").toUpperCase();
    }

    var titleVal = document.getElementById("detail-title-value");
    if (titleVal) titleVal.textContent = feedback.title;

    var typeVal = document.getElementById("detail-type-value");
    if (typeVal) typeVal.textContent = feedback.type;

    var starsEl = document.getElementById("detail-stars");
    if (starsEl) {
      starsEl.innerHTML = renderStars(feedback.rating);
      starsEl.setAttribute("aria-label", "Rating: " + feedback.rating + " out of 5 stars");
    }

    var mediaEl = document.getElementById("detail-media");
    if (mediaEl) mediaEl.innerHTML = renderMedia(feedback.media);

    var commentEl = document.getElementById("detail-comment");
    if (commentEl) {
      commentEl.value = feedback.comment || "";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderFeedbackDetails);
  } else {
    renderFeedbackDetails();
  }
})();
