var form = document.getElementById("thumbnail-form");
var input = document.getElementById("video-url");
var thumbnailsContainer = document.getElementById("thumbnails");
var errorMessage = document.getElementById("error-message");
var batchInput = document.getElementById("batch-input");
var batchSizeGroup = document.getElementById("batch-sizes");
var batchFallback = document.getElementById("batch-fallback");
var batchFileNamePattern = document.getElementById("batch-filename-pattern");
var batchDownloadButton = document.getElementById("batch-download-zip");
var batchStatus = document.getElementById("batch-status");
var modeTabs = document.querySelectorAll(".mode-tab");
var modePanels = document.querySelectorAll(".mode-panel");
var batchPreviewButton = document.getElementById("batch-preview-btn");
var batchDownloadCurrentButton = document.getElementById("batch-download-current");
var batchPreview = document.getElementById("batch-preview");
var batchPreviewThumbnails = document.getElementById("batch-preview-thumbnails");
var batchPreviewLabel = document.getElementById("batch-preview-label");
var batchPrevButton = document.getElementById("batch-prev");
var batchNextButton = document.getElementById("batch-next");
var batchPreviewIds = [];
var batchPreviewIndex = 0;

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

function renderThumbnailsInto(videoId, target, selectedSizes) {
  if (!target) {
    return;
  }
  var base = "https://img.youtube.com/vi/" + videoId + "/";
  var sizes = [
    { key: "maxresdefault.jpg", label: "HD Thumbnail", size: "1280x720" },
    { key: "sddefault.jpg", label: "SD Thumbnail", size: "640x480" },
    { key: "hqdefault.jpg", label: "Normal Thumbnail", size: "480x360" },
    { key: "mqdefault.jpg", label: "Normal Thumbnail", size: "320x180" },
    { key: "default.jpg", label: "Small Thumbnail", size: "120x90" }
  ];
  var list = sizes;
  if (selectedSizes && selectedSizes.length) {
    list = sizes.filter(function (item) {
      return selectedSizes.indexOf(item.key) !== -1;
    });
    if (!list.length) {
      list = sizes;
    }
  }
  var html = list.map(function (item) {
    var imageUrl = base + item.key;
    var downloadUrl = "/api/download-thumbnail?id=" + encodeURIComponent(videoId) + "&size=" + encodeURIComponent(item.key);
    return (
      '<article class="thumbnail-card">' +
      '<div class="thumbnail-header">' +
      '<h3 class="thumbnail-title">' + item.label + ' Image (' + item.size + ")</h3>" +
      '<div class="thumbnail-actions">' +
      '<a class="download-link" href="' + downloadUrl + '">Download</a>' +
      "</div>" +
      "</div>" +
      '<div class="thumbnail-image-wrapper">' +
      '<img class="thumbnail-image" src="' + imageUrl + '" alt="' + item.label + ' (' + item.size + ')" loading="lazy" />' +
      "</div>" +
      "</article>"
    );
  }).join("");
  target.innerHTML = html;
}

