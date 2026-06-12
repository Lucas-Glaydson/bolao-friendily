/**
 * render.js – Renderização da tabela e da UI de ranking
 *
 * Exporta:
 *   renderTabela(allGames, teamsMap, stadiumsMap, palpitesStore, isAdmin, filters, onPalpiteChange, onGameClick)
 *   atualizarCelulas(games, palpitesStore)  – atualização parcial (auto-refresh)
 *   atualizarTotais(allGames, palpitesStore) – recalcula só o tfoot + ranking bar
 *   updateResultCell(gameId, amigoIdx, pts, palpite) – atualiza 1 célula de resultado
 */

import { AMIGOS, calcularPontos, getStatus, getStatusLabel, pontosBadge, validarPalpite, parseGameDate } from "./utils.js";
import { getPalpite } from "./storage.js";
import { getTeamName } from "./api.js";

/* ─────────────────────────────────────────────────────────
   RENDER COMPLETO
   ───────────────────────────────────────────────────────── */

export function renderTabela(
  allGames, teamsMap, stadiumsMap, palpitesStore,
  isAdmin, filters, onPalpiteChange, onGameClick
) {
  // Aplica filtros
  let games = allGames.filter((g) => {
    if (filters.group && g.group !== filters.group) return false;
    if (filters.round && g.matchday !== filters.round) return false;
    if (filters.status && getStatus(g) !== filters.status) return false;
    return true;
  });

  // Ordena: data BRT → hora
  games.sort((a, b) => {
    const da = _gameDateBrt(a)?.getTime() ?? 0;
    const db = _gameDateBrt(b)?.getTime() ?? 0;
    return da - db;
  });

  _renderHeader();
  _renderBody(games, teamsMap, stadiumsMap, palpitesStore, isAdmin, onPalpiteChange, onGameClick);
  _renderFooter(allGames, palpitesStore);
}

/* ─────────────────────────────────────────────────────────
   ATUALIZAÇÃO PARCIAL (auto-refresh)
   ───────────────────────────────────────────────────────── */

/** Atualiza placar, status e células de resultado sem re-renderizar a tabela. */
export function atualizarCelulas(games, palpitesStore) {
  for (const game of games) {
    const tr = document.querySelector(`tr[data-game-id="${CSS.escape(String(game.id))}"]`);
    if (!tr) continue;

    const status = getStatus(game);
    const oficialPlacar = game.finished === "TRUE" ? `${game.home_score} x ${game.away_score}` : null;
    const cells = tr.cells;

    // Placar (col 1)
    if (cells[1]) {
      if (oficialPlacar) cells[1].textContent = oficialPlacar;
      else if (status === "live") cells[1].textContent = `${game.home_score ?? 0} x ${game.away_score ?? 0} 🔴`;
    }

    // Cor do palpite de cada amigo
    for (let i = 0; i < AMIGOS.length; i++) {
      const amigo = AMIGOS[i];
      const palpite = getPalpite(game.id, amigo, palpitesStore);
      const pts = calcularPontos(palpite, oficialPlacar);
      const td = cells[2 + i];
      if (td) _applyPalpiteColor(td, pts);
    }
  }
}

/** Recalcula apenas o tfoot (totais + ranking). */
export function atualizarTotais(allGames, palpitesStore) {
  _renderFooter(allGames, palpitesStore);
}

/**
 * Atualiza a célula de resultado de um amigo específico.
 * @param {string|number} gameId
 * @param {number} amigoIdx  índice no array AMIGOS
 * @param {number|null} pts
 * @param {string} palpite
 */
export function updateResultCell(gameId, amigoIdx, pts, palpite) {
  const tr = document.querySelector(`tr[data-game-id="${CSS.escape(String(gameId))}"]`);
  if (!tr) return;
  const td = tr.cells[2 + amigoIdx];
  if (td) _applyPalpiteColor(td, pts);
}

/* ─────────────────────────────────────────────────────────
   HEADER
   ───────────────────────────────────────────────────────── */

