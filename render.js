/**
 * render.js – Renderização da tabela e da UI de ranking
 *
 * Exporta:
 *   renderTabela(allGames, teamsMap, stadiumsMap, palpitesStore, isAdmin, filters, onPalpiteChange, onGameClick)
 *   atualizarCelulas(games, palpitesStore)  – atualização parcial (auto-refresh)
 *   atualizarTotais(allGames, palpitesStore) – recalcula só o tfoot + ranking bar
 *   updateResultCell(gameId, amigoIdx, pts, palpite) – atualiza 1 célula de resultado
 */

import { AMIGOS, calcularPontos, getStatus, getStatusLabel, pontosBadge, validarPalpite } from "./utils.js";
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

  // Ordena: grupo → rodada → data
  games.sort((a, b) => {
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    return parseInt(a.matchday) - parseInt(b.matchday);
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

    // Resultado de cada amigo
    let colIdx = 2;
    for (const amigo of AMIGOS) {
      const palpite = getPalpite(game.id, amigo, palpitesStore);
      const pts = calcularPontos(palpite, oficialPlacar);
      const td = cells[colIdx + 1];
      if (td) _applyResultCell(td, pts, palpite);
      colIdx += 2;
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
  const colIdx = 6 + amigoIdx * 2;
  const td = tr.cells[colIdx + 1];
  if (td) _applyResultCell(td, pts, palpite);
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
    td.colSpan = 6 + AMIGOS.length * 2 + 1;
    td.textContent = "Nenhum jogo encontrado para os filtros selecionados.";
    td.style.cssText = "text-align:center;padding:2rem;color:var(--text-muted)";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  let currentGroup = null;
  let currentMatchday = null;
  let mdGames = [];
  let mdSubtotals = _newSubtotals();

  const flushMatchday = () => {
    if (mdGames.length === 0) return;
    tbody.appendChild(_makeSubtotalRow(mdGames, mdSubtotals, currentGroup, currentMatchday));
    mdGames = [];
    mdSubtotals = _newSubtotals();
  };

  for (const game of games) {
    // Novo grupo?
    if (game.group !== currentGroup) {
      flushMatchday();
      currentGroup = game.group;
      currentMatchday = game.matchday;
      tbody.appendChild(_makeGroupHeaderRow(game.group));
    } else if (game.matchday !== currentMatchday) {
      // Nova rodada dentro do mesmo grupo
      flushMatchday();
      currentMatchday = game.matchday;
    }

    mdGames.push(game);
    const tr = _renderGameRow(game, teamsMap, stadiumsMap, palpitesStore, isAdmin, onPalpiteChange, onGameClick, mdSubtotals);
    tbody.appendChild(tr);
  }

  flushMatchday();
}

/* ─────────────────────────────────────────────────────────
   GROUP HEADER ROW
   ───────────────────────────────────────────────────────── */

function _makeGroupHeaderRow(group) {
  const tr = document.createElement("tr");
  tr.className = "row-group-header";

  // Célula do rótulo — sticky left (cobre Jogo + Placar)
  const th = document.createElement("th");
  th.colSpan = 2;
  th.textContent = `⚽  GRUPO  ${group}`;
  th.scope = "rowgroup";
  tr.appendChild(th);

  // Célula de preenchimento — fundo verde, sem conteúdo
  const tdFill = document.createElement("td");
  tdFill.colSpan = AMIGOS.length * 2 + 1;
  tr.appendChild(tdFill);

  return tr;
}

/* ─────────────────────────────────────────────────────────
   SUBTOTAL ROW (após cada rodada dentro de um grupo)
   ───────────────────────────────────────────────────────── */

function _makeSubtotalRow(mdGames, subtotals, group, matchday) {
  const tr = document.createElement("tr");
  tr.className = "row-subtotal";

  const hasFinished = mdGames.some((g) => g.finished === "TRUE");

  const tdLabel = document.createElement("td");
  tdLabel.colSpan = 2;
  tdLabel.textContent = `↳ Subtotal  Grupo ${group}  ·  Rodada ${matchday}`;
  tdLabel.style.cssText = "text-align:right;font-weight:600;font-size:.7rem;color:var(--text-muted)";
  tr.appendChild(tdLabel);

  let sectionTotal = 0;
  for (const amigo of AMIGOS) {
    const tdP = document.createElement("td");
    tr.appendChild(tdP);

    const tdR = document.createElement("td");
    const pts = subtotals[amigo] ?? 0;
    tdR.textContent = hasFinished ? String(pts) : "—";
    tdR.style.cssText = "font-weight:600;text-align:center";
    if (hasFinished && pts > 0) tdR.style.color = pts >= 3 ? "var(--score-exact-fg)" : "var(--gold-dark)";
    tr.appendChild(tdR);
    sectionTotal += pts;
  }

  const tdT = document.createElement("td");
  tdT.textContent = hasFinished ? String(sectionTotal) : "—";
  tdT.style.cssText = "font-weight:700;text-align:center";
  tr.appendChild(tdT);

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
  let rowTotal = 0;
  for (let i = 0; i < AMIGOS.length; i++) {
    const amigo = AMIGOS[i];
    const palpite = getPalpite(game.id, amigo, palpitesStore);
    const pts = calcularPontos(palpite, oficialPlacar);

    if (pts !== null) {
      subtotals[amigo] = (subtotals[amigo] ?? 0) + pts;
      rowTotal += pts;
    }

    // Palpite
    const tdP = document.createElement("td");
    tdP.className = "col-palpite";

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

    // Resultado
    const tdR = document.createElement("td");
    tdR.className = "col-resultado";
    _applyResultCell(tdR, pts, palpite);
    tr.appendChild(tdR);
  }

  // ── Σ total (sticky right) ──
  const tdT = document.createElement("td");
  tdT.className = "col-total";
  tdT.textContent = oficialPlacar ? String(rowTotal) : "—";
  tr.appendChild(tdT);

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

  let grand = 0;
  for (const amigo of AMIGOS) {
    trTotal.appendChild(document.createElement("td")); // palpite col empty
    const tdPts = document.createElement("td");
    tdPts.textContent = String(totals[amigo]);
    tdPts.style.cssText = "text-align:center;font-weight:700";
    grand += totals[amigo];
    trTotal.appendChild(tdPts);
  }
  const tdGrand = document.createElement("td");
  tdGrand.textContent = String(grand);
  tdGrand.style.cssText = "text-align:center;font-weight:700";
  trTotal.appendChild(tdGrand);
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
    trRank.appendChild(document.createElement("td"));
    const tdPos = document.createElement("td");
    const pos = rankMap.get(amigo) ?? AMIGOS.length;
    tdPos.textContent = pos <= 3 ? MEDALS[pos - 1] : `#${pos}`;
    tdPos.style.cssText = `text-align:center;font-weight:${pos <= 3 ? 700 : 400}`;
    trRank.appendChild(tdPos);
  }
  const tdRankΣ = document.createElement("td");
  tdRankΣ.textContent = "—";
  trRank.appendChild(tdRankΣ);
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

function _applyResultCell(td, pts, palpite) {
  td.className = "col-resultado";
  if (pts === 3) { td.textContent = "✅"; td.className += " cell-exact"; td.title = "3 pts – Placar exato!"; }
  else if (pts === 1) { td.textContent = "🟡"; td.className += " cell-correct"; td.title = "1 pt – Resultado certo"; }
  else if (pts === 0) { td.textContent = "❌"; td.className += " cell-wrong"; td.title = "0 pts"; }
  else if (palpite) { td.textContent = "⏳"; td.title = "Aguardando resultado"; }
  else { td.textContent = ""; }
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
