const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "db.json");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "admin123";
// Credenciais fixas de admin
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "sccefootball";

// Increase JSON limit to allow base64 images in evidence uploads
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Erro ao ler db.json", err);
    return { players: [], suggestions: [], matches: [] };
  }
}

async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

async function updateData(mutator) {
  const data = await readData();
  const result = await mutator(data);
  await writeData(data);
  return result;
}

function isAdmin(req) {
  const token = req.headers["x-admin-token"] || req.query.adminToken;
  return token === ADMIN_TOKEN;
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: "Admin token inválido" });
  }
  next();
}

function validateScore(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

app.post("/api/admin/login", (req, res) => {
  const { user, password } = req.body || {};
  if (user === ADMIN_USER && password === ADMIN_PASSWORD) {
    return res.json({ token: ADMIN_TOKEN });
  }
  return res.status(401).json({ error: "Credenciais inválidas" });
});

app.get("/api/players", async (_req, res) => {
  const data = await readData();
  res.json(data.players);
});

app.post("/api/players", requireAdmin, async (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nome é obrigatório" });

  const created = await updateData((data) => {
    const exists = data.players.some(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) throw new Error("Jogador já existe");
    const player = { id: crypto.randomUUID(), name };
    data.players.push(player);
    return player;
  }).catch((err) => res.status(400).json({ error: err.message }));

  if (created) res.json(created);
});

app.patch("/api/players/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nome é obrigatório" });

  const updated = await updateData((data) => {
    const player = data.players.find((p) => p.id === id);
    if (!player) throw new Error("Jogador não encontrado");
    const exists = data.players.some(
      (p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) throw new Error("Já existe jogador com esse nome");
    player.name = name;
    return player;
  }).catch((err) => res.status(400).json({ error: err.message }));

  if (updated) res.json(updated);
});

app.delete("/api/players/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const removed = await updateData((data) => {
    const inUse =
      data.matches.some((m) => m.homeId === id || m.awayId === id) ||
      data.suggestions.some((s) => s.homeId === id || s.awayId === id);
    if (inUse) throw new Error("Jogador em uso em partidas; remova/edite partidas antes");
    const index = data.players.findIndex((p) => p.id === id);
    if (index === -1) throw new Error("Jogador não encontrado");
    data.players.splice(index, 1);
    return true;
  }).catch((err) => res.status(400).json({ error: err.message }));

  if (removed) res.json({ ok: true });
});

app.get("/api/suggestions", requireAdmin, async (_req, res) => {
  const data = await readData();
  res.json(data.suggestions);
});

app.post("/api/suggestions", async (req, res) => {
  const { homeId, awayId, homeScore, awayScore, scorers, submittedBy, evidence } =
    req.body;

  if (!homeId || !awayId || homeId === awayId) {
    return res
      .status(400)
      .json({ error: "Selecione dois jogadores diferentes" });
  }
  if (!validateScore(homeScore) || !validateScore(awayScore)) {
    return res.status(400).json({ error: "Placar inválido" });
  }

  const suggestion = await updateData((data) => {
    const playersExist = [homeId, awayId].every((id) =>
      data.players.some((p) => p.id === id)
    );
    if (!playersExist) throw new Error("Jogador não encontrado");

    const validOwners = [homeId, awayId];
    const normalizedScorers = Array.isArray(scorers)
      ? scorers
          .map((s) => ({
            name: (s.name || s.scorerName || "").trim(),
            goals: Number(s.goals),
            ownerId: s.ownerId || s.playerId,
          }))
          .filter(
            (s) =>
              s.name &&
              validateScore(s.goals) &&
              s.goals > 0 &&
              s.ownerId &&
              validOwners.includes(s.ownerId)
          )
          .map((s) => ({
            name: s.name,
            goals: Number(s.goals),
            ownerId: s.ownerId,
          }))
      : [];

    const sumHome = normalizedScorers
      .filter((s) => s.ownerId === homeId)
      .reduce((acc, s) => acc + s.goals, 0);
    const sumAway = normalizedScorers
      .filter((s) => s.ownerId === awayId)
      .reduce((acc, s) => acc + s.goals, 0);
    if (sumHome > Number(homeScore) || sumAway > Number(awayScore)) {
      throw new Error("Gols dos artilheiros excedem o placar informado");
    }

    const payload = {
      id: crypto.randomUUID(),
      homeId,
      awayId,
      homeScore: Number(homeScore),
      awayScore: Number(awayScore),
      scorers: normalizedScorers,
      submittedBy: submittedBy?.trim() || "Anônimo",
      createdAt: new Date().toISOString(),
      evidence: evidence && evidence.data ? evidence : null,
    };

    data.suggestions.push(payload);
    return payload;
  }).catch((err) => res.status(400).json({ error: err.message }));

  if (suggestion) res.json(suggestion);
});

