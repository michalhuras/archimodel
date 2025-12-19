const https = require("https")

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const status = res.statusCode || 0
        if (status < 200 || status >= 300) {
          res.resume()
          reject(new Error(`Upstream status ${status}`))
          return
        }

        const chunks = []
        res.on("data", (d) => chunks.push(d))
        res.on("end", () => resolve(Buffer.concat(chunks)))
      })
      .on("error", reject)
  })
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" }
  }

  // Hardcoded public R2 URL (you can make this configurable via env vars later)
  const ZIP_URL = "https://pub-bd8c5d894c334dbfa30341d1d4208c04.r2.dev/render_webp.zip"

  try {
    const buf = await download(ZIP_URL)
    const b64 = buf.toString("base64")

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "content-type": "application/zip",
        // Cache on CDN; if you change ZIP frequently, version the file name.
        "cache-control": "public, max-age=3600"
      },
      body: b64
    }
  } catch (e) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Failed to proxy ZIP", details: e?.message })
    }
  }
}
