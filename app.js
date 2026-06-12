/**
 * app.js – Módulo principal: orquestra todos os módulos
 */

import { fetchGames, fetchTeams, fetchStadiums, getTeamName, getTeamFlag } from "./api.js";
import { login, logout, isAuthenticated } from "./auth.js";
import {
  loadPalpites, savePalpites, exportJSON, importJSON,
  getPalpite, setPalpite, loadOverrides, saveOverrides,
  loadBaseData, mergeStores,
} from "./storage.js";
import { getCazeTVLink } from "./cazetv.js";
import {
  AMIGOS, validarPalpite, normalizarPalpite,
  randomPlacar, debounce, calcularPontos, getStatus, parseGameDate,
} from "./utils.js";
import {
  renderTabela, atualizarCelulas, atualizarTotais, updateResultCell, renderDaySection,
} from "./render.js";

/* ─────────────────────────────────────────────────────────
   ESTADO GLOBAL
   ───────────────────────────────────────────────────────── */

const state = {
  games: [],
  teamsMap: new Map(),
  stadiumsMap: new Map(),
  palpitesStore: { versao: 1, palpites: {} },
  overrides: {},                // placares inseridos manualmente
  calFilter: "all",            // filtro ativo no calendário
  filters: { group: "", round: "", status: "" },
  refreshTimer: null,
};

// ID do jogo aberto no modal de placar manual
let _scoreModalGameId = null;

/* ─────────────────────────────────────────────────────────
   SAVES DEBOUNCIDOS
   ───────────────────────────────────────────────────────── */

const debouncedSave = debounce(() => savePalpites(state.palpitesStore), 500);

const debouncedUpdateTotais = debounce(
  () => atualizarTotais(state.games, state.palpitesStore),
  600
);

/* ─────────────────────────────────────────────────────────
   INICIALIZAÇÃO
   ───────────────────────────────────────────────────────── */

async function init() {
  // Modo somente-leitura via #view (ou link compartilhado)
  if (window.location.hash === "#view") {
    logout();
  }

  // Mantém --header-h e --sticky-top atualizados para posicionamento correto
  const _syncHeights = () => {
    const headerH = document.querySelector(".site-header")?.offsetHeight ?? 54;
    const filtersH = document.querySelector(".filters-bar")?.offsetHeight ?? 48;
    document.documentElement.style.setProperty("--header-h", headerH + "px");
    document.documentElement.style.setProperty("--sticky-top", (headerH + filtersH) + "px");
  };
  _syncHeights();
  window.addEventListener("resize", _syncHeights);

  _restoreTheme();
  state.overrides = loadOverrides();
  _updateAuthUI();
  _syncHeights(); // recalcula após _updateAuthUI mudar visibilidade dos botões admin
  _setupEventListeners();

  // Carrega palpites_bolao.json como base e mescla com localStorage
  const baseData = await loadBaseData();
  state.palpitesStore = mergeStores(baseData, loadPalpites());

  await _loadAPIData();
  _scheduleAutoRefresh();
}

/* ─────────────────────────────────────────────────────────
   CARREGAMENTO DE DADOS DA API
   ───────────────────────────────────────────────────────── */

async function _loadAPIData(skipCache = false) {
  const elLoading = document.getElementById("loading");
  const elError = document.getElementById("error-state");
  const elStatus = document.getElementById("api-status");

  elLoading.classList.remove("hidden");
  elError.classList.add("hidden");

  try {
    const [games, teamsMap, stadiumsMap] = await Promise.all([
      fetchGames(skipCache),
      fetchTeams(),
      fetchStadiums(),
    ]);

    state.games = games;
    state.teamsMap = teamsMap;
    state.stadiumsMap = stadiumsMap;
    _enrichGamesUtcMs(state.games);

    elStatus.textContent = `✅ ${new Date().toLocaleTimeString("pt-BR")}`;
    _renderAll();
  } catch (err) {
    console.error("[app] Falha na API:", err);
    elError.classList.remove("hidden");
    elStatus.textContent = "⚠️ API indisponível";

    // Exibe dados em cache / overrides manuais (se houver)
    if (state.games.length > 0) _renderAll();
  } finally {
    elLoading.classList.add("hidden");
  }
}

/* ─────────────────────────────────────────────────────────
   RENDER COMPLETO
   ───────────────────────────────────────────────────────── */

