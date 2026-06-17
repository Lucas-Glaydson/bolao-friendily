/**
 * render.js – Layout transposto: pessoas como linhas, jogos como colunas, agrupado por dia
 */

import { AMIGOS, calcularPontos, getStatus, validarPalpite, parseGameDate } from "./utils.js";
import { getCazeTVLink } from "./cazetv.js";
import { getPalpite } from "./storage.js";
import { getTeamName } from "./api.js";

export function renderTabela(
  allGames, teamsMap, stadiumsMap, palpitesStore,
  isAdmin, filters, onPalpiteChange, onGameClick
) {
  let games = allGames.filter(g => {
    if (filters.group && g.group !== filters.group) return false;
    if (filters.round && g.matchday !== filters.round) return false;
    if (filters.status && getStatus(g) !== filters.status) return false;
    if (filters.team) {
      const h = (g.home_team_name_en ?? "").toLowerCase();
      const a = (g.away_team_name_en ?? "").toLowerCase();
      const t = filters.team.toLowerCase();
      if (!h.includes(t) && !a.includes(t)) return false;
    }
    if (filters.date && _gameDayKey(g) !== filters.date) return false;
    return true;
  });
  const filteredAmigos = filters.person ? AMIGOS.filter(a => a === filters.person) : AMIGOS;
  games.sort((a, b) => (_gameDateBrt(a)?.getTime() ?? 0) - (_gameDateBrt(b)?.getTime() ?? 0));

  const container = document.getElementById("bolao-tables");
  container.innerHTML = "";

  if (games.length === 0) {
    const p = document.createElement("p");
    p.style.cssText = "text-align:center;padding:2rem;color:var(--text-muted)";
    p.textContent = "Nenhum jogo encontrado para os filtros selecionados.";
    container.appendChild(p);
    _renderFooter(allGames, palpitesStore);
    return;
  }

  const dayGroups = new Map();
  for (const game of games) {
    const key = _gameDayKey(game);
    if (!dayGroups.has(key)) dayGroups.set(key, []);
    dayGroups.get(key).push(game);
  }

  const allDayKeys = [...new Set(allGames.map(g => _gameDayKey(g)))].sort();

  for (const [dayKey, dayGames] of dayGroups) {
    const dayNum = allDayKeys.indexOf(dayKey) + 1;
    container.appendChild(
      _renderDaySection(dayNum, dayKey, dayGames, teamsMap, stadiumsMap, palpitesStore, isAdmin, onPalpiteChange, onGameClick, filteredAmigos)
    );
  }

  _renderFooter(allGames, palpitesStore);
}

export function atualizarCelulas(games, palpitesStore) {
  for (const game of games) {
    const status = getStatus(game);
    const oficialPlacar = game.finished === "TRUE" ? `${game.home_score} x ${game.away_score}` : null;
    const badge = document.querySelector(`.game-score-badge[data-game-id="${CSS.escape(String(game.id))}"]`);
    if (badge) {
      if (oficialPlacar) {
        badge.textContent = `\u2705 ${game.home_score} \u00d7 ${game.away_score}`;
        badge.className = "game-score-badge finished";
      } else if (status === "live") {
        badge.textContent = `\ud83d\udd34 ${game.home_score ?? 0} \u00d7 ${game.away_score ?? 0}`;
        badge.className = "game-score-badge live";
      }
    }
    for (const amigo of AMIGOS) {
      const tds = document.querySelectorAll(
        `td.col-palpite[data-game-id="${CSS.escape(String(game.id))}"][data-amigo="${CSS.escape(amigo)}"]`
      );
      tds.forEach((td) => {
        const palpite = getPalpite(game.id, amigo, palpitesStore);
        const pts = calcularPontos(palpite, oficialPlacar);
        const livePlacar = status === "live" && game.home_score != null
          ? `${game.home_score} x ${game.away_score}` : null;
        const ptsProvisorio = pts !== null ? pts : calcularPontos(palpite, livePlacar);
        td.classList.toggle("cell-provisional", status === "live" && pts === null);
        _applyPalpiteColor(td, ptsProvisorio);
      });
    }
  }
}

