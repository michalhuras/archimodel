export function checkAuth() {
  if (localStorage.getItem("auth") !== "ok") {
    window.location.href = "/login.html"
  }
}

export function logout() {
  localStorage.removeItem("auth")
  window.location.href = "/login.html"
}
