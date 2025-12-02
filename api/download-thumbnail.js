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
    res.status(405).send("Method Not Allowed");
    return;
  }

  const query = req.query || {};
  const id = typeof query.id === "string" ? query.id : "";
  const sizeParam = typeof query.size === "string" ? query.size : "maxresdefault.jpg";

  if (!id) {
    res.status(400).json({ error: "Missing 'id' query parameter" });
    return;
  }

  const size = ALLOWED_SIZES.includes(sizeParam) ? sizeParam : "maxresdefault.jpg";
  const url = `https://img.youtube.com/vi/${id}/${size}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      res.status(response.status).json({ error: "Failed to fetch thumbnail" });
      return;
    }

    const buffer = await response.buffer();
    const sizeKey = size.replace(/\.jpg$/i, "");
    const filename = `${id}-${sizeKey}.jpg`;

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
    res.status(200).send(buffer);
  } catch (e) {
    res.status(500).json({ error: "Failed to download thumbnail" });
  }
};
