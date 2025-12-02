var form = document.getElementById("thumbnail-form");
var input = document.getElementById("video-url");
var thumbnailsContainer = document.getElementById("thumbnails");
var errorMessage = document.getElementById("error-message");
var batchInput = document.getElementById("batch-input");
var batchResolution = document.getElementById("batch-resolution");
var batchFallback = document.getElementById("batch-fallback");
var batchFileNamePattern = document.getElementById("batch-filename-pattern");
var batchDownloadButton = document.getElementById("batch-download-zip");
var batchStatus = document.getElementById("batch-status");
var modeTabs = document.querySelectorAll(".mode-tab");
var modePanels = document.querySelectorAll(".mode-panel");

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

function setActiveMode(mode) {
  var targetMode = mode || "single";
  for (var i = 0; i < modeTabs.length; i++) {
    var tab = modeTabs[i];
    var tabMode = tab.getAttribute("data-mode");
    var isActive = tabMode === targetMode;
    if (isActive) {
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      tab.removeAttribute("tabindex");
    } else {
      tab.classList.remove("is-active");
      tab.setAttribute("aria-selected", "false");
      tab.setAttribute("tabindex", "-1");
    }
  }

  for (var j = 0; j < modePanels.length; j++) {
    var panel = modePanels[j];
    var panelMode = panel.getAttribute("data-panel");
    var panelActive = panelMode === targetMode;
    if (panelActive) {
      panel.classList.add("is-active");
      panel.removeAttribute("aria-hidden");
    } else {
      panel.classList.remove("is-active");
      panel.setAttribute("aria-hidden", "true");
    }
  }
}

function handleModeTabClick(event) {
  var button = event.currentTarget;
  var mode = button && button.getAttribute("data-mode");
  if (!mode) {
    return;
  }
  setActiveMode(mode);
}

function parseBatchInput(text) {
  var lines = (text || "").split(/\r?\n/);
  var validIds = [];
  var invalidLines = [];
  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i];
    if (!raw) {
      continue;
    }
    var trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    var id = extractYouTubeId(trimmed);
    if (id) {
      validIds.push(id);
    } else {
      invalidLines.push(trimmed);
    }
  }
  return {
    validIds: validIds,
    invalidLines: invalidLines
  };
}

function buildBatchStatusMessage(validCount, invalidCount) {
  if (validCount === 0 && invalidCount === 0) {
    return "";
  }
  var parts = [];
  if (validCount > 0) {
    parts.push("Parsed " + validCount + " valid video" + (validCount > 1 ? "s" : ""));
  }
  if (invalidCount > 0) {
    parts.push(invalidCount + " line" + (invalidCount > 1 ? "s" : "") + " could not be parsed");
  }
  return parts.join(". ");
}

function handleBatchDownloadClick() {
  if (!batchInput || !batchDownloadButton || !batchStatus) {
    return;
  }

  var text = batchInput.value || "";
  var parsed = parseBatchInput(text);

  if (parsed.validIds.length === 0) {
    batchStatus.textContent = "Please enter at least one valid YouTube URL or ID (one per line).";
    return;
  }

  var resolution = batchResolution && batchResolution.value ? batchResolution.value : "maxresdefault.jpg";
  var fallback = batchFallback ? !!batchFallback.checked : true;
  var pattern = batchFileNamePattern && batchFileNamePattern.value ? batchFileNamePattern.value : "{index}-{id}-{size}.jpg";

  var items = parsed.validIds.map(function (id) {
    return { id: id };
  });

  batchDownloadButton.disabled = true;
  batchDownloadButton.textContent = "Preparing ZIP...";
  batchStatus.textContent = buildBatchStatusMessage(parsed.validIds.length, parsed.invalidLines.length) || "Preparing download...";

  fetch("/api/zip-thumbnails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      items: items,
      resolution: resolution,
      fallback: fallback,
      fileNamePattern: pattern
    })
  })
    .then(function (response) {
      if (!response.ok) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            var message = data && data.error ? data.error : "Failed to generate ZIP.";
            throw new Error(message);
          });
      }
      return response.blob();
    })
    .then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "thumbnails-batch.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      batchStatus.textContent = "ZIP download started for " + parsed.validIds.length + " video" + (parsed.validIds.length > 1 ? "s" : "") + ".";
      batchDownloadButton.disabled = false;
      batchDownloadButton.textContent = "Download ZIP";
    })
    .catch(function (error) {
      batchStatus.textContent = (error && error.message) || "Failed to download ZIP.";
      batchDownloadButton.disabled = false;
      batchDownloadButton.textContent = "Download ZIP";
    });
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

if (batchDownloadButton) {
  batchDownloadButton.addEventListener("click", handleBatchDownloadClick);
}

if (modeTabs && modeTabs.length) {
  setActiveMode("single");
  for (var i = 0; i < modeTabs.length; i++) {
    modeTabs[i].addEventListener("click", handleModeTabClick);
  }
}