function _renderAll() {
  // Preserva foco para não interromper digitação
  _renderToday(_gamesWithOverrides());
  const focused = document.activeElement;
  const focusGameId = focused?.dataset?.gameId;
  const focusAmigo = focused?.dataset?.amigo;
  const focusSelStart = focused?.selectionStart;
  const focusSelEnd = focused?.selectionEnd;

  const games = _gamesWithOverrides();

  renderTabela(
    games, state.teamsMap, state.stadiumsMap,
    state.palpitesStore, isAuthenticated(),
    state.filters,
    _handlePalpiteChange,
    _handleGameClick,
  );

  _updateAdminUI();
  _renderCalendar(games, state.calFilter);

  // Restaura foco
  if (focusGameId && focusAmigo) {
    const input = document.querySelector(
      `input[data-game-id="${CSS.escape(focusGameId)}"][data-amigo="${CSS.escape(focusAmigo)}"]`
    );
    if (input) {
      input.focus();
      try { input.setSelectionRange(focusSelStart, focusSelEnd); } catch { /* noop */ }
    }
  }
}

/* ─────────────────────────────────────────────────────────
   SEÇÃO: JOGOS DE HOJE + RANKING DIÁRIO
   ───────────────────────────────────────────────────────── */

/**
 * Retorna quantas horas somar ao horário local do estádio para obter BRT (UTC-3).
 * A API envia os horários no fuso local de cada cidade-sede.
 * Eastern (EDT) = UTC-4 → BRT +1
 * Central US (CDT) = UTC-5 → BRT +2
 * Central MX = UTC-6 → BRT +3 (México aboliu DST em 2023)
 * Western (PDT) = UTC-7 → BRT +4
 */
function _stadiumToBrtOffset(stadiumId) {
  const s = state.stadiumsMap.get(String(stadiumId));
  if (!s) return 0;
  if (s.region === "Eastern") return 1;
  if (s.region === "Western") return 4;
  if (s.region === "Central") return s.country_en === "Mexico" ? 3 : 2;
  return 0;
}

/**
 * Anexa game._utcMs a cada jogo: timestamp UTC correto da partida.
 * Converte o horário local do estádio (local_date) para UTC usando o offset de cada sede.
 * Formula: UTC = local + (3 + brtOffset) horas  (porque BRT = UTC-3)
 * Exemplo: 13:00 EDT (brtOffset=1) → UTC = 13 + 4 = 17:00 UTC ✓
 */
function _enrichGamesUtcMs(games) {
  for (const g of games) {
    const m = String(g.local_date ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!m) continue;
    const [, mo, day, y, h, mi] = m;
    const brtOffset = _stadiumToBrtOffset(g.stadium_id);
    // Date.UTC lida corretamente com overflow de horas (ex: 25h → dia seguinte)
    g._utcMs = Date.UTC(+y, +mo - 1, +day, +h + 3 + brtOffset, +mi);
  }
}

