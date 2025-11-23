const state = { players: [], matches: [] };

const els = {
  h2hA: document.getElementById("h2h-a"),
  h2hB: document.getElementById("h2h-b"),
  h2hStats: document.getElementById("h2h-stats"),
  h2hList: document.getElementById("h2h-list"),
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Erro ao carregar dados");
  return res.json();
}

function playerName(id) {
  return state.players.find((p) => p.id === id)?.name || "";
}


function aggregateTopScorer(games, ownerId) {
  const map = new Map();
  games.forEach((m) => {
    (m.scorers || []).forEach((s) => {
      const scorerOwner = s.ownerId || s.playerId;
      if (scorerOwner !== ownerId) return;
      const name = (s.name || "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, { name, goals: 0 });
      map.get(key).goals += Number(s.goals) || 0;
    });
  });
  if (!map.size) return null;
  return Array.from(map.values()).sort((a, b) => b.goals - a.goals)[0];
}

function formatMatchScorers(match, ownerId) {
  const list = (match.scorers || []).filter((s) => (s.ownerId || s.playerId) === ownerId);
  if (!list.length) return "";
  return list.map((s) => `${s.name || "Artilheiro"} (${s.goals || 0})`).join(", ");
}

function populatePlayers() {
  [els.h2hA, els.h2hB].forEach((select) => {
    select.innerHTML =
      '<option value="">Selecione</option>' +
      state.players.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
  });
  els.h2hA.value = state.players[0]?.id || "";
  els.h2hB.value = state.players[1]?.id || "";
}

function renderH2H() {
  const a = els.h2hA.value;
  const b = els.h2hB.value;
  if (!a || !b || a === b) {
    els.h2hStats.innerHTML = '<div class="chip">Selecione dois jogadores diferentes.</div>';
    els.h2hList.innerHTML = "";
    return;
  }

  const games = state.matches.filter(
    (m) => (m.homeId === a && m.awayId === b) || (m.homeId === b && m.awayId === a)
  );

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let goalsA = 0;
  let goalsB = 0;

  const totalGoals = games.reduce((sum, m) => sum + (m.homeScore || 0) + (m.awayScore || 0), 0);
  const avgGoals = games.length ? (totalGoals / games.length).toFixed(1) : "0.0";

  games.forEach((m) => {
    const aIsHome = m.homeId === a;
    const scoreA = aIsHome ? m.homeScore : m.awayScore;
    const scoreB = aIsHome ? m.awayScore : m.homeScore;
    goalsA += scoreA;
    goalsB += scoreB;
    if (scoreA > scoreB) winsA += 1;
    else if (scoreA < scoreB) winsB += 1;
    else draws += 1;
  });

  const topA = aggregateTopScorer(games, a);
  const topB = aggregateTopScorer(games, b);

  els.h2hStats.innerHTML = `
    <div class="stat"><div class="label">Jogos</div><div class="value">${games.length}</div></div>
    <div class="stat"><div class="label">Vitorias ${playerName(a)}</div><div class="value">${winsA}</div></div>
    <div class="stat"><div class="label">Empates</div><div class="value">${draws}</div></div>
    <div class="stat"><div class="label">Vitorias ${playerName(b)}</div><div class="value">${winsB}</div></div>
    <div class="stat"><div class="label">Gols ${playerName(a)}</div><div class="value">${goalsA}</div></div>
    <div class="stat"><div class="label">Gols ${playerName(b)}</div><div class="value">${goalsB}</div></div>
    <div class="stat"><div class="label">Artilheiro ${playerName(a)}</div><div class="value top-scorer">${topA ? `${topA.name} (${topA.goals})` : "-"}</div></div>
    <div class="stat"><div class="label">Artilheiro ${playerName(b)}</div><div class="value top-scorer">${topB ? `${topB.name} (${topB.goals})` : "-"}</div></div>
    <div class="stat"><div class="label">Media de gols</div><div class="value">${avgGoals}</div></div>
  `;

  if (!games.length) {
    els.h2hList.innerHTML = '<div class="chip">Nenhum confronto registrado.</div>';
    return;
  }

  els.h2hList.innerHTML = games
    .slice()
    .sort((a, b) => new Date(b.approvedAt || b.createdAt) - new Date(a.approvedAt || a.createdAt))
    .map(
      (m) => `
        <div class="card">
          <div class="match-row">
            <div class="score">${playerName(m.homeId)} ${m.homeScore} x ${m.awayScore} ${playerName(m.awayId)}</div>
            <span class="muted">${new Date(m.approvedAt || m.createdAt).toLocaleDateString("pt-BR")}</span>
          </div>
          ${
            m.scorers?.length
              ? `<div class="muted" style="margin-top:6px;">
                  ${formatMatchScorers(m, a) ? `${playerName(a)}: ${formatMatchScorers(m, a)}` : ""}
                  ${formatMatchScorers(m, a) && formatMatchScorers(m, b) ? "<br>" : ""}
                  ${formatMatchScorers(m, b) ? `${playerName(b)}: ${formatMatchScorers(m, b)}` : ""}
                </div>`
              : ""
          }
        </div>
      `
    )
    .join("");
}
async function loadData() {
  try {
    const [players, matches] = await Promise.all([fetchJson("/api/players"), fetchJson("/api/matches")]);
    state.players = players;
    state.matches = matches;
    populatePlayers();
    renderH2H();
  } catch (err) {
    els.h2hStats.innerHTML = `<div class="chip">${err.message}</div>`;
  }
}

els.h2hA.addEventListener("change", renderH2H);
els.h2hB.addEventListener("change", renderH2H);

loadData();

document.addEventListener("DOMContentLoaded", () => {
  if (typeof setupNavAuth === "function") {
    setupNavAuth();
  }
});