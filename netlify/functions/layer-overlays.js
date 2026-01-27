const fs = require("fs");
const path = require("path");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const possiblePaths = [
      path.join(__dirname, "layer-overlays.json"),
      path.join(process.cwd(), "netlify", "functions", "layer-overlays.json"),
      path.join(process.cwd(), "public", "layer-overlays.json"),
    ];

    let content = null;
    let foundPath = null;

    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          content = fs.readFileSync(p, "utf8");
          foundPath = p;
          break;
        }
      } catch {}
    }

    if (!content) {
      throw new Error("layer-overlays.json not found in function bundle");
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      body: content,
    };
  } catch (err) {
    return {
      statusCode: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "layer-overlays.json not found", details: err?.message }),
    };
  }
};