function _renderToday(allGames) {
  const el = document.getElementById("today-section");
  if (!el) return;

  const now = new Date();
  const todayStr = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const todayGames = allGames.filter((g) => {
    const ms = g._utcMs ?? parseGameDate(g.local_date)?.getTime() ?? null;
    if (ms === null) return false;
    return new Date(ms).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === todayStr;
  });

  if (todayGames.length === 0) {
    el.innerHTML = `<p class="today-empty">🌟 Sem jogos hoje.</p>`;
    return;
  }

  // ── Calcula ranking do dia ──
  const dayPts = {};
  for (const a of AMIGOS) dayPts[a] = 0;
  let anyFinished = false;

  for (const g of todayGames) {
    const status = getStatus(g, now);
    if (status !== "finished") continue;
    anyFinished = true;
    const oficial = `${g.home_score} x ${g.away_score}`;
    for (const a of AMIGOS) {
      const p = state.palpitesStore.palpites[String(g.id)]?.[a];
      const pts = calcularPontos(p, oficial);
      if (pts != null) dayPts[a] += pts;
    }
  }

  const sortedDay = Object.entries(dayPts).sort((a, b) => b[1] - a[1]);
  const MEDALS = ["🥇", "🥈", "🥉"];

  // ── Monta HTML dos jogos ──
  const gamesHtml = todayGames
    .sort((a, b) => {
      const da = parseGameDate(a.local_date);
      const db = parseGameDate(b.local_date);
      return (da?.getTime() ?? 0) - (db?.getTime() ?? 0);
    })
    .map((g) => {
      const status = getStatus(g, now);
      const homeFlag = getTeamFlag(g, "home", state.teamsMap);
      const awayFlag = getTeamFlag(g, "away", state.teamsMap);
      const homeName = getTeamName(g, "home", state.teamsMap) || g.home_team_name_en;
      const awayName = getTeamName(g, "away", state.teamsMap) || g.away_team_name_en;
      const homeShort = homeName.length > 10 ? homeName.split(" ")[0] : homeName;
      const awayShort = awayName.length > 10 ? awayName.split(" ")[0] : awayName;
      const homeFlagHtml = homeFlag ? `<img class="cal-flag" src="${homeFlag}" alt="${homeName}" loading="lazy">` : "";
      const awayFlagHtml = awayFlag ? `<img class="cal-flag" src="${awayFlag}" alt="${awayName}" loading="lazy">` : "";
      // Converte horário local do estádio para BRT
      const rawTime = g.local_date ? g.local_date.split(" ")[1] : null;
      let hora = rawTime ?? "";
      if (rawTime) {
        const [hh, mm] = rawTime.split(":").map(Number);
        const offset = _stadiumToBrtOffset(g.stadium_id);
        const brtH = (hh + offset) % 24;
        hora = `${String(brtH).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      }
      let scoreBadge;
      if (status === "finished") {
        scoreBadge = `<span class="today-score finished">${g.home_score} x ${g.away_score}</span>`;
      } else if (status === "live") {
        scoreBadge = `<span class="today-score live">🔴 ${g.home_score ?? 0} x ${g.away_score ?? 0}</span>`;
      } else {
        scoreBadge = `<span class="today-score scheduled">${hora}</span>`;
      }
      const cazeUrl = getCazeTVLink(homeName) ?? "https://www.youtube.com/@CazeTV";
      return `<a class="today-game" href="${cazeUrl}" target="_blank" rel="noopener noreferrer" title="Assistir na CazeTV">
        <span class="today-team" title="${homeName}">${homeFlagHtml} ${homeShort}</span>
        ${scoreBadge}
        <span class="today-team" title="${awayName}">${awayFlagHtml} ${awayShort}</span>
        <span class="today-cazetv">📺</span>
      </a>`;
    }).join("");

  // ── Monta HTML do ranking diário ──
  let rankingHtml = "";
  if (anyFinished) {
    const top3 = sortedDay.slice(0, 3);
    const rest = sortedDay.slice(3);
    const POD_COLORS = ["pos-1", "pos-2", "pos-3"];
    const top3Html = top3.map(([amigo, pts], i) =>
      `<div class="today-podium-card ${POD_COLORS[i]}">
        <span class="podium-medal">${MEDALS[i]}</span>
        <span class="podium-name">${amigo}</span>
        <span class="podium-pts">${pts}pt</span>
      </div>`
    ).join("");
    const restHtml = rest.map(([amigo, pts], i) =>
      `<span class="today-rank-item">#${i + 4} ${amigo} <b>${pts}pt</b></span>`
    ).join("");
    rankingHtml = `<div class="today-ranking">
      <span class="today-ranking-title">🏆 Top 3 do dia</span>
      <div class="today-podium">${top3Html}</div>
      ${rest.length ? `<div class="today-ranking-list">${restHtml}</div>` : ""}
    </div>`;
  }

  const hasLiveNow = todayGames.some((g) => getStatus(g) === "live");
  const liveBadge = hasLiveNow ? `<span class="live-badge">🔴 AO VIVO · atualiza a cada 30s</span>` : "";
  const dateLabel = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
  el.innerHTML = `
    <div class="today-header">
      <span class="today-title">📅 Jogos de hoje — <span class="today-date">${dateLabel}</span></span>
      ${liveBadge}
    </div>
    <div class="today-games-list">${gamesHtml}</div>
    ${rankingHtml}
  `;

  // ── Tabela de palpites do dia ──
  const todayTableContainer = document.createElement("div");
  todayTableContainer.className = "today-table-wrap";
  const allDayKeys = [...new Set(state.games.map(g => {
    const d = parseGameDate(g.local_date);
    if (!d) return "0000-00-00";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }))].sort();
  const todayDateObj = now;
  const todayKey = `${todayDateObj.getFullYear()}-${String(todayDateObj.getMonth() + 1).padStart(2, "0")}-${String(todayDateObj.getDate()).padStart(2, "0")}`;
  const dayNum = allDayKeys.indexOf(todayKey) + 1;
  const daySection = renderDaySection(
    dayNum, todayKey, todayGames,
    state.teamsMap, state.stadiumsMap, state.palpitesStore,
    isAuthenticated(), _handlePalpiteChange, _handleGameClick
  );
  todayTableContainer.appendChild(daySection);
  el.appendChild(todayTableContainer);
}

/* ─────────────────────────────────────────────────────────
   CALLBACK: palpite alterado
   ───────────────────────────────────────────────────────── */

function _handlePalpiteChange(gameId, amigo, amigoIdx, valor, oficialPlacar) {
  if (!isAuthenticated()) return;
  if (!validarPalpite(valor)) return;

  const normalized = normalizarPalpite(valor) || valor;
  setPalpite(gameId, amigo, normalized, state.palpitesStore);
  debouncedSave();

  // Atualiza a célula de resultado imediatamente se o jogo já terminou
  if (oficialPlacar) {
    const pts = calcularPontos(normalized, oficialPlacar);
    updateResultCell(gameId, amigoIdx, pts, normalized);
    debouncedUpdateTotais();
  }
}

/* ─────────────────────────────────────────────────────────
   CALLBACK: clique no nome do jogo → modal de detalhes
   ───────────────────────────────────────────────────────── */

function _handleGameClick(game, homeName, awayName, teamsMap, stadiumsMap) {
  const stadium = stadiumsMap.get(String(game.stadium_id));
  const stadiumName = stadium?.name ?? `Estádio ${game.stadium_id}`;
  const stadiumCity = stadium?.city ?? "—";
  const status = getStatus(game);
  const statusLabel = { scheduled: "⏳ Agendado", live: "🔴 Ao vivo", finished: "✅ Finalizado" }[status] ?? "—";
  const placar = game.finished === "TRUE"
    ? `${game.home_score} x ${game.away_score}`
    : status === "live" ? `${game.home_score ?? 0} x ${game.away_score ?? 0} (em andamento)` : "—";

  const modal = document.getElementById("game-modal");
  document.getElementById("game-modal-title").textContent = `${homeName} × ${awayName}`;
  document.getElementById("game-modal-body").innerHTML = `
    <div class="game-detail">
      <div class="game-detail-row"><span class="game-detail-label">Grupo</span><span>${game.group}</span></div>
      <div class="game-detail-row"><span class="game-detail-label">Rodada</span><span>${game.matchday}</span></div>
      <div class="game-detail-row"><span class="game-detail-label">Data/Hora</span><span>${game.local_date ?? "—"}</span></div>
      <div class="game-detail-row"><span class="game-detail-label">Status</span><span>${statusLabel}</span></div>
      <div class="game-detail-row"><span class="game-detail-label">Placar</span><span>${placar}</span></div>
      <div class="game-detail-row"><span class="game-detail-label">Estádio</span><span>${stadiumName}</span></div>
      <div class="game-detail-row"><span class="game-detail-label">Cidade</span><span>${stadiumCity}</span></div>
      <div class="game-detail-row"><span class="game-detail-label">ID</span><span>#${game.id}</span></div>
    </div>
    `;
  modal.classList.remove("hidden");
  document.getElementById("btn-close-game-modal").focus();
}

/* ─────────────────────────────────────────────────────────
   EVENT LISTENERS
   ───────────────────────────────────────────────────────── */

function _setupEventListeners() {

  // ── Login ──
  document.getElementById("btn-login").addEventListener("click", () => {
    document.getElementById("login-modal").classList.remove("hidden");
    document.getElementById("input-user").focus();
  });

  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const user = document.getElementById("input-user").value.trim();
    const pass = document.getElementById("input-pass").value;
    if (login(user, pass)) {
      document.getElementById("login-modal").classList.add("hidden");
      document.getElementById("login-error").classList.add("hidden");
      document.getElementById("input-user").value = "";
      document.getElementById("input-pass").value = "";
      _updateAuthUI();
      _renderAll();
    } else {
      document.getElementById("login-error").classList.remove("hidden");
    }
  });

  document.getElementById("btn-cancel-login").addEventListener("click", () => {
    document.getElementById("login-modal").classList.add("hidden");
    document.getElementById("login-error").classList.add("hidden");
  });

  // ── Logout ──
  document.getElementById("btn-logout").addEventListener("click", () => {
    logout();
    _updateAuthUI();
    _renderAll();
  });

  // ── Fechar modais (backdrop ou botão) ──
  document.querySelectorAll(".modal-backdrop").forEach((bd) => {
    bd.addEventListener("click", () => bd.closest(".modal").classList.add("hidden"));
  });
  document.getElementById("btn-close-game-modal").addEventListener("click", () => {
    document.getElementById("game-modal").classList.add("hidden");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal:not(.hidden)").forEach((m) => m.classList.add("hidden"));
      _scoreModalGameId = null;
    }
  });

  // ── Modo escuro ──
  document.getElementById("btn-dark-mode").addEventListener("click", () => {
    const isDark = document.documentElement.dataset.theme === "dark";
    document.documentElement.dataset.theme = isDark ? "" : "dark";
    document.getElementById("btn-dark-mode").textContent = isDark ? "🌙" : "☀️";
    localStorage.setItem("bolao_theme", isDark ? "" : "dark");
  });

  // ── Filtros ──
  document.getElementById("filter-group").addEventListener("change", (e) => {
    state.filters.group = e.target.value;
    _renderAll();
  });
  document.getElementById("filter-round").addEventListener("change", (e) => {
    state.filters.round = e.target.value;
    _renderAll();
  });
  document.getElementById("filter-status").addEventListener("change", (e) => {
    state.filters.status = e.target.value;
    _renderAll();
  });

  // ── Tabs / Carrossel ──
  const _carousel = document.getElementById("view-carousel");
  const _navBtns = document.querySelectorAll(".section-nav-btn[data-tab]");
  const _panels = _carousel.querySelectorAll(".view-panel");

  function _updateActiveBtn() {
    const idx = Math.round(_carousel.scrollLeft / (_carousel.offsetWidth || 1));
    _navBtns.forEach((btn) => btn.classList.toggle("active", Number(btn.dataset.tab) === idx));
  }

  function _switchTab(idx) {
    _carousel.scrollTo({ left: idx * _carousel.offsetWidth, behavior: "smooth" });
    _navBtns.forEach((btn) => btn.classList.toggle("active", Number(btn.dataset.tab) === idx));
  }

  _navBtns.forEach((btn) => {
    btn.addEventListener("click", () => _switchTab(Number(btn.dataset.tab)));
  });

  // Sincroniza aba ao parar de deslizar
  let _scrollEndTimer;
  _carousel.addEventListener("scrollend", _updateActiveBtn);
  _carousel.addEventListener("scroll", () => {
    clearTimeout(_scrollEndTimer);
    _scrollEndTimer = setTimeout(_updateActiveBtn, 120);
  });

  // Estado inicial correto
  _updateActiveBtn();

  // ── Exportar ──
  document.getElementById("btn-export").addEventListener("click", exportJSON);

  // ── Salvar PDF ──
  document.getElementById("btn-pdf").addEventListener("click", () => window.print());

  // ── Importar ──
  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });
  document.getElementById("import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await importJSON(file);
      state.palpitesStore = data;
      _renderAll();
      alert("✅ Palpites importados com sucesso!");
    } catch (err) {
      alert(`❌ Erro ao importar: ${err.message}`);
    }
    e.target.value = "";
  });

  // ── Preencher aleatório (admin) ──
  document.getElementById("btn-random").addEventListener("click", () => {
    if (!isAuthenticated()) return;
    if (!confirm("Preencher palpites aleatórios para todos os jogos ainda não finalizados?")) return;
    for (const game of state.games) {
      if (game.finished === "TRUE") continue;
      for (const amigo of AMIGOS) {
        if (!getPalpite(game.id, amigo, state.palpitesStore)) {
          setPalpite(game.id, amigo, randomPlacar(), state.palpitesStore);
        }
      }
    }
    savePalpites(state.palpitesStore);
    _renderAll();
  });

  // ── Limpar palpites (admin) ──
  document.getElementById("btn-clear").addEventListener("click", () => {
    if (!isAuthenticated()) return;
    if (!confirm("⚠️ Limpar TODOS os palpites? Esta ação não pode ser desfeita.")) return;
    state.palpitesStore = { versao: 1, palpites: {} };
    savePalpites(state.palpitesStore);
    _renderAll();
  });

  // ── Tentar novamente ──
  document.getElementById("btn-retry").addEventListener("click", () => _loadAPIData(true));

  // ── Filtros do calendário ──
  document.getElementById("cal-filter-bar")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".cal-filter-btn");
    if (!btn) return;
    document.querySelectorAll(".cal-filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.calFilter = btn.dataset.filter;
    _renderCalendar(_gamesWithOverrides(), state.calFilter);
  });

  // ── Delegação: botão editar placar no calendário ──
  document.querySelector(".main-content").addEventListener("click", (e) => {
    const btn = e.target.closest(".cal-edit-btn");
    if (btn && isAuthenticated()) _openScoreModal(String(btn.dataset.gameId));
  });

  // ── Score modal – fechar backdrop ──
  document.getElementById("score-modal")
    .querySelector(".modal-backdrop")
    .addEventListener("click", () => _closeScoreModal());

  document.getElementById("btn-cancel-score").addEventListener("click", _closeScoreModal);

  // ── Score modal – salvar ──
  document.getElementById("score-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!_scoreModalGameId || !isAuthenticated()) return;
    const home = Math.max(0, parseInt(document.getElementById("score-home").value) || 0);
    const away = Math.max(0, parseInt(document.getElementById("score-away").value) || 0);
    const finished = document.getElementById("score-finished").checked ? "TRUE" : "FALSE";
    state.overrides[_scoreModalGameId] = { home_score: home, away_score: away, finished };
    saveOverrides(state.overrides);
    _closeScoreModal();
    _renderAll();
  });

  // ── Score modal – remover override ──
  document.getElementById("btn-clear-override").addEventListener("click", () => {
    if (!_scoreModalGameId || !isAuthenticated()) return;
    delete state.overrides[_scoreModalGameId];
    saveOverrides(state.overrides);
    _closeScoreModal();
    _renderAll();
  });

  // ── Compartilhar link ──
  document.getElementById("btn-share").addEventListener("click", () => {
    const url = `${window.location.href.split("#")[0]}#view`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        alert("🔗 Link copiado! Qualquer pessoa com este link pode visualizar sem editar.");
      }).catch(() => prompt("Copie o link abaixo:", url));
    } else {
      prompt("Copie o link abaixo:", url);
    }
  });

  // ── Arrastar para rolar qualquer tabela horizontalmente ──
  let _dragEl = null, _dragStartX = 0, _dragStartLeft = 0;

  document.addEventListener("mousedown", (e) => {
    const scrollEl = e.target.closest(".table-scroll");
    if (!scrollEl || e.target.closest("input, button, a")) return;
    _dragEl = scrollEl;
    _dragStartX = e.pageX - scrollEl.offsetLeft;
    _dragStartLeft = scrollEl.scrollLeft;
    scrollEl.classList.add("dragging");
    e.preventDefault();
  });

  document.addEventListener("mouseup", () => {
    _dragEl?.classList.remove("dragging");
    _dragEl = null;
  });

  document.addEventListener("mousemove", (e) => {
    if (!_dragEl) return;
    const x = e.pageX - _dragEl.offsetLeft;
    _dragEl.scrollLeft = _dragStartLeft - (x - _dragStartX);
  });
}

