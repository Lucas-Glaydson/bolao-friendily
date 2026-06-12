/**
 * api.js – Integração com https://worldcup26.ir
 *
 * Endpoints:
 *   GET /get/games    → todos os 104 jogos
 *   GET /get/teams    → 48 times
 *   GET /get/stadiums → 16 estádios
 *   GET /get/groups   → classificação dos grupos
 */

import { saveCache, loadCache, loadCacheStale } from "./storage.js";

const BASE_URL = "https://worldcup26.ir";

/* ─────────────────────────────────────────────────────────
   CORE FETCHER
   ───────────────────────────────────────────────────────── */

/**
 * Busca um endpoint com suporte a cache de 5 min.
 * @param {string} path       Ex.: "/get/games"
 * @param {boolean} skipCache Forçar nova requisição
 */
async function fetchEndpoint(path, skipCache = false) {
  const cacheKey = path.replace(/\//g, "_").replace(/^_/, "");

  if (!skipCache) {
    const cached = loadCache(cacheKey);
    if (cached !== null) return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${BASE_URL}${path}`, { mode: "cors", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} – ${path}`);
    const data = await res.json();
    saveCache(cacheKey, data);
    return data;
  } catch (err) {
    // Fallback: usa cache expirado se existir
    const stale = loadCacheStale(cacheKey);
    if (stale !== null) {
      console.warn(`[api] Usando cache expirado para ${path}:`, err.message);
      return stale;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
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
 * @param {boolean} skipCache
 * @returns {Promise<Object[]>}
 */
export async function fetchGames(skipCache = false) {
  const data = await fetchEndpoint("/get/games", skipCache);
  const arr = _toArray(data, "games", "data", "results");
  return arr.filter((g) => g.type === "group").map(_normalizeGame);
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
