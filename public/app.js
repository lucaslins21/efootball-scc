const state = {
  players: [],
  matches: [],
};

const els = {
  leaderboard: document.getElementById("leaderboard-body"),
  sortBy: document.getElementById("sort-by"),
  search: document.getElementById("search-player"),
  totalMatches: document.getElementById("total-matches"),
  totalGoals: document.getElementById("total-goals"),
  totalPlayers: document.getElementById("total-players"),
  recent: document.getElementById("recent-matches"),
  topScorers: document.getElementById("top-scorers"),
  scorersSearch: document.getElementById("artilharia-search"),
};

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao comunicar com o servidor");
  }
  return res.json();
}

function playerName(id) {
  return state.players.find((p) => p.id === id)?.name || "";
}

function computeStats() {
  const map = new Map();
  state.players.forEach((p) =>
    map.set(p.id, {
      playerId: p.id,
      name: p.name,
      pontos: 0,
      jogos: 0,
      vitorias: 0,
      empates: 0,
      derrotas: 0,
      golsPro: 0,
      golsContra: 0,
      saldo: 0,
      aproveitamento: 0,
    })
  );

  state.matches.forEach((m) => {
    const home = map.get(m.homeId);
    const away = map.get(m.awayId);
    if (!home || !away) return;
    home.jogos += 1;
    away.jogos += 1;
    home.golsPro += m.homeScore;
    home.golsContra += m.awayScore;
    away.golsPro += m.awayScore;
    away.golsContra += m.homeScore;

    if (m.homeScore > m.awayScore) {
      home.vitorias += 1;
      away.derrotas += 1;
      home.pontos += 3;
    } else if (m.homeScore < m.awayScore) {
      away.vitorias += 1;
      home.derrotas += 1;
      away.pontos += 3;
    } else {
      home.empates += 1;
      away.empates += 1;
      home.pontos += 1;
      away.pontos += 1;
    }
  });

  map.forEach((s) => {
    s.saldo = s.golsPro - s.golsContra;
    s.aproveitamento = s.jogos ? ((s.pontos / (s.jogos * 3)) * 100).toFixed(1) : "0.0";
  });

  return Array.from(map.values());
}

function renderLeaderboard() {
  const stats = computeStats();
  const sortKey = els.sortBy.value;
  const term = (els.search.value || "").toLowerCase();

  const filtered = stats.filter((s) => s.name.toLowerCase().includes(term));
  filtered.sort((a, b) => Number(b[sortKey]) - Number(a[sortKey]) || b.saldo - a.saldo);

  els.leaderboard.innerHTML = filtered
    .map(
      (s) => `
        <tr>
          <td>${s.name}</td>
          <td>${s.pontos}</td>
          <td>${s.jogos}</td>
          <td>${s.vitorias}</td>
          <td>${s.empates}</td>
          <td>${s.derrotas}</td>
          <td>${s.golsPro}</td>
          <td>${s.golsContra}</td>
          <td>${s.saldo}</td>
          <td>${s.aproveitamento}%</td>
        </tr>
      `
    )
    .join("");
}

function renderHeroStats() {
  const totalMatches = state.matches.length;
  const totalGoals = state.matches.reduce(
    (sum, m) => sum + (m.homeScore || 0) + (m.awayScore || 0),
    0
  );
  els.totalMatches.textContent = totalMatches;
  els.totalGoals.textContent = totalGoals;
  els.totalPlayers.textContent = state.players.length;
}

function formatScorer(s) {
  if (!s) return "";
  const name = s.name || playerName(s.playerId) || "Artilheiro";
  const ownerId = s.ownerId || s.playerId;
  const owner = ownerId ? playerName(ownerId) : "";
  return owner ? `${name} (${owner})` : name;
}

function groupScorersByOwner(list = []) {
  if (!list.length) return "";
  const groups = new Map();
  list.forEach((s) => {
    const ownerId = s.ownerId || s.playerId;
    const owner = ownerId ? playerName(ownerId) : "Time";
    const label = s.name || playerName(s.playerId) || "Artilheiro";
    const item = `${label} (${s.goals})`;
    if (!groups.has(owner)) groups.set(owner, []);
    groups.get(owner).push(item);
  });

  return Array.from(groups.entries())
    .map(([owner, items]) => `${owner}: ${items.join(", ")}`)
    .join("<br>");
}

function renderRecentMatches() {
  const list = [...state.matches].sort(
    (a, b) => new Date(b.approvedAt || b.createdAt) - new Date(a.approvedAt || a.createdAt)
  );
  if (!list.length) {
    els.recent.innerHTML = '<div class="chip">Nenhuma partida aprovada ainda.</div>';
    return;
  }

  els.recent.innerHTML = list
    .slice(0, 8)
    .map((m) => {
      const date = new Date(m.approvedAt || m.createdAt || Date.now()).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `
        <div class="card">
          <div class="match-row">
            <div>
              <div class="score">${playerName(m.homeId)} ${m.homeScore} x ${m.awayScore} ${playerName(
        m.awayId
      )}</div>
              <div class="muted">${date} · enviado por ${m.submittedBy || "Anônimo"}</div>
            </div>
                      </div>
          ${
            m.scorers?.length
              ? `<div class="muted" style="margin-top:8px;">${groupScorersByOwner(m.scorers)}</div>`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

function renderTopScorers() {
  if (!els.topScorers) return;
  const term = (els.scorersSearch?.value || "").toLowerCase();
  const map = new Map();
  state.matches.forEach((m) => {
    (m.scorers || []).forEach((s) => {
      const rawName = s.name || playerName(s.playerId);
      const name = (rawName || "").trim();
      const goals = Number(s.goals) || 0;
      const ownerId = s.ownerId || s.playerId || "";
      if (!name || !goals) return;
      const key = `${name.toLowerCase()}|${ownerId}`;
      if (!map.has(key)) map.set(key, { name, ownerId, goals: 0 });
      map.get(key).goals += goals;
    });
  });

  const list = Array.from(map.values())
    .filter((s) => s.name.toLowerCase().includes(term))
    .sort((a, b) => b.goals - a.goals);
  if (!list.length) {
    els.topScorers.innerHTML = '<div class="chip">Nenhum gol lançado ainda.</div>';
    return;
  }

  els.topScorers.innerHTML = list
    .slice(0, 15)
    .map(
      (s, idx) => `
        <div class="card">
          <div class="match-row">
            <div class="score">${s.name}</div>
            <div class="badge">${s.goals} gol${s.goals === 1 ? "" : "s"}</div>
          </div>
          <div class="muted">Time: ${playerName(s.ownerId) || "Não marcado"}</div>
          ${idx < 3 ? '<div class="pill gray" style="margin-top:6px;">Top artilheiro</div>' : ""}
        </div>
      `
    )
    .join("");
}

async function loadData() {
  try {
    const [players, matches] = await Promise.all([
      fetchJson("/api/players"),
      fetchJson("/api/matches"),
    ]);
    state.players = players;
    state.matches = matches;
    renderLeaderboard();
    renderHeroStats();
    renderTopScorers();
    renderRecentMatches();
  } catch (err) {
    console.error(err);
  }
}

els.sortBy.addEventListener("change", renderLeaderboard);
els.search.addEventListener("input", renderLeaderboard);
els.scorersSearch?.addEventListener("input", renderTopScorers);

loadData();

document.addEventListener("DOMContentLoaded", () => {
  if (typeof setupNavAuth === "function") {
    setupNavAuth();
  }
});