const fs = require("fs")
const path = require("path")

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" }
  }

  try {
    const candidates = [
      // Preferred: generated into the functions directory during build, so it ships with the function.
      path.join(__dirname, "layer-overlays.json"),
      // Fallbacks for local/dev setups
      path.join(process.cwd(), "netlify", "functions", "layer-overlays.json"),
      path.join(process.cwd(), "public", "layer-overlays.json")
    ]

    let jsonText = null
    let usedPath = null
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          jsonText = fs.readFileSync(p, "utf8")
          usedPath = p
          break
        }
      } catch {
        // ignore and try next
      }
    }

    if (!jsonText) {
      throw new Error("layer-overlays.json not found in function bundle")
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        // Avoid stale overlays while iterating on schema.
        "cache-control": "no-store"
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
