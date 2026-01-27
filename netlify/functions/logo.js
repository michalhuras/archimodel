const https = require("https");

const LOGO_URL = "https://pub-bd8c5d894c334dbfa30341d1d4208c04.r2.dev/icon.svg";

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
    const svgBuffer = await download(LOGO_URL);
    return {
      statusCode: 200,
      headers: {
        "content-type": "image/svg+xml",
        "cache-control": "public, max-age=86400",
      },
      body: svgBuffer.toString("utf8"),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Failed to fetch logo", details: err?.message }),
    };
  }
};