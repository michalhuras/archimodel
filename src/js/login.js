import { loadVersion } from './version.js';

async function login() {
  const password = document.getElementById("password").value

  const res = await fetch("/.netlify/functions/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  })

  if (res.ok) {
    localStorage.setItem("auth", "ok")
    window.location.href = "/"
  } else {
    document.getElementById("error").innerText = "Invalid password"
  }
}

window.login = login;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadVersion);
} else {
  loadVersion();
}
