const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("Faltam variaveis SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE");
  process.exit(1);
}
if (!ADMIN_TOKEN || !ADMIN_USER || !ADMIN_PASSWORD) {
  console.error("Faltam variaveis ADMIN_TOKEN, ADMIN_USER ou ADMIN_PASSWORD");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

function isAdmin(req) {
  const token = req.headers["x-admin-token"] || req.query.adminToken;
  return token === ADMIN_TOKEN;
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: "Admin token invalido" });
  }
  next();
}

function validateScore(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

async function ensurePlayersExist(ids = []) {
  const { data, error } = await supabase.from("players").select("id").in("id", ids);
  if (error) throw new Error(error.message);
  return data.length === ids.length;
}

function normalizeScorers(raw, validOwners) {
  if (!Array.isArray(raw)) return [];
  return raw
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
    .map((s) => ({ name: s.name, goals: Number(s.goals), ownerId: s.ownerId }));
}

function validateScorerSums(homeId, awayId, homeScore, awayScore, scorers) {
  const sumHome = scorers.filter((s) => s.ownerId === homeId).reduce((acc, s) => acc + s.goals, 0);
  const sumAway = scorers.filter((s) => s.ownerId === awayId).reduce((acc, s) => acc + s.goals, 0);
  if (sumHome > Number(homeScore) || sumAway > Number(awayScore)) {
    throw new Error("Gols dos artilheiros excedem o placar informado");
  }
}

function toCamel(row = {}) {
  const entries = Object.entries(row).map(([k, v]) => {
    if (k === "homeid") return ["homeId", v];
    if (k === "awayid") return ["awayId", v];
    if (k === "homescore") return ["homeScore", v];
    if (k === "awayscore") return ["awayScore", v];
    if (k === "submittedby") return ["submittedBy", v];
    if (k === "createdat") return ["createdAt", v];
    if (k === "approvedat") return ["approvedAt", v];
    if (k === "updatedat") return ["updatedAt", v];
    return [k, v];
  });
  return Object.fromEntries(entries);
}

function toSnakeSuggestion(payload) {
  return {
    id: payload.id,
    homeid: payload.homeId,
    awayid: payload.awayId,
    homescore: payload.homeScore,
    awayscore: payload.awayScore,
    scorers: payload.scorers,
    submittedby: payload.submittedBy,
    createdat: payload.createdAt,
    evidence: payload.evidence,
  };
}

function toSnakeMatch(payload) {
  return {
    id: payload.id,
    homeid: payload.homeId,
    awayid: payload.awayId,
    homescore: payload.homeScore,
    awayscore: payload.awayScore,
    scorers: payload.scorers,
    submittedby: payload.submittedBy,
    createdat: payload.createdAt,
    approvedat: payload.approvedAt,
    updatedat: payload.updatedAt,
    status: payload.status,
    evidence: payload.evidence,
  };
}

app.post("/api/admin/login", (req, res) => {
  const { user, password } = req.body || {};
  if (user === ADMIN_USER && password === ADMIN_PASSWORD) {
    return res.json({ token: ADMIN_TOKEN });
  }
  return res.status(401).json({ error: "Credenciais invalidas" });
});

// Players
app.get("/api/players", async (_req, res) => {
  const { data, error } = await supabase.from("players").select("*").order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/players", requireAdmin, async (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nome e obrigatorio" });

  const { data, error } = await supabase
    .from("players")
    .insert([{ id: crypto.randomUUID(), name }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.patch("/api/players/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nome e obrigatorio" });

  const { data, error } = await supabase.from("players").update({ name }).eq("id", id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.delete("/api/players/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;

  const inMatches = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .or(`homeId.eq.${id},awayId.eq.${id}`);
  if (inMatches.error) return res.status(500).json({ error: inMatches.error.message });
  if ((inMatches.count || 0) > 0) {
    return res
      .status(400)
      .json({ error: "Jogador em uso em partidas; remova/edite partidas antes" });
  }

  const inSuggestions = await supabase
    .from("suggestions")
    .select("id", { count: "exact", head: true })
    .or(`homeId.eq.${id},awayId.eq.${id}`);
  if (inSuggestions.error) return res.status(500).json({ error: inSuggestions.error.message });
  if ((inSuggestions.count || 0) > 0) {
    return res
      .status(400)
      .json({ error: "Jogador em uso em sugestoes; remova/edite antes" });
  }

  const { error } = await supabase.from("players").delete().eq("id", id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Suggestions
app.get("/api/suggestions", requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from("suggestions")
    .select("*")
    .order("createdat", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(toCamel));
});

app.post("/api/suggestions", async (req, res) => {
  const { homeId, awayId, homeScore, awayScore, scorers, submittedBy, evidence } = req.body || {};

  if (!homeId || !awayId || homeId === awayId) {
    return res.status(400).json({ error: "Selecione dois jogadores diferentes" });
  }
  if (!validateScore(homeScore) || !validateScore(awayScore)) {
    return res.status(400).json({ error: "Placar invalido" });
  }

  const exists = await ensurePlayersExist([homeId, awayId]);
  if (!exists) return res.status(400).json({ error: "Jogador nao encontrado" });

  const normalizedScorers = normalizeScorers(scorers, [homeId, awayId]);
  try {
    validateScorerSums(homeId, awayId, homeScore, awayScore, normalizedScorers);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const payload = {
    id: crypto.randomUUID(),
    homeId,
    awayId,
    homeScore: Number(homeScore),
    awayScore: Number(awayScore),
    scorers: normalizedScorers,
    submittedBy: submittedBy?.trim() || "Anonimo",
    createdAt: new Date().toISOString(),
    evidence: evidence && evidence.data ? evidence : null,
  };

  const { data, error } = await supabase
    .from("suggestions")
    .insert([toSnakeSuggestion(payload)])
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(toCamel(data));
});

app.post("/api/suggestions/:id/approve", requireAdmin, async (req, res) => {
  const { id } = req.params;

  const { data: suggestionRow, error: fetchError } = await supabase
    .from("suggestions")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError) return res.status(404).json({ error: "Sugestao nao encontrada" });

  const suggestion = toCamel(suggestionRow);

  const matchPayload = {
    ...suggestion,
    evidence: null,
    status: "approved",
    approvedAt: new Date().toISOString(),
  };

  const { error: insertError, data: inserted } = await supabase
    .from("matches")
    .insert([toSnakeMatch(matchPayload)])
    .select()
    .single();
  if (insertError) return res.status(400).json({ error: insertError.message });

  await supabase.from("suggestions").delete().eq("id", id);
  res.json(toCamel(inserted));
});

app.delete("/api/suggestions/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("suggestions").delete().eq("id", id);
  if (error) return res.status(404).json({ error: error.message });
  res.json({ ok: true });
});

// Matches
app.get("/api/matches", async (_req, res) => {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .order("approvedat", { ascending: false })
    .order("createdat", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(toCamel));
});

app.patch("/api/matches/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { homeId, awayId, homeScore, awayScore, scorers, submittedBy, evidence } = req.body || {};

  const { data: match, error: fetchError } = await supabase.from("matches").select("*").eq("id", id).single();
  if (fetchError) return res.status(404).json({ error: "Partida nao encontrada" });

  const newHomeId = homeId || match.homeId;
  const newAwayId = awayId || match.awayId;
  if (!newHomeId || !newAwayId || newHomeId === newAwayId) {
    return res.status(400).json({ error: "Selecione dois jogadores diferentes" });
  }

  const playersOk = await ensurePlayersExist([newHomeId, newAwayId]);
  if (!playersOk) return res.status(400).json({ error: "Jogador nao encontrado" });

  const finalHomeScore = Number(homeScore ?? match.homeScore);
  const finalAwayScore = Number(awayScore ?? match.awayScore);
  if (!validateScore(finalHomeScore) || !validateScore(finalAwayScore)) {
    return res.status(400).json({ error: "Placar invalido" });
  }

  const normalizedScorers = Array.isArray(scorers)
    ? normalizeScorers(scorers, [newHomeId, newAwayId])
    : match.scorers || [];
  try {
    validateScorerSums(newHomeId, newAwayId, finalHomeScore, finalAwayScore, normalizedScorers);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const updatePayload = {
    homeId: newHomeId,
    awayId: newAwayId,
    homeScore: finalHomeScore,
    awayScore: finalAwayScore,
    scorers: normalizedScorers,
    submittedBy: submittedBy?.trim() || match.submittedBy,
    updatedAt: new Date().toISOString(),
    evidence: evidence && evidence.data ? evidence : match.evidence || null,
  };

  const { data, error } = await supabase
    .from("matches")
    .update(toSnakeMatch({ ...match, ...updatePayload }))
    .eq("id", id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(toCamel(data));
});

app.delete("/api/matches/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("matches").delete().eq("id", id);
  if (error) return res.status(404).json({ error: error.message });
  res.json({ ok: true });
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
