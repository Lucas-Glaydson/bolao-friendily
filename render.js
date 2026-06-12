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
    return true;
  });
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
      _renderDaySection(dayNum, dayKey, dayGames, teamsMap, stadiumsMap, palpitesStore, isAdmin, onPalpiteChange, onGameClick)
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
      const td = document.querySelector(
        `td.col-palpite[data-game-id="${CSS.escape(String(game.id))}"][data-amigo="${CSS.escape(amigo)}"]`
      );
      if (!td) continue;
      const palpite = getPalpite(game.id, amigo, palpitesStore);
      const pts = calcularPontos(palpite, oficialPlacar);
      _applyPalpiteColor(td, pts);
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

function _renderDaySection(dayNum, dayKey, games, teamsMap, stadiumsMap, palpitesStore, isAdmin, onPalpiteChange, onGameClick) {
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
  const hasFinished = games.some(g => g.finished === "TRUE");

  for (const amigo of AMIGOS) {
    const tr = document.createElement("tr");
    tr.dataset.amigo = amigo;

    const tdName = document.createElement("td");
    tdName.className = "col-pessoa";
    tdName.textContent = amigo;
    tr.appendChild(tdName);

    let dayTotal = 0;

    for (const game of games) {
      const palpite = getPalpite(game.id, amigo, palpitesStore);
      const oficialPlacar = game.finished === "TRUE" ? `${game.home_score} x ${game.away_score}` : null;
      const pts = calcularPontos(palpite, oficialPlacar);
      if (pts !== null) dayTotal += pts;

      const td = document.createElement("td");
      td.className = "col-palpite";
      td.dataset.gameId = String(game.id);
      td.dataset.amigo = amigo;
      _applyPalpiteColor(td, pts);

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

function _gameDateBrt(game) { return parseGameDate(game.local_date); }

function _gameDayKey(game) {
  const d = _gameDateBrt(game);
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