/* ─────────────────────────────────────────────────────────
   HELPERS: OVERRIDES
   ───────────────────────────────────────────────────────── */

/** Retorna cópia dos jogos com overrides manuais aplicados. */
function _gamesWithOverrides() {
  if (Object.keys(state.overrides).length === 0) return state.games;
  return state.games.map((g) => {
    const ov = state.overrides[String(g.id)];
    return ov ? { ...g, ...ov } : g;
  });
}

/* ─────────────────────────────────────────────────────────
   CALENDÁRIO COMPLETO
   ───────────────────────────────────────────────────────── */

/**
 * Renderiza todos os jogos da fase de grupos agrupados por data.
 * @param {Object[]} games – já com overrides aplicados
 * @param {string}   filter – "all" | "scheduled" | "live" | "finished"
 */
function _renderCalendar(games, filter = "all") {
  const section = document.getElementById("calendar-section");
  const container = document.getElementById("calendar-container");
  const countEl = document.getElementById("calendar-count");
  if (!section || !container) return;

  if (games.length === 0) { section.classList.add("hidden"); return; }
  section.classList.remove("hidden");

  // Aplica filtro de status
  const filtered = filter === "all"
    ? games
    : games.filter((g) => getStatus(g) === filter);

  if (countEl) countEl.textContent = `${filtered.length} de ${games.length} jogos`;

  container.innerHTML = "";

  if (filtered.length === 0) {
    const msg = document.createElement("p");
    msg.textContent = "Nenhum jogo nesta categoria.";
    msg.style.cssText = "text-align:center;padding:2rem;color:var(--text-muted)";
    container.appendChild(msg);
    return;
  }

  const now = new Date();
  const todayStr = now.toDateString();
  const tomorrowStr = (() => { const d = new Date(now); d.setDate(d.getDate() + 1); return d.toDateString(); })();
  const admin = isAuthenticated();

  // Agrupa por dia
  const byDay = new Map();
  for (const game of filtered) {
    const gd = parseGameDate(game.local_date);
    const key = gd ? gd.toDateString() : "__sem_data__";
    if (!byDay.has(key)) byDay.set(key, { date: gd, games: [] });
    byDay.get(key).games.push(game);
  }

  // Ordena dias cronologicamente
  const sortedDays = [...byDay.entries()].sort(([, a], [, b]) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date - b.date;
  });

  for (const [dayKey, { date, games: dayGames }] of sortedDays) {
    // Ordena jogos dentro do dia por horário
    dayGames.sort((a, b) => {
      const ta = parseGameDate(a.local_date);
      const tb = parseGameDate(b.local_date);
      if (!ta || !tb) return 0;
      return ta - tb;
    });

    const isToday = dayKey === todayStr;
    const isTomorrow = dayKey === tomorrowStr;

    // Rótulo do dia
    let dayLabel = "", badgeLabel = "", dateLabel = "";
    if (dayKey === "__sem_data__") {
      dayLabel = "Data a definir";
      badgeLabel = "—";
    } else if (isToday) {
      dayLabel = date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
      badgeLabel = "HOJE";
    } else if (isTomorrow) {
      dayLabel = date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
      badgeLabel = "AMANHÃ";
    } else if (date) {
      dayLabel = date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
      dateLabel = date.getFullYear().toString();
    }

    // Bloco do dia
    const dayEl = document.createElement("div");
    dayEl.className = `cal-day${isToday ? " cal-day-today" : ""}`;

    const header = document.createElement("div");
    header.className = "cal-day-header";
    header.innerHTML =
      `<div class="cal-day-left">` +
      (badgeLabel ? `<span class="cal-day-badge">${badgeLabel}</span>` : "") +
      `<span>${dayLabel}</span></div>` +
      (dateLabel ? `<span class="cal-day-date">${dateLabel}</span>` : "");
    dayEl.appendChild(header);

    const gamesEl = document.createElement("div");
    gamesEl.className = "cal-games";

    for (const game of dayGames) {
      const homeName = getTeamName(game, "home", state.teamsMap);
      const awayName = getTeamName(game, "away", state.teamsMap);
      const homeFlag = getTeamFlag(game, "home", state.teamsMap);
      const awayFlag = getTeamFlag(game, "away", state.teamsMap);
      const homeFlagHtml = homeFlag ? `<img class="cal-flag" src="${homeFlag}" alt="${homeName}" loading="lazy">` : "";
      const awayFlagHtml = awayFlag ? `<img class="cal-flag" src="${awayFlag}" alt="${awayName}" loading="lazy">` : "";
      const status = getStatus(game);
      const gameDate = parseGameDate(game.local_date);
      const timeStr = gameDate
        ? gameDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : "—";

      const isManual = !!state.overrides[String(game.id)];

      let scoreHtml;
      if (game.finished === "TRUE") {
        scoreHtml = `<span class="cal-score cal-score-done">${game.home_score} × ${game.away_score}${isManual ? " <span title='Placar manual'>✏️</span>" : ""}</span>`;
      } else if (status === "live") {
        scoreHtml = `<span class="cal-score cal-score-live">${game.home_score ?? 0} × ${game.away_score ?? 0} 🔴</span>`;
      } else {
        scoreHtml = `<span class="cal-score cal-score-pending">—</span>`;
      }

      const card = document.createElement("div");
      card.className = `cal-card cal-card-${status}`;
      card.dataset.gameId = String(game.id);
      card.innerHTML = `
    <div class="cal-card-top">
          <span class="cal-meta">Gr.<b>${game.group}</b> · Rd${game.matchday}</span>
          <span class="cal-time">${timeStr}</span>
        </div>
    <div class="cal-card-teams">
      <div class="cal-team cal-team-home" title="${homeName}">
        ${homeFlagHtml}
        <span class="cal-team-name">${homeName}</span>
      </div>
      <div class="cal-card-score">${scoreHtml}</div>
      <div class="cal-team cal-team-away" title="${awayName}">
        ${awayFlagHtml}
        <span class="cal-team-name">${awayName}</span>
      </div>
    </div>
        ${admin ? `<div class="cal-card-footer"><button class="cal-edit-btn" data-game-id="${game.id}" aria-label="Editar placar: ${homeName} × ${awayName}" title="Editar placar">✏️ Editar placar</button></div>` : ""}
  `;
      gamesEl.appendChild(card);
    }

    dayEl.appendChild(gamesEl);
    container.appendChild(dayEl);
  }
}

