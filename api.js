/**
 * api.js – Integração com https://worldcup26.ir
 *
 * Endpoints:
 *   GET /get/games    → todos os 104 jogos
 *   GET /get/teams    → 48 times
 *   GET /get/stadiums → 16 estádios
 *   GET /get/groups   → classificação dos grupos
 *
 * Fallback: ESPN unofficial API (https://site.api.espn.com)
 *   Usado automaticamente se worldcup26.ir estiver indisponível.
 *   Os placares são mapeados por nome de time sobre os jogos em cache.
 */

import { saveCache, loadCache, loadCacheStale } from "./storage.js";

const BASE_URL = "https://worldcup26.ir";

// Proxies CORS para contornar bloqueios
const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

/* ─────────────────────────────────────────────────────────
   FALLBACK: ESPN API
   ───────────────────────────────────────────────────────── */

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260601-20260720";

// API FIFA oficial (backup adicional)
const FIFA_API_URL = "https://api.fifa.com/api/v3/calendar/matches";

/** Normaliza nome de time para matching fuzzy (minúsculo, sem acentos, sem espaços extras). */
function _normalizeTeamName(name = "") {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .trim();
}

/**
 * Busca placares atualizados da API da ESPN e os aplica sobre os jogos
 * já armazenados em cache (que possuem os IDs corretos).
 * @param {Object[]} cachedGames - Jogos do cache expirado do worldcup26.ir
 * @returns {Object[]} Jogos com placares atualizados
 */
