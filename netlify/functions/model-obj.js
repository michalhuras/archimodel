const fs = require("fs")
const path = require("path")

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" }
  }

  try {
    const objPath = path.join(
      __dirname,
      "..",
      "..",
      "data",
      "paczka - makieta 3d",
      "test-makieta-obj.obj"
    )

    const obj = fs.readFileSync(objPath, "utf8")

    return {
      statusCode: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store"
      },
      body: obj
    }
  } catch (e) {
    return {
      statusCode: 501,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: "Model file is not available on this environment",
        hint: "For local dev place data/test-makieta-obj.obj next to your repo root. For production serve from Netlify Blobs and update this function.",
        details: e?.message
      })
    }
  }
}
