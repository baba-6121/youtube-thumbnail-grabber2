var form = document.getElementById("thumbnail-form");
var input = document.getElementById("video-url");
var thumbnailsContainer = document.getElementById("thumbnails");
var errorMessage = document.getElementById("error-message");

function extractYouTubeId(value) {
  if (!value) {
    return null;
  }
  var trimmed = value.trim();
  var plainIdPattern = /^[a-zA-Z0-9_-]{11}$/;
  if (plainIdPattern.test(trimmed)) {
    return trimmed;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = "https://" + trimmed;
  }
  try {
    var url = new URL(trimmed);
    var host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      var pathParts = url.pathname.split("/").filter(Boolean);
      return pathParts[0] || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.searchParams.has("v")) {
        return url.searchParams.get("v");
      }
      var parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" && parts[1]) {
        return parts[1];
      }
      if (parts[0] === "shorts" && parts[1]) {
        return parts[1];
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

function buildThumbnails(videoId) {
  var base = "https://img.youtube.com/vi/" + videoId + "/";
  var sizes = [
    { key: "maxresdefault.jpg", label: "HD Thumbnail", size: "1280x720" },
    { key: "sddefault.jpg", label: "SD Thumbnail", size: "640x480" },
    { key: "hqdefault.jpg", label: "Normal Thumbnail", size: "480x360" },
    { key: "mqdefault.jpg", label: "Normal Thumbnail", size: "320x180" },
    { key: "default.jpg", label: "Small Thumbnail", size: "120x90" }
  ];
  var html = sizes.map(function (item) {
    var url = base + item.key;
    return (
      '<article class="thumbnail-card">' +
      '<div class="thumbnail-header">' +
      '<h3 class="thumbnail-title">' + item.label + ' Image (' + item.size + ")</h3>" +
      '<div class="thumbnail-actions">' +
      '<a class="download-link" href="' + url + '" target="_blank" rel="noopener noreferrer" download>Download</a>' +
      "</div>" +
      "</div>" +
      '<div class="thumbnail-image-wrapper">' +
      '<img class="thumbnail-image" src="' + url + '" alt="' + item.label + ' (' + item.size + ')" loading="lazy" />' +
      "</div>" +
      "</article>"
    );
  }).join("");
  thumbnailsContainer.innerHTML = html;
}

function handleSubmit(event) {
  event.preventDefault();
  errorMessage.textContent = "";
  thumbnailsContainer.innerHTML = "";
  var value = input.value;
  var videoId = extractYouTubeId(value);
  if (!videoId) {
    errorMessage.textContent = "Please enter a valid YouTube video URL or ID.";
    return;
  }
  buildThumbnails(videoId);
}

if (form) {
  form.addEventListener("submit", handleSubmit);
}