function _renderHeader() {
  const thead = document.getElementById("table-head");
  thead.innerHTML = "";
  const tr = document.createElement("tr");

  // Colunas fixas
  const fixed = [
    ["Jogo", "col-jogo"],
    ["Placar", "col-placar"],
  ];
  for (const [label, cls] of fixed) {
    const th = document.createElement("th");
    th.textContent = label;
    th.className = cls;
    tr.appendChild(th);
  }

  // Colunas por amigo
  for (const amigo of AMIGOS) {
    const thP = document.createElement("th");
    thP.textContent = amigo;
    thP.className = "col-palpite";
    thP.title = `Palpite de ${amigo}`;
    tr.appendChild(thP);

    const thR = document.createElement("th");
    thR.textContent = "Pts";
    thR.className = "col-resultado";
    tr.appendChild(thR);
  }

  // Coluna total (sticky right)
  const thT = document.createElement("th");
  thT.textContent = "Σ";
  thT.className = "col-total";
  thT.title = "Total de pontos distribuídos no jogo";
  tr.appendChild(thT);

  thead.appendChild(tr);
}

/* ─────────────────────────────────────────────────────────
   BODY
   ───────────────────────────────────────────────────────── */

function _renderBody(games, teamsMap, stadiumsMap, palpitesStore, isAdmin, onPalpiteChange, onGameClick) {
  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";

  if (games.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2 + AMIGOS.length;
    td.textContent = "Nenhum jogo encontrado para os filtros selecionados.";
    td.style.cssText = "text-align:center;padding:2rem;color:var(--text-muted)";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  let currentDay = null;   // "YYYY-MM-DD" em BRT
  let dayGames = [];
  let daySubtotals = _newSubtotals();
  let dayNum = 0;

  const flushDay = () => {
    if (dayGames.length === 0) return;
    tbody.appendChild(_makeSubtotalRow(dayGames, daySubtotals, currentDay));
    dayGames = [];
    daySubtotals = _newSubtotals();
  };

  for (const game of games) {
    const dayKey = _gameDayKey(game);  // "YYYY-MM-DD"
    if (dayKey !== currentDay) {
      flushDay();
      currentDay = dayKey;
      dayNum++;
      tbody.appendChild(_makeDayHeaderRow(dayNum, dayKey));
    }

    dayGames.push(game);
    const tr = _renderGameRow(game, teamsMap, stadiumsMap, palpitesStore, isAdmin, onPalpiteChange, onGameClick, daySubtotals);
    tbody.appendChild(tr);
  }

  flushDay();
}

/* ─────────────────────────────────────────────────────────
   HELPERS DE DATA BRT
   ───────────────────────────────────────────────────────── */

/** Converte horário local do estádio para BRT (UTC-3). */
function _gameDateBrt(game) {
  const d = parseGameDate(game.local_date);
  if (!d) return null;
  // API retorna horário local do estádio. Adiciona offset para UTC depois subtrai 3h (BRT).
  // Por simplicidade, usamos a data como veio (para ordenação relativa a ordem é a mesma).
  return d;
}

/** Retorna a chave de dia BRT no formato "YYYY-MM-DD". */
function _gameDayKey(game) {
  const d = _gameDateBrt(game);
  if (!d) return "0000-00-00";
  // Formata como YYYY-MM-DD usando os valores UTC do objeto Date
  // (parseGameDate retorna Date sem timezone, então tratamos como local)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Formata "YYYY-MM-DD" → "12 de junho" em pt-BR. */
function _formatDayLabel(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
}

/** Formata "YYYY-MM-DD" → "12 de junho de 2026" (com ano). */
function _formatDayLabelFull(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/* ─────────────────────────────────────────────────────────
   DAY HEADER ROW
   ───────────────────────────────────────────────────────── */

function _makeDayHeaderRow(dayNum, dayKey) {
  const tr = document.createElement("tr");
  tr.className = "row-group-header";

  const th = document.createElement("th");
  th.colSpan = 2;
  th.textContent = `📅  DIA ${dayNum}  ·  ${_formatDayLabelFull(dayKey)}`;
  th.scope = "rowgroup";
  tr.appendChild(th);

  const tdFill = document.createElement("td");
  tdFill.colSpan = AMIGOS.length;
  tr.appendChild(tdFill);

  return tr;
}

/* ─────────────────────────────────────────────────────────
   SUBTOTAL ROW (após cada rodada dentro de um grupo)
   ───────────────────────────────────────────────────────── */

function _makeSubtotalRow(mdGames, subtotals, dayKey) {
  const tr = document.createElement("tr");
  tr.className = "row-subtotal";

  const hasFinished = mdGames.some((g) => g.finished === "TRUE");

  const tdLabel = document.createElement("td");
  tdLabel.colSpan = 2;
  tdLabel.textContent = `↳ Subtotal  ${_formatDayLabel(dayKey)}`;
  tdLabel.style.cssText = "text-align:right;font-weight:600;font-size:.7rem;color:var(--text-muted)";
  tr.appendChild(tdLabel);

  for (const amigo of AMIGOS) {
    const td = document.createElement("td");
    const pts = subtotals[amigo] ?? 0;
    td.textContent = hasFinished ? String(pts) : "\u2014";
    td.style.cssText = "font-weight:700;text-align:center;font-size:.75rem";
    if (hasFinished && pts > 0) td.style.color = pts >= 3 ? "var(--score-exact-fg)" : "var(--gold-dark)";
    tr.appendChild(td);
  }

  return tr;
}

/* ─────────────────────────────────────────────────────────
   GAME ROW
   ───────────────────────────────────────────────────────── */

function _renderGameRow(game, teamsMap, stadiumsMap, palpitesStore, isAdmin, onPalpiteChange, onGameClick, subtotals) {
  const tr = document.createElement("tr");
  tr.dataset.gameId = String(game.id);

  const homeName = getTeamName(game, "home", teamsMap);
  const awayName = getTeamName(game, "away", teamsMap);
  const gameName = `${homeName} × ${awayName}`;
  const status = getStatus(game);
  const oficialPlacar = game.finished === "TRUE" ? `${game.home_score} x ${game.away_score}` : null;
  const livePlacar = status === "live" ? `${game.home_score ?? 0} x ${game.away_score ?? 0}` : null;

  // ── Jogo (sticky left) ──
  const tdJogo = document.createElement("td");
  tdJogo.className = "col-jogo";

  const wrapper = document.createElement("div");
  wrapper.className = "game-teams game-link";
  wrapper.setAttribute("role", "button");
  wrapper.setAttribute("tabindex", "0");
  wrapper.title = `Grupo ${game.group} · Rodada ${game.matchday}`;
  wrapper.setAttribute("aria-label", `Ver detalhes: ${gameName}`);
  wrapper.addEventListener("click", () => onGameClick(game, homeName, awayName, teamsMap, stadiumsMap));
  wrapper.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") onGameClick(game, homeName, awayName, teamsMap, stadiumsMap);
  });

  const spanHome = document.createElement("span");
  spanHome.className = "team-home";
  spanHome.textContent = homeName;

  const spanVs = document.createElement("span");
  spanVs.className = "team-vs";
  spanVs.textContent = "×";

  const spanAway = document.createElement("span");
  spanAway.className = "team-away";
  spanAway.textContent = awayName;

  wrapper.appendChild(spanHome);
  wrapper.appendChild(spanVs);
  wrapper.appendChild(spanAway);
  tdJogo.appendChild(wrapper);
  tr.appendChild(tdJogo);

  // Placar oficial
  const tdPlacar = document.createElement("td");
  tdPlacar.className = "col-placar";
  if (oficialPlacar) tdPlacar.textContent = oficialPlacar;
  else if (livePlacar) tdPlacar.innerHTML = `${livePlacar} <span class="status-live">🔴</span>`;
  else tdPlacar.textContent = "—";
  tr.appendChild(tdPlacar);

  // ── Amigos ──
  for (let i = 0; i < AMIGOS.length; i++) {
    const amigo = AMIGOS[i];
    const palpite = getPalpite(game.id, amigo, palpitesStore);
    const pts = calcularPontos(palpite, oficialPlacar);

    if (pts !== null) {
      subtotals[amigo] = (subtotals[amigo] ?? 0) + pts;
    }

    // Palpite (fundo colorido pelo resultado)
    const tdP = document.createElement("td");
    tdP.className = "col-palpite";
    _applyPalpiteColor(tdP, pts);

    if (isAdmin) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "palpite-input" + (palpite ? " valid" : "");
      input.value = palpite;
      input.placeholder = "0 x 0";
      input.maxLength = 7;
      input.setAttribute("aria-label", `Palpite de ${amigo} – ${gameName}`);
      input.dataset.gameId = String(game.id);
      input.dataset.amigo = amigo;
      input.dataset.amigoIdx = String(i);
      input.addEventListener("input", (e) => {
        const val = e.target.value.trim();
        if (validarPalpite(val)) {
          input.className = "palpite-input" + (val ? " valid" : "");
          onPalpiteChange(game.id, amigo, i, val, oficialPlacar);
        } else {
          input.className = "palpite-input invalid";
        }
      });
      tdP.appendChild(input);
    } else {
      tdP.textContent = palpite || "—";
      if (palpite) tdP.style.fontFamily = "monospace";
    }
    tr.appendChild(tdP);
  }

  return tr;
}

