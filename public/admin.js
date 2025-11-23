const els = {
  playerForm: document.getElementById("player-form"),
  playerName: document.getElementById("player-name"),
  playerFeedback: document.getElementById("player-feedback"),
  pendingList: document.getElementById("pending-list"),
  reload: document.getElementById("reload"),
  playersList: document.getElementById("players-list"),
  matchesList: document.getElementById("matches-list"),
  reloadMatches: document.getElementById("reload-matches"),
};

const session = getAdminSession();
const state = {
  token: session.token,
  players: [],
  matches: [],
};

let evidenceModal;
let evidenceImage;
let evidenceLabel;

function headers() {
  return { "Content-Type": "application/json", "x-admin-token": state.token || "" };
}

function playerName(id) {
  return state.players.find((p) => p.id === id)?.name || "Desconhecido";
}

function formatScorer(sc) {
  if (!sc) return "";
  const ownerId = sc.ownerId || sc.playerId;
  const owner = ownerId ? playerName(ownerId) : "";
  const name = sc.name || playerName(sc.playerId) || "Artilheiro";
  return owner ? `${name} (${owner})` : name;
}

function ensureEvidenceModal() {
  if (evidenceModal) return evidenceModal;
  evidenceModal = document.createElement("div");
  evidenceModal.className = "evidence-modal hidden";
  evidenceModal.innerHTML = `
    <div class="evidence-dialog">
      <button class="icon-btn close-evidence" aria-label="Fechar">X</button>
      <img class="evidence-image" alt="Imagem enviada" />
      <div class="muted evidence-name"></div>
    </div>
  `;
  evidenceModal.addEventListener("click", (e) => {
    if (e.target === evidenceModal) hideEvidence();
  });
  document.body.appendChild(evidenceModal);
  evidenceImage = evidenceModal.querySelector(".evidence-image");
  evidenceLabel = evidenceModal.querySelector(".evidence-name");
  evidenceModal.querySelector(".close-evidence").addEventListener("click", hideEvidence);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideEvidence();
  });
  return evidenceModal;
}

function hideEvidence() {
  if (evidenceModal) {
    evidenceModal.classList.add("hidden");
    if (evidenceImage) evidenceImage.src = "";
  }
}

function openEvidence(ev) {
  if (!ev?.data) {
    alert("Nenhuma imagem anexada.");
    return;
  }
  ensureEvidenceModal();
  evidenceImage.src = ev.data;
  evidenceLabel.textContent = ev.name || "Imagem enviada";
  evidenceModal.classList.remove("hidden");
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    logoutAdmin();
    return;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Erro na requisio");
  return json;
}

async function loadPlayers() {
  state.players = await fetchJson("/api/players");
  renderPlayers();
}

async function loadSuggestions() {
  try {
    const suggestions = await fetchJson("/api/suggestions", { headers: headers() });
    renderPending(suggestions);
  } catch (err) {
    els.pendingList.innerHTML = `<div class="chip">${err.message}</div>`;
  }
}

async function loadMatches() {
  try {
    state.matches = await fetchJson("/api/matches");
    renderMatches();
  } catch (err) {
    els.matchesList.innerHTML = `<div class="chip">${err.message}</div>`;
  }
}

function renderPlayers() {
  if (!els.playersList) return;
  if (!state.players.length) {
    els.playersList.innerHTML = '<div class="chip">Nenhum jogador cadastrado.</div>';
    return;
  }

  els.playersList.innerHTML = state.players
    .map(
      (p) => `
        <div class="card">
          <div class="match-row">
            <div class="score">${p.name}</div>
            <div class="actions">
              <button class="btn secondary" data-player="${p.id}" data-action="edit-player">Editar</button>
              <button class="btn" data-player="${p.id}" data-action="delete-player">Excluir</button>
            </div>
          </div>
        </div>
      `
    )
    .join("");

  els.playersList.querySelectorAll("button").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-player");
      const action = btn.getAttribute("data-action");
      if (action === "edit-player") {
        const current = state.players.find((p) => p.id === id);
        const newName = prompt("Novo nome do jogador:", current?.name || "");
        if (!newName) return;
        try {
          await fetchJson(`/api/players/${id}`, {
            method: "PATCH",
            headers: headers(),
            body: JSON.stringify({ name: newName }),
          });
          await loadPlayers();
          await loadSuggestions();
          await loadMatches();
        } catch (err) {
          alert(err.message);
        }
      } else if (action === "delete-player") {
        if (!confirm("Excluir jogador? Necessario nao estar em partidas.")) return;
        try {
          await fetchJson(`/api/players/${id}`, { method: "DELETE", headers: headers() });
          await loadPlayers();
          await loadSuggestions();
          await loadMatches();
        } catch (err) {
          alert(err.message);
        }
      }
    })
  );
}

