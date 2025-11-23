const form = document.getElementById("login-form");
const feedback = document.getElementById("login-feedback");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  feedback.textContent = "";
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: document.getElementById("login-user").value,
        password: document.getElementById("login-pass").value,
      }),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("Servidor retornou uma resposta inesperada. Verifique se o backend está ativo.");
    }
    if (!res.ok) throw new Error(json.error || "Falha no login");

    const expiry = Date.now() + 60 * 60 * 1000; // 1 hora
    localStorage.setItem("adminToken", json.token);
    localStorage.setItem("adminTokenExpiry", String(expiry));

    feedback.textContent = "Login ok! Redirecionando...";
    feedback.className = "feedback ok";
    setTimeout(() => {
      window.location.href = "admin.html";
    }, 600);
  } catch (err) {
    feedback.textContent = err.message;
    feedback.className = "feedback err";
  }
});

document.addEventListener("DOMContentLoaded", () => {
  if (typeof setupNavAuth === "function") {
    setupNavAuth();
  }
  if (typeof isAdminLogged === "function" && isAdminLogged()) {
    window.location.href = "admin.html";
  }
});