/* ─────────────────────────────────────────────────────────
   FOOTER (total geral + ranking)
   ───────────────────────────────────────────────────────── */

function _renderFooter(allGames, palpitesStore) {
  const tfoot = document.getElementById("table-foot");
  tfoot.innerHTML = "";

  const totals = _newSubtotals();

  for (const game of allGames) {
    if (game.finished !== "TRUE") continue;
    const oficial = `${game.home_score} x ${game.away_score}`;
    for (const amigo of AMIGOS) {
      const palpite = getPalpite(game.id, amigo, palpitesStore);
      const pts = calcularPontos(palpite, oficial);
      if (pts !== null) totals[amigo] += pts;
    }
  }

  // Ranking (sort desc)
  const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);
  const rankMap = new Map(sorted.map(([amigo], idx) => [amigo, idx + 1]));

  // ── TOTAL GERAL ──
  const trTotal = document.createElement("tr");
  trTotal.className = "row-total";
  trTotal.setAttribute("aria-label", "Total geral de pontos");

  const tdLabel = document.createElement("td");
  tdLabel.colSpan = 2;
  tdLabel.textContent = "🏆  TOTAL GERAL";
  trTotal.appendChild(tdLabel);

  for (const amigo of AMIGOS) {
    const tdPts = document.createElement("td");
    tdPts.textContent = String(totals[amigo]);
    tdPts.style.cssText = "text-align:center;font-weight:700";
    trTotal.appendChild(tdPts);
  }
  tfoot.appendChild(trTotal);

  // ── RANKING ──
  const trRank = document.createElement("tr");
  trRank.className = "row-ranking";
  trRank.setAttribute("aria-label", "Ranking dos participantes");

  const tdRankLabel = document.createElement("td");
  tdRankLabel.colSpan = 2;
  tdRankLabel.textContent = "📊  RANKING";
  trRank.appendChild(tdRankLabel);

  const MEDALS = ["🥇", "🥈", "🥉"];
  for (const amigo of AMIGOS) {
    const tdPos = document.createElement("td");
    const pos = rankMap.get(amigo) ?? AMIGOS.length;
    tdPos.textContent = pos <= 3 ? MEDALS[pos - 1] : `#${pos}`;
    tdPos.style.cssText = `text-align:center;font-weight:${pos <= 3 ? 700 : 400}`;
    trRank.appendChild(tdPos);
  }
  tfoot.appendChild(trRank);

  // Atualiza a barra de ranking no topo
  _updateRankingBar(sorted);
}