function renderPending(list) {
  if (!list.length) {
    els.pendingList.innerHTML = '<div class="chip">Nenhum palpite pendente.</div>';
    return;
  }

  els.pendingList.innerHTML = list
    .map(
      (s) => `
        <div class="card">
          <div class="match-row">
            <div>
              <div class="score">${playerName(s.homeId)} ${s.homeScore} x ${s.awayScore} ${playerName(s.awayId)}</div>
              <div class="muted">Enviado por ${s.submittedBy || "Anonimo"}</div>
            </div>
            <div class="actions">
              ${s.evidence?.data ? `<button class="icon-btn" data-id="${s.id}" data-action="view-evidence" title="Ver imagem">📸</button>` : ""}
              <button class="btn secondary" data-id="${s.id}" data-action="reject">Rejeitar</button>
              <button class="btn" data-id="${s.id}" data-action="approve">Aprovar</button>
            </div>
          </div>
          ${
            s.scorers?.length
              ? `<div class="muted" style="margin-top:8px;">Gols: ${s.scorers
                  .map((sc) => `${formatScorer(sc)} (${sc.goals})`)
                  .join(", ")}</div>`
              : ""
          }
        </div>
      `
    )
    .join("");

  els.pendingList.querySelectorAll("button").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      try {
        if (action === "view-evidence") {
          const ev = list.find((item) => item.id === id)?.evidence;
          openEvidence(ev);
          return;
        }
        if (action === "approve") {
          await fetchJson(`/api/suggestions/${id}/approve`, { method: "POST", headers: headers() });
        } else {
          await fetchJson(`/api/suggestions/${id}`, { method: "DELETE", headers: headers() });
        }
        await loadSuggestions();
      } catch (err) {
        alert(err.message);
      }
    })
  );
}

function resolveOwnerId(ownerRaw, match) {
  const normalized = (ownerRaw || "").toLowerCase();
  const playersByName = new Map(
    state.players.map((p) => [p.name.toLowerCase(), p.id])
  );

  if (normalized === "mandante" || normalized === "casa" || normalized === "home") {
    return match.homeId;
  }
  if (normalized === "visitante" || normalized === "fora" || normalized === "away") {
    return match.awayId;
  }

  const homeName = playerName(match.homeId).toLowerCase();
  const awayName = playerName(match.awayId).toLowerCase();
  if (normalized === homeName) return match.homeId;
  if (normalized === awayName) return match.awayId;

  if (playersByName.has(normalized)) return playersByName.get(normalized);
  throw new Error(`Time '${ownerRaw}' nao reconhecido. Use mandante/visitante ou o nome do time.`);
}

function parseScorersInput(input, match) {
  const text = (input || "").trim();
  if (!text) return [];

  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.map((chunk) => {
    const [name, ownerRaw, goalsRaw] = chunk.split(":").map((p) => p?.trim() || "");
    if (!name || !ownerRaw || !goalsRaw) {
      throw new Error("Formato invalido. Use Nome:mandante|visitante|time:gols");
    }
    const goals = Number(goalsRaw);
    if (!Number.isInteger(goals) || goals <= 0) {
      throw new Error(`Gols invalidos para '${name}'.`);
    }
    const ownerId = resolveOwnerId(ownerRaw, match);
    return { name, goals, ownerId };
  });
}

