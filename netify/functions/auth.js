exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" }
  }

  const { password } = JSON.parse(event.body || "{}")

  if (password !== process.env.SITE_PASSWORD) {
    return { statusCode: 401, body: "Unauthorized" }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true })
  }
}
