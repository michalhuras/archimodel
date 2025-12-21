if (localStorage.getItem("auth") !== "ok") {
  window.location.href = "/login.html"
}

window.logout = function logout() {
  localStorage.removeItem("auth")
  window.location.href = "/login.html"
}
