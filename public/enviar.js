const state = { players: [] };

const els = {
  home: document.getElementById("home-player"),
  away: document.getElementById("away-player"),
  scorers: document.getElementById("scorers"),
  feedback: document.getElementById("feedback"),
  evidence: document.getElementById("evidence"),
  pickEvidence: document.getElementById("pick-evidence"),
  evidenceName: document.getElementById("evidence-name"),
  submittedBy: document.getElementById("submitted-by"),
};

let evidenceData = null;

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

function ownerOptions() {
  const options = [];
  if (els.home.value) options.push({ id: els.home.value, label: playerName(els.home.value) });
  if (els.away.value) options.push({ id: els.away.value, label: playerName(els.away.value) });
  return options.length
    ? options
    : state.players.map((p) => ({ id: p.id, label: p.name }));
}

function buildOwnerSelect(currentValue) {
  const select = document.createElement("select");
  select.dataset.role = "scorer-owner";
  const opts = ownerOptions();
  select.innerHTML =
    '<option value="">Time do artilheiro</option>' +
    opts.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
  if (currentValue && opts.some((o) => o.id === currentValue)) {
    select.value = currentValue;
  }
  return select;
}

function addScorerRow() {
  const row = document.createElement("div");
  row.className = "scorer-row";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Nome (ex.: Cruyff)";
  nameInput.dataset.role = "scorer-name";

  const ownerSelect = buildOwnerSelect();

  const goals = document.createElement("input");
  goals.type = "number";
  goals.min = "0";
  goals.placeholder = "Gols";
  goals.dataset.role = "scorer-goals";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.innerHTML =
    '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 448 512" fill="currentColor"><path d="M135.2 17.7C140.6 7.2 151.7 0 163.9 0h120.3c12.2 0 23.2 7.2 28.7 17.7L328 32H432c8.8 0 16 7.2 16 16s-7.2 16-16 16h-16l-21.2 355.8c-1.5 25.2-22.5 44.2-47.7 44.2H101c-25.2 0-46.2-19-47.7-44.2L32 64H16C7.2 64 0 56.8 0 48s7.2-16 16-16H120l15.2-14.3zM96 96l19.5 326.3c.2 3.1 2.8 5.7 6 5.7h198.9c3.1 0 5.7-2.6 6-5.7L345.9 96H96zm80 80c8.8 0 16 7.2 16 16v160c0 8.8-7.2 16-16 16s-16-7.2-16-16V192c0-8.8 7.2-16 16-16zm96 0c8.8 0 16 7.2 16 16v160c0 8.8-7.2 16-16 16s-16-7.2-16-16V192c0-8.8 7.2-16 16-16z"/></svg>';
  remove.className = "btn secondary icon-only";
  remove.onclick = () => row.remove();

  row.appendChild(nameInput);
  row.appendChild(ownerSelect);
  row.appendChild(goals);
  row.appendChild(remove);
  els.scorers.appendChild(row);
}

function refreshOwnerSelects() {
  els.scorers.querySelectorAll('[data-role="scorer-owner"]').forEach((select) => {
    const current = select.value;
    const newSelect = buildOwnerSelect(current);
    select.replaceWith(newSelect);
  });
}

function gatherScorers() {
  const scorers = [];
  els.scorers.querySelectorAll(".scorer-row").forEach((row) => {
    const name = row.querySelector('[data-role="scorer-name"]')?.value.trim();
    const goals = Number(row.querySelector('[data-role="scorer-goals"]')?.value);
    const ownerId = row.querySelector('[data-role="scorer-owner"]')?.value;
    if (name && Number.isInteger(goals) && goals > 0 && ownerId) {
      scorers.push({ name, goals, ownerId });
    }
  });
  return scorers;
}

function populatePlayers() {
  const selects = [els.home, els.away];
  selects.forEach((select) => {
    select.innerHTML =
      '<option value="">Selecione</option>' +
      state.players.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
  });
  refreshOwnerSelects();
}

async function loadData() {
  try {
    state.players = await fetchJson("/api/players");
    populatePlayers();
  } catch (err) {
    els.feedback.textContent = err.message;
    els.feedback.className = "feedback err";
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  const homeScore = Number(document.getElementById("home-score").value);
  const awayScore = Number(document.getElementById("away-score").value);
  const scorers = gatherScorers();

  const homeGoalsUsed = scorers
    .filter((s) => s.ownerId === els.home.value)
    .reduce((sum, s) => sum + Number(s.goals || 0), 0);
  const awayGoalsUsed = scorers
    .filter((s) => s.ownerId === els.away.value)
    .reduce((sum, s) => sum + Number(s.goals || 0), 0);

  if (homeGoalsUsed > homeScore || awayGoalsUsed > awayScore) {
    els.feedback.textContent =
      "Os gols dos artilheiros não podem exceder o placar informado.";
    els.feedback.className = "feedback err";
    return;
  }

  const payload = {
    homeId: els.home.value,
    awayId: els.away.value,
    homeScore,
    awayScore,
    submittedBy: els.submittedBy.value,
    scorers,
    evidence: evidenceData,
  };

  if (!payload.homeId || !payload.awayId || payload.homeId === payload.awayId) {
    els.feedback.textContent = "Escolha dois jogadores diferentes.";
    els.feedback.className = "feedback err";
    return;
  }

  try {
    await fetchJson("/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    els.feedback.textContent = "Sugestão enviada! Aguarde o admin aprovar.";
    els.feedback.className = "feedback ok";
    e.target.reset();
    els.scorers.innerHTML = "";
  } catch (err) {
    els.feedback.textContent = err.message;
    els.feedback.className = "feedback err";
  }
}

document.getElementById("suggest-form").addEventListener("submit", handleSubmit);
document.getElementById("add-scorer").addEventListener("click", addScorerRow);
els.home.addEventListener("change", refreshOwnerSelects);
els.away.addEventListener("change", refreshOwnerSelects);

els.evidence.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) {
    evidenceData = null;
    els.evidenceName.textContent = "Nenhum arquivo escolhido";
    return;
  }
  els.evidenceName.textContent = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    evidenceData = { name: file.name, data: reader.result };
  };
  reader.readAsDataURL(file);
});

els.pickEvidence.addEventListener("click", () => els.evidence.click());

loadData();

document.addEventListener("DOMContentLoaded", () => {
  if (typeof setupNavAuth === "function") {
    setupNavAuth();
  }
});
