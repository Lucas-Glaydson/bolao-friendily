/**
 * utils.js – Funções auxiliares e constantes compartilhadas
 */

/* ─────────────────────────────────────────────────────────
   CONSTANTES
   ───────────────────────────────────────────────────────── */

export const AMIGOS = [
  "Lucas", "Alefe", "Caetano", "Evelin", "Ingrid",
  "Rafael", "Valdemir", "Mauro", "Anderson", "AdilsonJR",
  "Felipe", "Miguel", "Bruno", "Emmanuel", "Zaine",
];

/* ─────────────────────────────────────────────────────────
   PONTUAÇÃO
   ───────────────────────────────────────────────────────── */

/**
 * Calcula pontos de um palpite versus placar oficial.
 * @returns {3|1|0|null} null se faltarem dados.
 */
export function calcularPontos(palpite, oficial) {
  if (!palpite || !oficial) return null;
  const p = parsePlacar(palpite);
  const o = parsePlacar(oficial);
  if (!p || !o) return null;

  const [pg, ps] = p;
  const [og, os] = o;

  if (pg === og && ps === os) return 3;
  if (Math.sign(pg - ps) === Math.sign(og - os)) return 1;
  return 0;
}

/**
 * Converte "2 x 1" → [2, 1] ou null se inválido.
 */
export function parsePlacar(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d+)\s*[xX]\s*(\d+)$/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

/* ─────────────────────────────────────────────────────────
   VALIDAÇÃO E FORMATAÇÃO
   ───────────────────────────────────────────────────────── */

/** Retorna true se o palpite está no formato aceito ou está vazio. */
export function validarPalpite(str) {
  if (!str || String(str).trim() === "") return true;
  return /^\d+\s*[xX]\s*\d+$/.test(String(str).trim());
}

/** Normaliza "2x1" → "2 x 1". */
export function normalizarPalpite(str) {
  if (!str) return "";
  const p = parsePlacar(str);
  if (!p) return String(str);
  return `${p[0]} x ${p[1]}`;
}

/** Ícone/badge para uma pontuação. */
export function pontosBadge(pts) {
  if (pts === 3) return "✅";
  if (pts === 1) return "🟡";
  if (pts === 0) return "❌";
  return "";
}

/* ─────────────────────────────────────────────────────────
   STATUS DO JOGO
   ───────────────────────────────────────────────────────── */

/**
 * Infere o status de um jogo: "finished" | "live" | "scheduled".
 * Usa game._utcMs (timestamp UTC correto) se disponível; caso contrário,
 * cai no parseGameDate (pode ter desvio de fuso se _enrichGamesUtcMs não rodou).
 */
export function getStatus(game, now = new Date()) {
  if (game.finished === "TRUE") return "finished";
  const ts = game._utcMs ?? parseGameDate(game.local_date)?.getTime() ?? null;
  if (ts === null) return "scheduled";
  const diff = now.getTime() - ts; // ms
  if (diff >= 0 && diff < 130 * 60 * 1000) return "live";      // até ~2h10
  if (diff >= 130 * 60 * 1000) return "finished";               // presumidamente finalizado
  return "scheduled";
}

export function getStatusLabel(status) {
  return { scheduled: "⏳ Agendado", live: "🔴 Ao vivo", finished: "✅ Finalizado" }[status] ?? "—";
}

/**
 * Converte a data da API para um objeto Date.
 * A API worldcup26.ir usa o formato MM/DD/YYYY HH:MM (ex: "06/11/2026 13:00" = 11 de junho).
 */
export function parseGameDate(localDate) {
  if (!localDate) return null;
  // Tenta MM/DD/YYYY HH:MM (formato principal da API)
  const m = String(localDate).match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, mo, d, y, h, mi] = m;  // first token = month, second = day
  const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

/* ─────────────────────────────────────────────────────────
   MISC
   ───────────────────────────────────────────────────────── */

/** Gera placar aleatório 0-3 × 0-3. */
export function randomPlacar() {
  return `${Math.floor(Math.random() * 4)} x ${Math.floor(Math.random() * 4)}`;
}

/** Debounce genérico. */
export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
