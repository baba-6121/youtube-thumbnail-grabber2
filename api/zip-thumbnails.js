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
        continue;
      }
      const buffer = await response.buffer();
      return { id, size, buffer };
    } catch (e) {
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
    res.status(405).send("Method Not Allowed");
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
  }
  body = body || {};

  const items = Array.isArray(body.items) ? body.items : [];
  const resolution = typeof body.resolution === "string" ? body.resolution : "maxresdefault.jpg";
  const fallback = Boolean(body.fallback);
  const fileNamePattern = body.fileNamePattern;

  if (items.length === 0) {
    res.status(400).json({ error: "'items' must be a non-empty array" });
    return;
  }

  if (items.length > MAX_ITEMS) {
    res.status(400).json({ error: `Too many items. Maximum allowed is ${MAX_ITEMS}.` });
    return;
  }

  if (!ALLOWED_SIZES.includes(resolution)) {
    res.status(400).json({ error: "Invalid resolution" });
    return;
  }

  const tasks = items.map((item, index) => {
    const id = item && typeof item.id === "string" ? item.id : "";
    return async () => {
      if (!id) {
        return null;
      }
      const result = await fetchImageWithFallback(id, resolution, fallback);
      if (!result) {
        return null;
      }
      return {
        id,
        buffer: result.buffer,
        size: result.size,
        index: index + 1
      };
    };
  });

  const downloaded = await runWithConcurrency(tasks, 5);
  const successful = downloaded.filter(Boolean);

  if (successful.length === 0) {
    res.status(500).json({ error: "Failed to download thumbnails for all items" });
    return;
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
    res.status(500).json({ error: "Failed to generate zip" });
  }
};