app.post("/api/suggestions/:id/approve", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const match = await updateData((data) => {
    const index = data.suggestions.findIndex((s) => s.id === id);
    if (index === -1) throw new Error("Sugestão não encontrada");
    const suggestion = data.suggestions[index];
    data.suggestions.splice(index, 1);

    const newMatch = {
      ...suggestion,
      evidence: null, // evidências descartáveis após aprovação
      status: "approved",
      approvedAt: new Date().toISOString(),
    };
    data.matches.push(newMatch);
    return newMatch;
  }).catch((err) => res.status(404).json({ error: err.message }));

  if (match) res.json(match);
});

app.delete("/api/suggestions/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const removed = await updateData((data) => {
    const index = data.suggestions.findIndex((s) => s.id === id);
    if (index === -1) throw new Error("Sugestão não encontrada");
    data.suggestions.splice(index, 1);
    return true;
  }).catch((err) => res.status(404).json({ error: err.message }));

  if (removed) res.json({ ok: true });
});

app.get("/api/matches", async (_req, res) => {
  const data = await readData();
  res.json(data.matches);
});

app.patch("/api/matches/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { homeId, awayId, homeScore, awayScore, scorers, submittedBy, evidence } = req.body || {};

  const updated = await updateData((data) => {
    const idx = data.matches.findIndex((m) => m.id === id);
    if (idx === -1) throw new Error("Partida não encontrada");
    const match = data.matches[idx];
    const newHomeId = homeId || match.homeId;
    const newAwayId = awayId || match.awayId;
    if (!newHomeId || !newAwayId || newHomeId === newAwayId) {
      throw new Error("Selecione dois jogadores diferentes");
    }
    const playersExist = [newHomeId, newAwayId].every((pid) =>
      data.players.some((p) => p.id === pid)
    );
    if (!playersExist) throw new Error("Jogador não encontrado");

    if (!validateScore(homeScore ?? match.homeScore) || !validateScore(awayScore ?? match.awayScore)) {
      throw new Error("Placar inválido");
    }

    const validOwners = [newHomeId, newAwayId];
    const normalizedScorers = Array.isArray(scorers)
      ? scorers
          .map((s) => ({
            name: (s.name || s.scorerName || "").trim(),
            goals: Number(s.goals),
            ownerId: s.ownerId || s.playerId,
          }))
          .filter(
            (s) =>
              s.name &&
              validateScore(s.goals) &&
              s.goals > 0 &&
              s.ownerId &&
              validOwners.includes(s.ownerId)
          )
          .map((s) => ({ name: s.name, goals: Number(s.goals), ownerId: s.ownerId }))
      : match.scorers || [];

    const sumHome = normalizedScorers
      .filter((s) => s.ownerId === newHomeId)
      .reduce((acc, s) => acc + s.goals, 0);
    const sumAway = normalizedScorers
      .filter((s) => s.ownerId === newAwayId)
      .reduce((acc, s) => acc + s.goals, 0);
    if (sumHome > Number(homeScore ?? match.homeScore) || sumAway > Number(awayScore ?? match.awayScore)) {
      throw new Error("Gols dos artilheiros excedem o placar informado");
    }

    Object.assign(match, {
      homeId: newHomeId,
      awayId: newAwayId,
      homeScore: Number(homeScore ?? match.homeScore),
      awayScore: Number(awayScore ?? match.awayScore),
      scorers: normalizedScorers,
      submittedBy: submittedBy?.trim() || match.submittedBy,
      updatedAt: new Date().toISOString(),
      evidence: evidence && evidence.data ? evidence : match.evidence || null,
    });
    return match;
  }).catch((err) => res.status(400).json({ error: err.message }));

  if (updated) res.json(updated);
});

app.delete("/api/matches/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const removed = await updateData((data) => {
    const idx = data.matches.findIndex((m) => m.id === id);
    if (idx === -1) throw new Error("Partida não encontrada");
    data.matches.splice(idx, 1);
    return true;
  }).catch((err) => res.status(404).json({ error: err.message }));

  if (removed) res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "Arquivo muito grande. Tente um arquivo menor." });
  }
  console.error("Erro inesperado:", err);
  res.status(500).json({ error: "Erro interno do servidor" });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`Token do admin: ${ADMIN_TOKEN}`);
});
