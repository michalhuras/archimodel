const fs = require("fs")
const path = require("path")

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" }
  }

  try {
    const overlaysPath = path.join(__dirname, "..", "..", "public", "layer-overlays.json")
    const jsonText = fs.readFileSync(overlaysPath, "utf8")

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        // This file is generated in pipeline; safe to cache aggressively in prod.
        "cache-control": "public, max-age=31536000, immutable"
      },
      body: jsonText
    }
  } catch (e) {
    return {
      statusCode: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "layer-overlays.json not found", details: e?.message })
    }
  }
}
