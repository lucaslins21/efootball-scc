function getAdminSession() {
  const token = localStorage.getItem("adminToken") || "";
  const expiry = Number(localStorage.getItem("adminTokenExpiry") || 0);
  return { token, expiry };
}

function isAdminLogged() {
  const { token, expiry } = getAdminSession();
  return !!token && expiry && Date.now() < expiry;
}

function requireAdmin() {
  if (!isAdminLogged()) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

function logoutAdmin() {
  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminTokenExpiry");
  window.location.href = "login.html";
}

function setupNavAuth() {
  const adminLink = document.getElementById("nav-admin");
  const logoutBtn = document.getElementById("nav-logout");
  const logged = isAdminLogged();
  const currentPage = window.location.pathname.split("/").pop() || "";
  const onAdminPage = currentPage === "admin.html";

  if (adminLink) {
    adminLink.style.display = !onAdminPage ? "inline-flex" : "none";
    adminLink.textContent = "Admin";
    adminLink.href = logged ? "admin.html" : "login.html";
  }
  if (logoutBtn) {
    logoutBtn.style.display = logged && onAdminPage ? "inline-flex" : "none";
    logoutBtn.onclick = logoutAdmin;
  }
}