function renderMatches() {
  if (!els.matchesList) return;
  if (!state.matches.length) {
    els.matchesList.innerHTML = '<div class="chip">Nenhuma partida aprovada.</div>';
    return;
  }

  els.matchesList.innerHTML = state.matches
    .slice()
    .sort((a, b) => new Date(b.approvedAt || b.createdAt) - new Date(a.approvedAt || a.createdAt))
    .map(
      (m) => `
        <div class="card">
          <div class="match-row">
            <div>
              <div class="score">${playerName(m.homeId)} ${m.homeScore} x ${m.awayScore} ${playerName(m.awayId)}</div>
              <div class="muted">${new Date(m.approvedAt || m.createdAt).toLocaleString("pt-BR")}</div>
            </div>
            <div class="actions">
              ${m.evidence?.data ? `<button class="icon-btn" data-match="${m.id}" data-action="view-evidence" title="Ver imagem">📸</button>` : ""}
              <button class="btn secondary" data-match="${m.id}" data-action="edit-match">Editar</button>
              <button class="btn" data-match="${m.id}" data-action="delete-match">Excluir</button>
            </div>
          </div>
          ${
            m.scorers?.length
              ? `<div class="muted" style="margin-top:8px;">Gols: ${m.scorers
                  .map((sc) => `${formatScorer(sc)} (${sc.goals})`)
                  .join(", ")}</div>`
              : ""
          }
        </div>
      `
    )
    .join("");

  els.matchesList.querySelectorAll("button").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-match");
      const action = btn.getAttribute("data-action");
      const match = state.matches.find((m) => m.id === id);
      if (!match) return;

      try {
        if (action === "view-evidence") {
          openEvidence(match.evidence);
          return;
        }
        if (action === "edit-match") {
          const newHome = prompt(`Gols de ${playerName(match.homeId)}`, String(match.homeScore ?? ""));
          const newAway = prompt(`Gols de ${playerName(match.awayId)}`, String(match.awayScore ?? ""));
          if (newHome === null || newAway === null) return;

          let scorersPayload = match.scorers || [];
          const wantsScorers = confirm(
            "Deseja editar artilheiros? (formato: Nome:mandante|visitante|nomeDoTime:gols, separados por virgula)"
          );
          if (wantsScorers) {
            const defaultScorers = (match.scorers || [])
              .map((sc) => {
                const ownerId = sc.ownerId || sc.playerId;
                const ownerLabel =
                  ownerId === match.homeId
                    ? "mandante"
                    : ownerId === match.awayId
                    ? "visitante"
                    : playerName(ownerId) || "";
                return `${sc.name || playerName(sc.playerId) || ""}:${ownerLabel}:${sc.goals ?? 0}`;
              })
              .join(", ");
            const raw = prompt(
              "Artilheiros (Nome:mandante|visitante|nomeDoTime:gols, separados por virgula)",
              defaultScorers
            );
            if (raw === null) return;
            scorersPayload = parseScorersInput(raw, match);
          }

          await fetchJson(`/api/matches/${id}`, {
            method: "PATCH",
            headers: headers(),
            body: JSON.stringify({
              homeScore: Number(newHome),
              awayScore: Number(newAway),
              scorers: scorersPayload,
            }),
          });
        } else if (action === "delete-match") {
          if (!confirm("Remover este confronto?")) return;
          await fetchJson(`/api/matches/${id}`, { method: "DELETE", headers: headers() });
        }
        await loadMatches();
      } catch (err) {
        alert(err.message);
      }
    })
  );
}

els.playerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.playerFeedback.textContent = "";
  try {
    await fetchJson("/api/players", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name: els.playerName.value }),
    });
    els.playerFeedback.textContent = "Jogador adicionado!";
    els.playerFeedback.className = "feedback ok";
    els.playerForm.reset();
    await loadPlayers();
  } catch (err) {
    els.playerFeedback.textContent = err.message;
    els.playerFeedback.className = "feedback err";
  }
});

els.reload.addEventListener("click", loadSuggestions);
els.reloadMatches?.addEventListener("click", loadMatches);

(async function init() {
  if (!requireAdmin()) return;
  setupNavAuth();
  await loadPlayers();
  await loadSuggestions();
  await loadMatches();
})();