/* ─────────────────────────────────────────────────────────
   RANKING BAR
   ───────────────────────────────────────────────────────── */

function _updateRankingBar(sorted) {
  const bar = document.getElementById("ranking-bar");
  const list = document.getElementById("ranking-list");
  if (!bar || !list) return;

  if (sorted.every(([, v]) => v === 0)) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  list.innerHTML = "";

  const MEDALS = ["🥇", "🥈", "🥉"];
  sorted.forEach(([amigo, pts], idx) => {
    const div = document.createElement("div");
    div.className = `ranking-item${idx < 3 ? ` pos-${idx + 1}` : ""}`;
    div.setAttribute("role", "listitem");
    div.textContent = `${idx < 3 ? MEDALS[idx] : `#${idx + 1}`} ${amigo}: ${pts} pts`;
    list.appendChild(div);
  });
}

/* ─────────────────────────────────────────────────────────
   HELPERS PRIVADOS
   ───────────────────────────────────────────────────────── */

/** Aplica cor de fundo \u00e0 c\u00e9lula de palpite com base nos pontos. */
function _applyPalpiteColor(td, pts) {
  td.classList.remove("cell-exact", "cell-correct", "cell-wrong");
  if (pts === 3) { td.classList.add("cell-exact"); td.title = "\u2705 3pts \u2013 Placar exato!"; }
  else if (pts === 1) { td.classList.add("cell-correct"); td.title = "\ud83d\udfe1 1pt \u2013 Resultado certo"; }
  else if (pts === 0) { td.classList.add("cell-wrong"); td.title = "\u274c 0pts \u2013 Errou"; }
  else { td.title = ""; }
}

function _appendTd(tr, text, cls) {
  const td = document.createElement("td");
  td.className = cls ?? "";
  td.textContent = text;
  tr.appendChild(td);
}

function _newSubtotals() {
  const obj = {};
  for (const a of AMIGOS) obj[a] = 0;
  return obj;
}
