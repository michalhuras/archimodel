const fs = require("fs");
const path = require("path");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const filePath = path.join(__dirname, "apartments.json");

    if (!fs.existsSync(filePath)) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "apartments.json not found", path: filePath }),
      };
    }

    const data = fs.readFileSync(filePath, "utf8");
    const apartments = JSON.parse(data);

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      body: JSON.stringify(apartments),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Failed to load apartments", details: err?.message }),
    };
  }
};