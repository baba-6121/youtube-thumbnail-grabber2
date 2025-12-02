const fetch = require("node-fetch");

const ALLOWED_SIZES = [
  "maxresdefault.jpg",
  "sddefault.jpg",
  "hqdefault.jpg",
  "mqdefault.jpg",
  "default.jpg"
];

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    console.warn("[download-thumbnail] Method not allowed", { method: req.method });
    res.status(405).json({ error: "Method Not Allowed", code: "method_not_allowed" });
    return;
  }

  const query = req.query || {};
  const id = typeof query.id === "string" ? query.id : "";
  const sizeParam = typeof query.size === "string" ? query.size : "maxresdefault.jpg";

  if (!id) {
    console.warn("[download-thumbnail] Missing id query parameter", { query });
    res.status(400).json({ error: "Missing 'id' query parameter", code: "missing_id" });
    return;
  }

  const size = ALLOWED_SIZES.includes(sizeParam) ? sizeParam : "maxresdefault.jpg";
  const url = `https://img.youtube.com/vi/${id}/${size}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error("[download-thumbnail] Upstream thumbnail fetch failed", {
        id,
        size,
        status: response.status
      });
      res.status(response.status).json({
        error: "Failed to fetch thumbnail from YouTube",
        code: "upstream_error",
        status: response.status
      });
      return;
    }

    const buffer = await response.buffer();
    const sizeKey = size.replace(/\.jpg$/i, "");
    const filename = `${id}-${sizeKey}.jpg`;

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
    res.status(200).send(buffer);
  } catch (e) {
    console.error("[download-thumbnail] Failed to download thumbnail", {
      id,
      size,
      error: e && e.message ? e.message : String(e)
    });
    res.status(500).json({ error: "Failed to download thumbnail", code: "download_error" });
  }
};
