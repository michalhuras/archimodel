const fs = require("fs");
const https = require("https");
const path = require("path");

// LOGO_URL: icon.svg in the storage bucket (set in Netlify and .env).
// LOGO_PATH: local SVG for development, takes precedence over the URL.
const LOGO_URL = process.env.LOGO_URL;
const LOCAL_LOGO_PATH = process.env.LOGO_PATH;

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

  if (!LOCAL_LOGO_PATH && !LOGO_URL) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Logo is not configured", details: "Set LOGO_URL or LOGO_PATH" }),
    };
  }

  try {
    const svg = LOCAL_LOGO_PATH
      ? fs.readFileSync(path.resolve(process.cwd(), LOCAL_LOGO_PATH))
      : await download(LOGO_URL);
    return {
      statusCode: 200,
      headers: {
        "content-type": "image/svg+xml",
        "cache-control": LOCAL_LOGO_PATH ? "no-store" : "public, max-age=86400",
      },
      body: svg.toString("utf8"),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Failed to fetch logo", details: err?.message }),
    };
  }
};