function buildThumbnails(videoId) {
  renderThumbnailsInto(videoId, thumbnailsContainer);
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

  if (thumbnailsContainer) {
    if (targetMode === "single") {
      thumbnailsContainer.style.display = "";
    } else {
      thumbnailsContainer.style.display = "none";
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

function getSelectedBatchSizes() {
  if (!batchSizeGroup) {
    return [];
  }
  var inputs = batchSizeGroup.querySelectorAll('input[type="checkbox"]');
  var result = [];
  for (var i = 0; i < inputs.length; i++) {
    var inputEl = inputs[i];
    if (inputEl && inputEl.checked && inputEl.value) {
      result.push(inputEl.value);
    }
  }
  return result;
}

function buildBatchStatusMessage(validCount, invalidCount) {
  if (validCount === 0 && invalidCount === 0) {
    return "";
  }
  var parts = [];
  if (validCount > 0) {
    parts.push(validCount + " valid video" + (validCount > 1 ? "s" : ""));
  }
  if (invalidCount > 0) {
    parts.push(invalidCount + " invalid line" + (invalidCount > 1 ? "s" : ""));
  }
  return parts.join(" · ");
}

function updateBatchPreview() {
  if (!batchPreview || !batchPreviewThumbnails) {
    return;
  }
  if (!batchPreviewIds.length) {
    batchPreview.style.display = "none";
    batchPreview.setAttribute("aria-hidden", "true");
    batchPreviewThumbnails.innerHTML = "";
    if (batchPreviewLabel) {
      batchPreviewLabel.textContent = "";
    }
    return;
  }

  if (batchPreviewIndex < 0) {
    batchPreviewIndex = 0;
  }
  if (batchPreviewIndex >= batchPreviewIds.length) {
    batchPreviewIndex = batchPreviewIds.length - 1;
  }

  var currentId = batchPreviewIds[batchPreviewIndex];

  batchPreview.style.display = "block";
  batchPreview.removeAttribute("aria-hidden");

  if (batchPreviewLabel) {
    batchPreviewLabel.textContent =
      "Video " + (batchPreviewIndex + 1) + " of " + batchPreviewIds.length + " (ID: " + currentId + ")";
  }

  var selectedSizes = getSelectedBatchSizes();
  renderThumbnailsInto(currentId, batchPreviewThumbnails, selectedSizes);
}

function handleBatchPrevClick() {
  if (!batchPreviewIds.length) {
    return;
  }
  batchPreviewIndex = (batchPreviewIndex - 1 + batchPreviewIds.length) % batchPreviewIds.length;
  updateBatchPreview();
}

function handleBatchNextClick() {
  if (!batchPreviewIds.length) {
    return;
  }
  batchPreviewIndex = (batchPreviewIndex + 1) % batchPreviewIds.length;
  updateBatchPreview();
}

function handleBatchPreviewClick() {
  if (!batchInput || !batchStatus) {
    return;
  }

  var text = batchInput.value || "";
  var parsed = parseBatchInput(text);

  if (parsed.validIds.length === 0) {
    batchStatus.textContent = "Please enter at least one valid YouTube URL or ID (one per line).";
    batchPreviewIds = [];
    batchPreviewIndex = 0;
    updateBatchPreview();
    return;
  }

  batchPreviewIds = parsed.validIds.slice();
  batchPreviewIndex = 0;
  var statusText = buildBatchStatusMessage(parsed.validIds.length, parsed.invalidLines.length);
  if (parsed.invalidLines.length > 0) {
    var examples = parsed.invalidLines.slice(0, 3).join(" | ");
    statusText += " (e.g. " + examples + ")";
  }
  batchStatus.textContent = statusText;
  updateBatchPreview();
}

function performZipDownloadForIds(idList, triggerButton) {
  if (!triggerButton || !batchStatus) {
    return;
  }
  if (!idList || !idList.length) {
    batchStatus.textContent = "Nothing to download. Please click \"Preview thumbnails\" first.";
    return;
  }

  var sizes = getSelectedBatchSizes();
  if (!sizes.length) {
    batchStatus.textContent = "Please select at least one thumbnail size.";
    return;
  }

  var resolution = sizes[0] || "maxresdefault.jpg";
  var fallback = batchFallback ? !!batchFallback.checked : true;
  var pattern = batchFileNamePattern && batchFileNamePattern.value ? batchFileNamePattern.value : "{index}-{id}-{size}.jpg";

  var items = idList.map(function (id) {
    return { id: id };
  });

  var originalText = triggerButton.textContent;

  triggerButton.disabled = true;
  triggerButton.textContent = "Preparing ZIP...";
  batchStatus.textContent =
    "Preparing ZIP for " + idList.length + " video" + (idList.length > 1 ? "s" : "") + "...";

  fetch("/api/zip-thumbnails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      items: items,
      resolution: resolution,
      sizes: sizes,
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
      batchStatus.textContent =
        "ZIP download started for " + idList.length + " video" + (idList.length > 1 ? "s" : "") + ".";
      triggerButton.disabled = false;
      triggerButton.textContent = originalText;
    })
    .catch(function (error) {
      batchStatus.textContent = (error && error.message) || "Failed to download ZIP.";
      triggerButton.disabled = false;
      triggerButton.textContent = originalText;
    });
}

function handleBatchDownloadCurrentClick() {
  if (!batchPreviewIds.length) {
    if (batchStatus) {
      batchStatus.textContent = "Please click \"Preview thumbnails\" first.";
    }
    return;
  }
  var currentId = batchPreviewIds[batchPreviewIndex] || batchPreviewIds[0];
  performZipDownloadForIds([currentId], batchDownloadCurrentButton || batchDownloadButton);
}

function handleBatchDownloadAllClick() {
  if (!batchPreviewIds.length) {
    if (batchStatus) {
      batchStatus.textContent = "Please click \"Preview thumbnails\" first.";
    }
    return;
  }
  performZipDownloadForIds(batchPreviewIds.slice(), batchDownloadButton);
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

if (batchPreviewButton) {
  batchPreviewButton.addEventListener("click", handleBatchPreviewClick);
}

if (batchDownloadCurrentButton) {
  batchDownloadCurrentButton.addEventListener("click", handleBatchDownloadCurrentClick);
}

if (batchDownloadButton) {
  batchDownloadButton.addEventListener("click", handleBatchDownloadAllClick);
}

if (batchPrevButton) {
  batchPrevButton.addEventListener("click", handleBatchPrevClick);
}

if (batchNextButton) {
  batchNextButton.addEventListener("click", handleBatchNextClick);
}

if (modeTabs && modeTabs.length) {
  setActiveMode("single");
  for (var i = 0; i < modeTabs.length; i++) {
    modeTabs[i].addEventListener("click", handleModeTabClick);
  }
}
