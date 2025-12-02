const JSZip = require("jszip");
const fetch = require("node-fetch");

const ALLOWED_SIZES = [
  "maxresdefault.jpg",
  "sddefault.jpg",
  "hqdefault.jpg",
  "mqdefault.jpg",
  "default.jpg"
];

const MAX_ITEMS = 50;

function getSizeOrder(preferred, useFallback) {
  if (!useFallback) {
    return [preferred];
  }
  const baseOrder = [
    "maxresdefault.jpg",
    "sddefault.jpg",
    "hqdefault.jpg",
    "mqdefault.jpg",
    "default.jpg"
  ];
  const startIndex = baseOrder.indexOf(preferred);
  if (startIndex === -1) {
    return baseOrder;
  }
  return baseOrder.slice(startIndex);
}

async function fetchImageWithFallback(id, preferredSize, useFallback) {
  const sizes = getSizeOrder(preferredSize, useFallback);
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    const url = `https://img.youtube.com/vi/${id}/${size}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          continue;
        }
        console.error("[zip-thumbnails] Upstream thumbnail fetch failed", {
          id,
          size,
          status: response.status
        });
        continue;
      }
      const buffer = await response.buffer();
      return { id, size, buffer };
    } catch (e) {
      console.error("[zip-thumbnails] Error while fetching thumbnail", {
        id,
        size,
        error: e && e.message ? e.message : String(e)
      });
      continue;
    }
  }
  return null;
}

async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (true) {
      let currentIndex;
      if (index >= tasks.length) {
        return;
      }
      currentIndex = index;
      index += 1;
      try {
        results[currentIndex] = await tasks[currentIndex]();
      } catch (e) {
        results[currentIndex] = null;
      }
    }
  }

  const workers = [];
  const workerCount = Math.min(limit, tasks.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

function buildFileName(pattern, index, id, size) {
  const basePattern = typeof pattern === "string" && pattern.trim()
    ? pattern.trim()
    : "{index}-{id}-{size}.jpg";
  const indexStr = String(index).padStart(3, "0");
  const sizeKey = size.replace(/\.jpg$/i, "");
  return basePattern
    .replace(/\{index\}/g, indexStr)
    .replace(/\{id\}/g, id)
    .replace(/\{size\}/g, sizeKey);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method Not Allowed", code: "method_not_allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      console.error("[zip-thumbnails] Invalid JSON body", {
        bodySnippet: body.slice && body.slice(0, 200)
      });
      res.status(400).json({ error: "Invalid JSON body", code: "invalid_json" });
      return;
    }
  }
  body = body || {};

  const items = Array.isArray(body.items) ? body.items : [];
  const rawSizes = Array.isArray(body.sizes)
    ? body.sizes.filter(value => typeof value === "string")
    : [];
  const resolution = typeof body.resolution === "string" ? body.resolution : "maxresdefault.jpg";
  const fallback = Boolean(body.fallback);
  const fileNamePattern = body.fileNamePattern;

  if (items.length === 0) {
    console.warn("[zip-thumbnails] Empty items array in request body");
    res.status(400).json({ error: "'items' must be a non-empty array", code: "items_empty" });
    return;
  }

  if (items.length > MAX_ITEMS) {
    console.warn("[zip-thumbnails] Too many items in request", {
      count: items.length,
      max: MAX_ITEMS
    });
    res.status(400).json({
      error: `Too many items. Maximum allowed is ${MAX_ITEMS}.`,
      code: "too_many_items"
    });
    return;
  }
  let sizes = rawSizes.length ? Array.from(new Set(rawSizes)) : [];

  if (sizes.length) {
    const invalidSizes = sizes.filter(size => !ALLOWED_SIZES.includes(size));
    if (invalidSizes.length) {
      console.warn("[zip-thumbnails] Invalid sizes in request", { sizes, invalidSizes });
      res.status(400).json({ error: "One or more requested sizes are invalid", code: "invalid_sizes" });
      return;
    }
  } else {
    if (!ALLOWED_SIZES.includes(resolution)) {
      console.warn("[zip-thumbnails] Invalid resolution in request", { resolution });
      res.status(400).json({ error: "Invalid resolution", code: "invalid_resolution" });
      return;
    }
    sizes = [resolution];
  }

  const tasks = [];
  items.forEach((item) => {
    const id = item && typeof item.id === "string" ? item.id : "";
    sizes.forEach((requestedSize) => {
      const taskIndex = tasks.length;
      tasks.push(async () => {
        if (!id) {
          return null;
        }
        const result = await fetchImageWithFallback(id, requestedSize, fallback);
        if (!result) {
          return null;
        }
        return {
          id,
          buffer: result.buffer,
          size: result.size,
          index: taskIndex + 1
        };
      });
    });
  });

  const downloaded = await runWithConcurrency(tasks, 5);
  const successful = downloaded.filter(Boolean);

  if (successful.length === 0) {
    console.error("[zip-thumbnails] Failed to download thumbnails for all items", {
      ids: items.map(item => (item && typeof item.id === "string" ? item.id : "")),
      resolution,
      sizes,
      fallback
    });
    res.status(502).json({
      error: "Failed to download thumbnails from YouTube for all requested videos.",
      code: "download_failed_all"
    });
    return;
  }

  const successById = new Map();
  successful.forEach(entry => {
    if (entry && entry.id) {
      successById.set(entry.id, true);
    }
  });

  const failedIds = items
    .map(item => (item && typeof item.id === "string" ? item.id : ""))
    .filter(id => id && !successById.get(id));

  if (failedIds.length > 0) {
    console.warn("[zip-thumbnails] Some thumbnails could not be downloaded", {
      failedIds,
      resolution,
      sizes,
      fallback
    });
  }

  const zip = new JSZip();
  successful.forEach(item => {
    const fileName = buildFileName(fileNamePattern, item.index, item.id, item.size);
    zip.file(fileName, item.buffer);
  });

  try {
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `thumbnails-${timestamp}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);
    res.status(200).send(zipBuffer);
  } catch (e) {
    console.error("[zip-thumbnails] Failed to generate ZIP", {
      error: e && e.message ? e.message : String(e)
    });
    res.status(500).json({ error: "Failed to generate zip", code: "zip_generation_failed" });
  }
};
