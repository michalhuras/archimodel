const https = require("https");

const ZIP_URL = "https://pub-bd8c5d894c334dbfa30341d1d4208c04.r2.dev/render_webp.zip";

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const status = res.statusCode || 0;
      if (status < 200 || status >= 300) {
        res.resume();
        return reject(new Error(`Upstream status ${status}`));
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const zipBuffer = await download(ZIP_URL);
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "content-type": "application/zip",
        "cache-control": "public, max-age=3600",
      },
      body: zipBuffer.toString("base64"),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Failed to proxy ZIP", details: err?.message }),
    };
  }
};