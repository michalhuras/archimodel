const fs = require("fs")
const path = require("path")

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" }
  }

  try {
    const dataPath = path.join(__dirname, "apartments.json")
    if (!fs.existsSync(dataPath)) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "apartments.json not found", path: dataPath })
      }
    }
    const raw = fs.readFileSync(dataPath, "utf8")
    const apartments = JSON.parse(raw)

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      },
      body: JSON.stringify(apartments)
    }
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Failed to load apartments", details: e?.message })
    }
  }
}