async function _fetchScoresFromESPN(cachedGames) {
  // Tenta ESPN com proxies se necessário
  const attempts = [
    ESPN_SCOREBOARD_URL,
    ...CORS_PROXIES.map(proxy => proxy(ESPN_SCOREBOARD_URL))
  ];

  let data = null;
  for (const url of attempts) {
    try {
      const res = await _fetchWithTimeout(url, 5000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      break;
    } catch (err) {
      console.warn("[api] ESPN tentativa falhou:", err.message);
    }
  }

  if (!data) throw new Error("ESPN indisponível");

    // Monta lookup: "homename__awayname" → game object (referência)
    const lookup = new Map();
    for (const g of cachedGames) {
      const key = `${_normalizeTeamName(g.home_team_name_en)}__${_normalizeTeamName(g.away_team_name_en)}`;
      lookup.set(key, g);
    }

    for (const event of (data.events ?? [])) {
      const comp = event.competitions?.[0];
      if (!comp) continue;

      const home = comp.competitors?.find((c) => c.homeAway === "home");
      const away = comp.competitors?.find((c) => c.homeAway === "away");
      if (!home || !away) continue;

      const key = `${_normalizeTeamName(home.team?.displayName ?? "")}__${_normalizeTeamName(away.team?.displayName ?? "")}`;
      const cached = lookup.get(key);
      if (!cached) continue;

      const finished = comp.status?.type?.completed ?? false;
      const inProgress = comp.status?.type?.state === "in";

      cached.home_score = parseInt(home.score ?? "0") || 0;
      cached.away_score = parseInt(away.score ?? "0") || 0;
      cached.finished = finished ? "TRUE" : "FALSE";
      if (inProgress) cached._live = true;
    }

  console.info("[api] Placares atualizados via ESPN (fallback).");
  return cachedGames;
}

/* ─────────────────────────────────────────────────────────
   CORE FETCHER
   ───────────────────────────────────────────────────────── */

/**
 * Tenta buscar de uma URL com timeout reduzido.
 * @param {string} url
 * @param {number} timeout em ms
 * @returns {Promise<Response>}
 */
async function _fetchWithTimeout(url, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { mode: "cors", signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Busca um endpoint com retry automático usando proxies CORS.
 * @param {string} path       Ex.: "/get/games"
 * @param {boolean} skipCache Forçar nova requisição
 */
async function fetchEndpoint(path, skipCache = false) {
  const cacheKey = path.replace(/\//g, "_").replace(/^_/, "");

  // Usa cache se disponível e não for skipCache
  if (!skipCache) {
    const cached = loadCache(cacheKey);
    if (cached !== null) {
      console.log(`[api] Usando cache para ${path}`);
      return cached;
    }
  }

  const fullUrl = `${BASE_URL}${path}`;
  const attempts = [
    () => _fetchWithTimeout(fullUrl, 5000),
    ...CORS_PROXIES.map(proxy => () => _fetchWithTimeout(proxy(fullUrl), 6000))
  ];

  let lastError = null;

  // Tenta cada URL sequencialmente
  for (let i = 0; i < attempts.length; i++) {
    try {
      const res = await attempts[i]();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      saveCache(cacheKey, data);
      console.log(`[api] Sucesso via ${i === 0 ? 'direto' : `proxy ${i}`} para ${path}`);
      return data;
    } catch (err) {
      lastError = err;
      console.warn(`[api] Tentativa ${i + 1} falhou para ${path}:`, err.message);
    }
  }

  // Todas as tentativas falharam – usa cache expirado
  const stale = loadCacheStale(cacheKey);
  if (stale !== null) {
    console.warn(`[api] Todas as tentativas falharam – usando cache expirado para ${path}`);
    return stale;
  }
  
  throw lastError || new Error(`Falha ao buscar ${path}`);
}

/* ─────────────────────────────────────────────────────────
   NORMALIZADOR INTERNO
   ───────────────────────────────────────────────────────── */

/**
 * Normaliza um objeto de jogo vindo da API para garantir tipos consistentes.
 * - finished: sempre "TRUE" | "FALSE" (string)
 * - home_score / away_score: sempre number
 * - id: sempre string
 */
function _normalizeGame(g) {
  return {
    ...g,
    id: String(g.id),
    finished: (g.finished === true || g.finished === "TRUE" || g.finished === "true") ? "TRUE" : "FALSE",
    home_score: g.home_score != null ? Number(g.home_score) : 0,
    away_score: g.away_score != null ? Number(g.away_score) : 0,
  };
}

/** Extrai array de uma resposta que pode ser `[...]` ou `{ data:[...] }` etc. */
function _toArray(data, ...keys) {
  if (Array.isArray(data)) return data;
  for (const k of keys) {
    if (Array.isArray(data?.[k])) return data[k];
  }
  return [];
}

/* ─────────────────────────────────────────────────────────
   EXPORTS PÚBLICOS
   ───────────────────────────────────────────────────────── */

/**
 * Retorna apenas os jogos da fase de grupos (type === "group").
 * Tenta worldcup26.ir primeiro. Se falhar e não houver cache, tenta ESPN como fallback 2.
 * @param {boolean} skipCache
 * @returns {Promise<Object[]>}
 */
export async function fetchGames(skipCache = false) {
  try {
    const data = await fetchEndpoint("/get/games", skipCache);
    const arr = _toArray(data, "games", "data", "results");
    return arr.filter((g) => g.type === "group").map(_normalizeGame);
  } catch (primaryErr) {
    // Fallback 2: ESPN API – obtém placares sobre os jogos do cache expirado
    console.warn("[api] worldcup26.ir sem cache disponível – tentando ESPN:", primaryErr.message);
    const staleRaw = loadCacheStale("get_games");
    const staleGames = staleRaw
      ? _toArray(staleRaw, "games", "data", "results")
        .filter((g) => g.type === "group")
        .map(_normalizeGame)
      : [];

    if (staleGames.length === 0) {
      throw new Error("Sem dados disponíveis: worldcup26.ir e cache expirado inacessíveis.");
    }

    try {
      return await _fetchScoresFromESPN(staleGames);
    } catch (espnErr) {
      console.warn("[api] ESPN também falhou – retornando cache expirado sem atualização:", espnErr.message);
      return staleGames;
    }
  }
}

/**
 * Retorna Map<id, team> para acesso rápido.
 * @returns {Promise<Map<string, Object>>}
 */
export async function fetchTeams() {
  const data = await fetchEndpoint("/get/teams");
  const arr = _toArray(data, "teams", "data", "results");
  const map = new Map();
  for (const t of arr) map.set(String(t.id), t);
  // Debug: log first team so we know which fields the API returns
  if (arr.length > 0) console.debug("[api] team fields:", Object.keys(arr[0]), arr[0]);
  return map;
}

/**
 * Retorna Map<id, stadium>.
 * @returns {Promise<Map<string, Object>>}
 */
export async function fetchStadiums() {
  const data = await fetchEndpoint("/get/stadiums");
  const arr = _toArray(data, "stadiums", "data", "results");
  const map = new Map();
  for (const s of arr) map.set(String(s.id), s);
  return map;
}

/** Retorna os dados de classificação dos grupos. */
export async function fetchGroups() {
  return fetchEndpoint("/get/groups");
}

/* ─────────────────────────────────────────────────────────
   HELPER: obtém nome de um time a partir do objeto game
   ───────────────────────────────────────────────────────── */

/**
 * @param {Object} game
 * @param {"home"|"away"} side
 * @param {Map<string,Object>} teamsMap
 */
/**
 * Retorna a URL da bandeira de um time, ou null se não disponível.
 * @param {Object} game
 * @param {"home"|"away"} side
 * @param {Map<string,Object>} teamsMap
 */
export function getTeamFlag(game, side, teamsMap) {
  const id = game[`${side}_team_id`];
  const team = teamsMap.get(String(id));
  return team?.flag ?? null;
}

export function getTeamName(game, side, teamsMap) {
  // Games already carry the English team name directly
  const inlineLabel = game[`${side}_team_name_en`];
  if (inlineLabel && inlineLabel.trim()) return inlineLabel.trim();

  // Fallback: label field (used for knockout rounds where teams aren't decided yet)
  const label = game[`${side}_team_label`];
  if (label && label.trim()) return label.trim();

  // Last resort: look up by id in the teams map
  const id = game[`${side}_team_id`];
  const team = teamsMap.get(String(id));
  if (!team) return `Time ${id}`;
  return team.name_en ?? team.name ?? team.short_name ?? team.label ?? team.code ?? `Time ${id}`;
}