export function atualizarTotais(allGames, palpitesStore) {
  _renderFooter(allGames, palpitesStore);
}

export function updateResultCell(gameId, amigoIdx, pts) {
  const amigo = AMIGOS[amigoIdx];
  const td = document.querySelector(
    `td.col-palpite[data-game-id="${CSS.escape(String(gameId))}"][data-amigo="${CSS.escape(amigo)}"]`
  );
  if (td) _applyPalpiteColor(td, pts);
}

export function renderDaySection(dayNum, dayKey, games, teamsMap, stadiumsMap, palpitesStore, isAdmin, onPalpiteChange, onGameClick) {
  return _renderDaySection(dayNum, dayKey, games, teamsMap, stadiumsMap, palpitesStore, isAdmin, onPalpiteChange, onGameClick);
}

function _renderDaySection(dayNum, dayKey, games, teamsMap, stadiumsMap, palpitesStore, isAdmin, onPalpiteChange, onGameClick, filteredAmigos = AMIGOS) {
  const section = document.createElement("section");
  section.className = "day-section";
  section.id = `day-section-${dayKey}`;
  section.dataset.dayKey = dayKey;

  const header = document.createElement("div");
  header.className = "day-section-header";
  header.textContent = `\ud83d\udcc5  DIA ${dayNum}  \u00b7  ${_formatDayLabelFull(dayKey)}`;
  section.appendChild(header);

  const scrollWrap = document.createElement("div");
  scrollWrap.className = "table-scroll";

  const table = document.createElement("table");
  table.className = "bolao-table";

  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");

  const thPessoa = document.createElement("th");
  thPessoa.className = "col-pessoa";
  thPessoa.textContent = "Pessoa";
  trHead.appendChild(thPessoa);

  for (const game of games) {
    const th = document.createElement("th");
    th.className = "col-game";
    th.dataset.gameId = String(game.id);

    const homeName = getTeamName(game, "home", teamsMap);
    const awayName = getTeamName(game, "away", teamsMap);

    const nameDiv = document.createElement("div");
    nameDiv.className = "game-col-name";
    nameDiv.textContent = `${_abbrev(homeName)} \u00d7 ${_abbrev(awayName)}`;
    nameDiv.title = `${homeName} \u00d7 ${awayName}`;
    nameDiv.style.cursor = "pointer";
    nameDiv.addEventListener("click", () => onGameClick(game, homeName, awayName, teamsMap, stadiumsMap));
    th.appendChild(nameDiv);

    const status = getStatus(game);
    const badge = document.createElement("div");
    badge.className = `game-score-badge ${status}`;
    badge.dataset.gameId = String(game.id);
    if (game.finished === "TRUE") {
      badge.textContent = `\u2705 ${game.home_score}\u00d7${game.away_score}`;
    } else if (status === "live") {
      badge.textContent = `\ud83d\udd34 ${game.home_score ?? 0}\u00d7${game.away_score ?? 0}`;
    } else {
      const rawTime = game.local_date?.split(" ")[1];
      badge.textContent = rawTime ? _timeToBrt(rawTime, game.stadium_id, stadiumsMap) : "--";
    }
    th.appendChild(badge);

    // Link CazeTV se disponível
    const cazeUrl = getCazeTVLink(homeName);
    if (cazeUrl) {
      const cazeLink = document.createElement("a");
      cazeLink.href = cazeUrl;
      cazeLink.target = "_blank";
      cazeLink.rel = "noopener noreferrer";
      cazeLink.textContent = "📺";
      cazeLink.className = "cazetv-link";
      cazeLink.title = "Assistir na CazeTV";
      th.appendChild(cazeLink);
    }

    trHead.appendChild(th);
  }

  const thPts = document.createElement("th");
  thPts.className = "col-day-pts";
  thPts.textContent = "Pts";
  trHead.appendChild(thPts);

  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const hasFinished = games.some(g => g.finished === "TRUE" || getStatus(g) === "live");

  for (const amigo of filteredAmigos) {
    const tr = document.createElement("tr");
    tr.dataset.amigo = amigo;

    const tdName = document.createElement("td");
    tdName.className = "col-pessoa";
    tdName.textContent = amigo;
    tr.appendChild(tdName);

    let dayTotal = 0;

    for (const game of games) {
      const palpite = getPalpite(game.id, amigo, palpitesStore);
      const status = getStatus(game);
      const oficialPlacar = game.finished === "TRUE" ? `${game.home_score} x ${game.away_score}` : null;
      // Placar provisório para jogos ao vivo
      const livePlacar = status === "live" && game.home_score != null
        ? `${game.home_score} x ${game.away_score}`
        : null;
      const pts = calcularPontos(palpite, oficialPlacar);
      const ptsProvisorio = pts !== null ? pts : calcularPontos(palpite, livePlacar);
      if (pts !== null) dayTotal += pts;
      else if (ptsProvisorio !== null) dayTotal += ptsProvisorio;

      const td = document.createElement("td");
      td.className = "col-palpite";
      td.dataset.gameId = String(game.id);
      td.dataset.amigo = amigo;
      if (status === "live" && pts === null) td.classList.add("cell-provisional");
      _applyPalpiteColor(td, ptsProvisorio);

      if (isAdmin) {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "palpite-input" + (palpite ? " valid" : "");
        input.value = palpite;
        input.placeholder = "0x0";
        input.maxLength = 7;
        input.dataset.gameId = String(game.id);
        input.dataset.amigo = amigo;
        input.dataset.amigoIdx = String(AMIGOS.indexOf(amigo));
        input.setAttribute("aria-label", `Palpite de ${amigo}`);
        input.addEventListener("input", e => {
          const val = e.target.value.trim();
          if (validarPalpite(val)) {
            input.className = "palpite-input" + (val ? " valid" : "");
            onPalpiteChange(game.id, amigo, AMIGOS.indexOf(amigo), val, oficialPlacar);
          } else {
            input.className = "palpite-input invalid";
          }
        });
        td.appendChild(input);
      } else {
        td.textContent = palpite || "--";
      }
      tr.appendChild(td);
    }

    const tdPts = document.createElement("td");
    tdPts.className = "col-day-pts";
    tdPts.textContent = hasFinished ? String(dayTotal) : "--";
    if (games.some(g => getStatus(g) === "live")) tdPts.title = "Pts provisórios (jogo em andamento)";
    tr.appendChild(tdPts);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  scrollWrap.appendChild(table);
  section.appendChild(scrollWrap);
  return section;
}

function _renderFooter(allGames, palpitesStore) {
  const footerEl = document.getElementById("bolao-footer");
  if (!footerEl) return;
  footerEl.innerHTML = "";

  const totals = _newSubtotals();
  for (const game of allGames) {
    if (game.finished !== "TRUE") continue;
    const oficial = `${game.home_score} x ${game.away_score}`;
    for (const amigo of AMIGOS) {
      const pts = calcularPontos(getPalpite(game.id, amigo, palpitesStore), oficial);
      if (pts !== null) totals[amigo] += pts;
    }
  }

  const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);
  _updateRankingBar(sorted);

  if (sorted.every(([, v]) => v === 0)) return;

  const section = document.createElement("section");
  section.className = "day-section";

  const header = document.createElement("div");
  header.className = "day-section-header";
  header.textContent = "\ud83c\udfc6  TOTAL GERAL";
  section.appendChild(header);

  const scrollWrap = document.createElement("div");
  scrollWrap.className = "table-scroll";

  const table = document.createElement("table");
  table.className = "bolao-table";

  const thead = document.createElement("thead");
  const trH = document.createElement("tr");
  [["Pessoa", "col-pessoa"], ["Pts", "col-day-pts"], ["Rank", "col-day-pts"]].forEach(([label, cls]) => {
    const th = document.createElement("th");
    th.textContent = label;
    th.className = cls;
    trH.appendChild(th);
  });
  thead.appendChild(trH);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const MEDALS = ["\ud83e\udd47", "\ud83e\udd48", "\ud83e\udd49"];
  sorted.forEach(([amigo, pts], idx) => {
    const tr = document.createElement("tr");
    if (idx < 3) tr.className = `row-top-${idx + 1}`;

    const tdName = document.createElement("td");
    tdName.className = "col-pessoa";
    tdName.textContent = amigo;
    tr.appendChild(tdName);

    const tdPts = document.createElement("td");
    tdPts.className = "col-day-pts";
    tdPts.style.fontWeight = "700";
    tdPts.textContent = String(pts);
    tr.appendChild(tdPts);

    const tdRank = document.createElement("td");
    tdRank.className = "col-day-pts";
    tdRank.textContent = idx < 3 ? MEDALS[idx] : `#${idx + 1}`;
    tr.appendChild(tdRank);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  scrollWrap.appendChild(table);
  section.appendChild(scrollWrap);
  footerEl.appendChild(section);

  // Espelha a tabela no painel Ranking
  const rankingWrap = document.getElementById("ranking-table-wrap");
  if (rankingWrap) {
    rankingWrap.innerHTML = "";
    rankingWrap.appendChild(section.cloneNode(true));
  }
}

function _updateRankingBar(sorted) {
  const bar = document.getElementById("ranking-bar");
  const list = document.getElementById("ranking-list");
  if (!bar || !list) return;
  list.innerHTML = "";
  const MEDALS = ["\ud83e\udd47", "\ud83e\udd48", "\ud83e\udd49"];
  sorted.forEach(([amigo, pts], idx) => {
    const div = document.createElement("div");
    div.className = `ranking-item${idx < 3 ? ` pos-${idx + 1}` : ""}`;
    div.setAttribute("role", "listitem");
    div.textContent = `${idx < 3 ? MEDALS[idx] : `#${idx + 1}`} ${amigo}: ${pts} pts`;
    list.appendChild(div);
  });
}

function _applyPalpiteColor(td, pts) {
  td.classList.remove("cell-exact", "cell-correct", "cell-wrong");
  if (pts === 3) { td.classList.add("cell-exact"); td.title = "3pts \u2013 Placar exato!"; }
  else if (pts === 1) { td.classList.add("cell-correct"); td.title = "1pt \u2013 Resultado certo"; }
  else if (pts === 0) { td.classList.add("cell-wrong"); td.title = "0pts \u2013 Errou"; }
  else { td.title = ""; }
}

function _abbrev(name) {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 3).toUpperCase();
  return words.map(w => w[0].toUpperCase()).join("").slice(0, 3);
}

function _timeToBrt(timeStr, stadiumId, stadiumsMap) {
  const [hh, mm] = timeStr.split(":").map(Number);
  const s = stadiumsMap?.get(String(stadiumId));
  let offset = 0;
  if (s) {
    if (s.region === "Eastern") offset = 1;
    else if (s.region === "Western") offset = 4;
    else if (s.region === "Central") offset = s.country_en === "Mexico" ? 3 : 2;
  }
  return `${String((hh + offset) % 24).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function _gameDateBrt(game) {
  if (game._utcMs != null) return new Date(game._utcMs);
  return parseGameDate(game.local_date);
}

function _gameDayKey(game) {
  if (game._utcMs != null) {
    // Subtrai 3h para obter meia-noite BRT (UTC-3) e usa UTC para extrair a data
    const brtMs = game._utcMs - 3 * 60 * 60 * 1000;
    const d = new Date(brtMs);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  const d = parseGameDate(game.local_date);
  if (!d) return "0000-00-00";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function _formatDayLabelFull(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function _newSubtotals() {
  const obj = {};
  for (const a of AMIGOS) obj[a] = 0;
  return obj;
}

/* ─────────────────────────────────────────────────────────
   VIEW: CARDS POR PESSOA
   ───────────────────────────────────────────────────────── */

/**
 * Renderiza grade de cards, um por pessoa, com os palpites lado a lado.
 */
export function renderPessoasCards(
  allGames, teamsMap, stadiumsMap, palpitesStore,
  filters, isAdmin, onPalpiteChange, onGameClick
) {
  let games = allGames.filter(g => {
    if (filters.group && g.group !== filters.group) return false;
    if (filters.round && g.matchday !== filters.round) return false;
    if (filters.status && getStatus(g) !== filters.status) return false;
    if (filters.team) {
      const h = (g.home_team_name_en ?? "").toLowerCase();
      const a = (g.away_team_name_en ?? "").toLowerCase();
      const t = filters.team.toLowerCase();
      if (!h.includes(t) && !a.includes(t)) return false;
    }
    if (filters.date && _gameDayKey(g) !== filters.date) return false;
    return true;
  });
  games.sort((a, b) => (_gameDateBrt(a)?.getTime() ?? 0) - (_gameDateBrt(b)?.getTime() ?? 0));

  const filteredAmigos = filters.person ? AMIGOS.filter(a => a === filters.person) : AMIGOS;

  const container = document.getElementById("bolao-tables");
  container.innerHTML = "";

  // Totais globais para ranking
  const totals = _newSubtotals();
  for (const g of allGames) {
    if (g.finished !== "TRUE") continue;
    const oficial = `${g.home_score} x ${g.away_score}`;
    for (const a of AMIGOS) {
      const p = calcularPontos(getPalpite(g.id, a, palpitesStore), oficial);
      if (p != null) totals[a] += p;
    }
  }
  const sortedTotals = Object.entries(totals).sort(([, a], [, b]) => b - a);
  const rankMap = {};
  sortedTotals.forEach(([name], i) => { rankMap[name] = i + 1; });

  if (games.length === 0) {
    const p = document.createElement("p");
    p.style.cssText = "text-align:center;padding:2rem;color:var(--text-muted)";
    p.textContent = "Nenhum jogo encontrado para os filtros selecionados.";
    container.appendChild(p);
    _renderFooter(allGames, palpitesStore);
    return;
  }

  const MEDALS = ["\ud83e\udd47", "\ud83e\udd48", "\ud83e\udd49"];
  const grid = document.createElement("div");
  grid.className = "pessoa-cards-grid";

  for (const amigo of filteredAmigos) {
    const rank = rankMap[amigo] ?? AMIGOS.length;
    const totalPts = totals[amigo] ?? 0;
    const medal = rank <= 3 ? MEDALS[rank - 1] : `#${rank}`;
    const rankClass = rank <= 3 ? ` card-top${rank}` : "";

    const card = document.createElement("div");
    card.className = `pessoa-card${rankClass}`;
    card.dataset.amigo = amigo;

    // ── Header
    const header = document.createElement("div");
    header.className = "pessoa-card-header";
    const medalEl = document.createElement("span");
    medalEl.className = "pcard-medal";
    medalEl.textContent = medal;
    const nameEl = document.createElement("span");
    nameEl.className = "pcard-name";
    nameEl.textContent = amigo;
    const ptsEl = document.createElement("span");
    ptsEl.className = "pcard-pts";
    ptsEl.textContent = `${totalPts}pts`;
    header.appendChild(medalEl);
    header.appendChild(nameEl);
    header.appendChild(ptsEl);
    card.appendChild(header);

    // ── Body
    const body = document.createElement("div");
    body.className = "pessoa-card-body";

    for (const game of games) {
      const palpite = getPalpite(game.id, amigo, palpitesStore);
      const status = getStatus(game);
      const oficialPlacar = game.finished === "TRUE" ? `${game.home_score} x ${game.away_score}` : null;
      const livePlacar = status === "live" && game.home_score != null
        ? `${game.home_score} x ${game.away_score}` : null;
      const pts = calcularPontos(palpite, oficialPlacar);
      const ptsProvisorio = pts !== null ? pts : calcularPontos(palpite, livePlacar);

      const row = document.createElement("div");
      row.className = "pcard-row";
      if (status === "live") row.classList.add("pcard-row-live");

      // Matchup label
      const homeName = getTeamName(game, "home", teamsMap);
      const awayName = getTeamName(game, "away", teamsMap);
      const matchupEl = document.createElement("span");
      matchupEl.className = "pcard-matchup";
      matchupEl.textContent = `${_abbrev(homeName)}\u00d7${_abbrev(awayName)}`;
      matchupEl.title = `${homeName} \u00d7 ${awayName}`;
      matchupEl.style.cursor = "pointer";
      matchupEl.addEventListener("click", () => onGameClick(game, homeName, awayName, teamsMap, stadiumsMap));
      row.appendChild(matchupEl);

      // Official score / time
      const offEl = document.createElement("span");
      offEl.className = "pcard-official";
      if (oficialPlacar) {
        offEl.textContent = oficialPlacar;
        offEl.classList.add("off-done");
      } else if (status === "live") {
        offEl.textContent = `\ud83d\udd34 ${game.home_score ?? 0}\u00d7${game.away_score ?? 0}`;
        offEl.classList.add("off-live");
      } else {
        const rawTime = game.local_date?.split(" ")[1];
        offEl.textContent = rawTime ? _timeToBrt(rawTime, game.stadium_id, stadiumsMap) : "--";
        offEl.classList.add("off-sched");
      }
      row.appendChild(offEl);

      // Palpite value
      const palEl = document.createElement("span");
      palEl.className = "pcard-palpite";
      const provisional = pts === null && ptsProvisorio !== null;
      if (pts === 3 || (provisional && ptsProvisorio === 3)) palEl.classList.add("pal-exact");
      else if (pts === 1 || (provisional && ptsProvisorio === 1)) palEl.classList.add("pal-correct");
      else if (pts === 0 || (provisional && ptsProvisorio === 0)) palEl.classList.add("pal-wrong");
      if (provisional) palEl.classList.add("pal-provisional");

      if (isAdmin) {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "palpite-input" + (palpite ? " valid" : "");
        input.value = palpite || "";
        input.placeholder = "0x0";
        input.maxLength = 7;
        input.dataset.gameId = String(game.id);
        input.dataset.amigo = amigo;
        input.dataset.amigoIdx = String(AMIGOS.indexOf(amigo));
        input.setAttribute("aria-label", `Palpite de ${amigo}`);
        input.addEventListener("input", e => {
          const val = e.target.value.trim();
          if (validarPalpite(val)) {
            input.classList.remove("invalid");
            input.classList.toggle("valid", !!val);
            onPalpiteChange(game.id, amigo, AMIGOS.indexOf(amigo), val, oficialPlacar);
          } else {
            input.classList.add("invalid");
          }
        });
        palEl.appendChild(input);
      } else {
        palEl.textContent = palpite || "--";
      }
      row.appendChild(palEl);
      body.appendChild(row);
    }

    card.appendChild(body);
    grid.appendChild(card);
  }

  container.appendChild(grid);
  _renderFooter(allGames, palpitesStore);
}