/* ─────────────────────────────────────────────────────────
   SCORE MODAL
   ───────────────────────────────────────────────────────── */

function _openScoreModal(gameId) {
  const game = _gamesWithOverrides().find((g) => String(g.id) === String(gameId));
  if (!game) return;

  _scoreModalGameId = String(gameId);

  const homeName = getTeamName(game, "home", state.teamsMap);
  const awayName = getTeamName(game, "away", state.teamsMap);
  const existing = state.overrides[String(gameId)];

  document.getElementById("score-modal-game").textContent = `${homeName} × ${awayName}`; document.getElementById("score-home-label").textContent = homeName;
  document.getElementById("score-away-label").textContent = awayName;
  document.getElementById("score-home").value = existing?.home_score ?? game.home_score ?? 0;
  document.getElementById("score-away").value = existing?.away_score ?? game.away_score ?? 0;
  document.getElementById("score-finished").checked = (existing?.finished ?? game.finished) === "TRUE";

  const note = document.getElementById("score-manual-note");
  note.classList.toggle("hidden", !existing);

  document.getElementById("score-modal").classList.remove("hidden");
  document.getElementById("score-home").focus();
  document.getElementById("score-home").select();
}

function _closeScoreModal() {
  _scoreModalGameId = null;
  document.getElementById("score-modal").classList.add("hidden");
}