/* ─────────────────────────────────────────────────────────
   VIEW: TABELAS POR PESSOA NO RANKING
   ───────────────────────────────────────────────────────── */

/**
 * Renderiza tabelas de jogos organizadas por pessoa (por ranking),
 * com agrupamento configurável (dia, grupo ou time).
 */
export function renderRankingPersonTables(
  allGames, teamsMap, stadiumsMap, palpitesStore,
  groupBy = "day", isAdmin, onPalpiteChange, onGameClick
) {
  const container = document.getElementById("ranking-person-tables");
  if (!container) return;

  container.innerHTML = "";

  // Calcula ranking geral
  const totals = _newSubtotals();
  for (const game of allGames) {
    if (game.finished !== "TRUE") continue;
    const oficial = `${game.home_score} x ${game.away_score}`;
    for (const amigo of AMIGOS) {
      const pts = calcularPontos(getPalpite(game.id, amigo, palpitesStore), oficial);
      if (pts !== null) totals[amigo] += pts;
    }
  }

  const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);
  const MEDALS = ["\ud83e\udd47", "\ud83e\udd48", "\ud83e\udd49"];

  // Para cada pessoa no ranking, cria uma seção com seus jogos agrupados
  for (const [idx, [amigo, totalPts]] of sorted.entries()) {
    const rank = idx + 1;
    const medal = rank <= 3 ? MEDALS[rank - 1] : `#${rank}`;
    const rankClass = rank <= 3 ? ` person-rank-top${rank}` : "";

    const personSection = document.createElement("section");
    personSection.className = `person-section${rankClass}`;
    personSection.dataset.amigo = amigo;

    // Cabeçalho da pessoa
    const header = document.createElement("div");
    header.className = "person-section-header";
    header.innerHTML = `
      <span class="person-medal">${medal}</span>
      <span class="person-name">${amigo}</span>
      <span class="person-total-pts">${totalPts} pts</span>
    `;
    personSection.appendChild(header);

    // Agrupa jogos por critério selecionado
    const groups = _groupGames(allGames, groupBy, teamsMap);

    for (const [groupKey, groupGames] of groups) {
      if (groupGames.length === 0) continue;

      const groupDiv = document.createElement("div");
      groupDiv.className = "person-group";

      const groupLabel = document.createElement("div");
      groupLabel.className = "person-group-label";
      groupLabel.textContent = _formatGroupLabel(groupKey, groupBy);
      groupDiv.appendChild(groupLabel);

      const scrollWrap = document.createElement("div");
      scrollWrap.className = "table-scroll";

      const table = document.createElement("table");
      table.className = "person-table";

      // Cabeçalho da tabela
      const thead = document.createElement("thead");
      const trHead = document.createElement("tr");

      const thJogo = document.createElement("th");
      thJogo.textContent = "Jogo";
      thJogo.className = "col-jogo";
      trHead.appendChild(thJogo);

      const thData = document.createElement("th");
      thData.textContent = "Data/Hora";
      thData.className = "col-data";
      trHead.appendChild(thData);

      const thOficial = document.createElement("th");
      thOficial.textContent = "Resultado";
      thOficial.className = "col-oficial";
      trHead.appendChild(thOficial);

      const thPalpite = document.createElement("th");
      thPalpite.textContent = "Palpite";
      thPalpite.className = "col-palpite-person";
      trHead.appendChild(thPalpite);

      const thPts = document.createElement("th");
      thPts.textContent = "Pts";
      thPts.className = "col-pts";
      trHead.appendChild(thPts);

      thead.appendChild(trHead);
      table.appendChild(thead);

      // Corpo da tabela
      const tbody = document.createElement("tbody");
      let groupPts = 0;

      for (const game of groupGames) {
        const tr = document.createElement("tr");

        const homeName = getTeamName(game, "home", teamsMap);
        const awayName = getTeamName(game, "away", teamsMap);
        const status = getStatus(game);
        const oficialPlacar = game.finished === "TRUE" ? `${game.home_score} x ${game.away_score}` : null;
        const livePlacar = status === "live" && game.home_score != null ? `${game.home_score} x ${game.away_score}` : null;

        const palpite = getPalpite(game.id, amigo, palpitesStore);
        const pts = calcularPontos(palpite, oficialPlacar);
        const ptsProvisorio = pts !== null ? pts : calcularPontos(palpite, livePlacar);

        if (pts !== null) groupPts += pts;
        else if (ptsProvisorio !== null) groupPts += ptsProvisorio;

        // Coluna: Jogo
        const tdJogo = document.createElement("td");
        tdJogo.className = "col-jogo";
        tdJogo.textContent = `${_abbrev(homeName)} × ${_abbrev(awayName)}`;
        tdJogo.title = `${homeName} × ${awayName}`;
        tdJogo.style.cursor = "pointer";
        tdJogo.addEventListener("click", () => onGameClick(game, homeName, awayName, teamsMap, stadiumsMap));
        tr.appendChild(tdJogo);

        // Coluna: Data/Hora
        const tdData = document.createElement("td");
        tdData.className = "col-data";
        const rawTime = game.local_date?.split(" ")[1];
        const timeStr = rawTime ? _timeToBrt(rawTime, game.stadium_id, stadiumsMap) : "--";
        tdData.textContent = timeStr;
        tr.appendChild(tdData);

        // Coluna: Resultado Oficial
        const tdOficial = document.createElement("td");
        tdOficial.className = "col-oficial";
        if (oficialPlacar) {
          tdOficial.textContent = `✅ ${oficialPlacar}`;
          tdOficial.classList.add("oficial-finished");
        } else if (status === "live") {
          tdOficial.textContent = `🔴 ${game.home_score ?? 0}×${game.away_score ?? 0}`;
          tdOficial.classList.add("oficial-live");
        } else {
          tdOficial.textContent = "⏳";
          tdOficial.classList.add("oficial-scheduled");
        }
        tr.appendChild(tdOficial);

        // Coluna: Palpite
        const tdPalpite = document.createElement("td");
        tdPalpite.className = "col-palpite-person";
        tdPalpite.dataset.gameId = String(game.id);
        tdPalpite.dataset.amigo = amigo;

        if (status === "live" && pts === null) tdPalpite.classList.add("cell-provisional");
        _applyPalpiteColor(tdPalpite, ptsProvisorio);

        if (isAdmin) {
          const input = document.createElement("input");
          input.type = "text";
          input.className = "palpite-input" + (palpite ? " valid" : "");
          input.value = palpite || "";
          input.placeholder = "0x0";
          input.maxLength = 7;
          input.dataset.gameId = String(game.id);
          input.dataset.amigo = amigo;
          input.dataset.amigoIdx = String(AMIGOS.indexOf(amigo));
          input.setAttribute("aria-label", `Palpite de ${amigo}`);
          input.addEventListener("input", e => {
            const val = e.target.value.trim();
            if (validarPalpite(val)) {
              input.className = "palpite-input" + (val ? " valid" : "");
              onPalpiteChange(game.id, amigo, AMIGOS.indexOf(amigo), val, oficialPlacar);
            } else {
              input.className = "palpite-input invalid";
            }
          });
          tdPalpite.appendChild(input);
        } else {
          tdPalpite.textContent = palpite || "--";
        }
        tr.appendChild(tdPalpite);

        // Coluna: Pontos
        const tdPts = document.createElement("td");
        tdPts.className = "col-pts";
        if (ptsProvisorio !== null) {
          tdPts.textContent = String(ptsProvisorio);
          if (pts === null) tdPts.classList.add("pts-provisional");
        } else {
          tdPts.textContent = "--";
        }
        tr.appendChild(tdPts);

        tbody.appendChild(tr);
      }

      table.appendChild(tbody);

      // Rodapé do grupo com total de pontos
      const tfoot = document.createElement("tfoot");
      const trFoot = document.createElement("tr");
      const tdFootLabel = document.createElement("td");
      tdFootLabel.colSpan = 4;
      tdFootLabel.textContent = "Total do grupo";
      tdFootLabel.style.textAlign = "right";
      tdFootLabel.style.fontWeight = "600";
      trFoot.appendChild(tdFootLabel);

      const tdFootPts = document.createElement("td");
      tdFootPts.className = "col-pts";
      tdFootPts.textContent = String(groupPts);
      tdFootPts.style.fontWeight = "700";
      trFoot.appendChild(tdFootPts);

      tfoot.appendChild(trFoot);
      table.appendChild(tfoot);

      scrollWrap.appendChild(table);
      groupDiv.appendChild(scrollWrap);
      personSection.appendChild(groupDiv);
    }

    container.appendChild(personSection);
  }
}

/**
 * Agrupa jogos por dia, grupo ou time
 */
function _groupGames(games, groupBy, teamsMap) {
  const groups = new Map();

  for (const game of games) {
    let key;

    if (groupBy === "day") {
      key = _gameDayKey(game);
    } else if (groupBy === "group") {
      key = game.group || "Outros";
    } else if (groupBy === "team") {
      const homeName = getTeamName(game, "home", teamsMap);
      key = homeName || game.home_team_name_en || "Time";
    } else {
      key = "Todos";
    }

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(game);
  }

  // Ordena jogos dentro de cada grupo por data
  for (const [key, groupGames] of groups) {
    groupGames.sort((a, b) => (_gameDateBrt(a)?.getTime() ?? 0) - (_gameDateBrt(b)?.getTime() ?? 0));
  }

  // Ordena grupos por key
  return new Map([...groups.entries()].sort());
}

/**
 * Formata o label do grupo
 */
function _formatGroupLabel(groupKey, groupBy) {
  if (groupBy === "day") {
    return _formatDayLabelFull(groupKey);
  } else if (groupBy === "group") {
    return `Grupo ${groupKey}`;
  } else if (groupBy === "team") {
    return groupKey;
  }
  return groupKey;
}