/* ─────────────────────────────────────────────────────────   AUTO-REFRESH (60 s) para jogos ao vivo
   ───────────────────────────────────────────────────────── */

function _scheduleAutoRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(async () => {
    const now = new Date();
    const todayStr = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const hasTodayGames = state.games.some((g) => {
      const ms = g._utcMs ?? parseGameDate(g.local_date)?.getTime() ?? null;
      return ms !== null && new Date(ms).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === todayStr;
    });
    if (!hasTodayGames) return;
    try {
      const updated = await fetchGames(true);
      state.games = updated;
      _enrichGamesUtcMs(state.games);
      const games = _gamesWithOverrides();
      _renderToday(games);
      atualizarCelulas(games, state.palpitesStore);
      atualizarTotais(games, state.palpitesStore);
      document.getElementById("api-status").textContent =
        `✅ ${new Date().toLocaleTimeString("pt-BR")}`;
    } catch (err) {
      console.warn("[app] Auto-refresh falhou:", err);
    }
  }, 30_000);
}

/* ─────────────────────────────────────────────────────────
   UI HELPERS
   ───────────────────────────────────────────────────────── */

function _updateAuthUI() {
  const admin = isAuthenticated();
  document.getElementById("btn-login").classList.toggle("hidden", admin);
  document.getElementById("btn-logout").classList.toggle("hidden", !admin);
  document.getElementById("admin-badge").classList.toggle("hidden", !admin);
}

function _updateAdminUI() {
  const admin = isAuthenticated();
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.classList.toggle("hidden", !admin);
  });
}

function _restoreTheme() {
  const saved = localStorage.getItem("bolao_theme");
  const isDark = saved === "dark" || saved === null; // dark é o padrão
  if (isDark) {
    document.documentElement.dataset.theme = "dark";
    document.getElementById("btn-dark-mode").textContent = "☀️";
  }
}

/* ─────────────────────────────────────────────────────────
   BOOT
   ───────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", init);
