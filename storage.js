/**
 * storage.js – Persistência de palpites e cache de API via localStorage
 */

const PALPITES_KEY = "bolao_palpites_v1";
const CACHE_PREFIX = "bolao_cache_v2_";   // v2: corrects MM/DD date format
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/* ─────────────────────────────────────────────────────────
   PALPITES
   ───────────────────────────────────────────────────────── */

/** Carrega palpites do localStorage. Retorna estrutura vazia se ausente. */
export function loadPalpites() {
  try {
    const raw = localStorage.getItem(PALPITES_KEY);
    if (!raw) return _emptyStore();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.palpites !== "object") return _emptyStore();
    return parsed;
  } catch {
    return _emptyStore();
  }
}

/** Salva palpites no localStorage. Retorna false se quota excedida. */
export function savePalpites(store) {
  try {
    store.atualizadoEm = new Date().toISOString();
    localStorage.setItem(PALPITES_KEY, JSON.stringify(store));
    return true;
  } catch (e) {
    if (e.name === "QuotaExceededError") console.warn("[storage] localStorage cheio.");
    return false;
  }
}

/** Lê o palpite de um amigo para um jogo específico. */
export function getPalpite(jogoId, amigo, store) {
  return store?.palpites?.[String(jogoId)]?.[amigo] ?? "";
}

/** Grava um palpite em memória (não faz flush para localStorage). */
export function setPalpite(jogoId, amigo, valor, store) {
  const id = String(jogoId);
  if (!store.palpites[id]) store.palpites[id] = {};
  store.palpites[id][amigo] = valor;
}

/* ─────────────────────────────────────────────────────────
   BASE DATA (palpites_bolao.json)
   ───────────────────────────────────────────────────────── */

/**
 * Carrega o arquivo palpites_bolao.json do servidor e retorna o store.
 * Retorna _emptyStore() se o arquivo não existir ou falhar.
 */
export async function loadBaseData() {
  try {
    const res = await fetch("./palpites_bolao.json", { cache: "no-cache" });
    if (!res.ok) return _emptyStore();
    const data = await res.json();
    if (!data || typeof data.palpites !== "object") return _emptyStore();
    return data;
  } catch {
    return _emptyStore();
  }
}

/**
 * Mescla baseStore com localStore: localStore tem prioridade por entrada.
 * Retorna um novo store combinado.
 */
export function mergeStores(baseStore, localStore) {
  const merged = { versao: 1, palpites: {} };
  // Copia base primeiro
  for (const [gameId, picks] of Object.entries(baseStore.palpites ?? {})) {
    merged.palpites[gameId] = { ...picks };
  }
  // Sobrescreve com localStorage (tem prioridade)
  for (const [gameId, picks] of Object.entries(localStore.palpites ?? {})) {
    if (!merged.palpites[gameId]) merged.palpites[gameId] = {};
    Object.assign(merged.palpites[gameId], picks);
  }
  return merged;
}

/* ─────────────────────────────────────────────────────────
   EXPORTAR / IMPORTAR JSON
   ───────────────────────────────────────────────────────── */

/** Faz download do JSON de palpites. */
export function exportJSON() {
  const data = localStorage.getItem(PALPITES_KEY) ?? JSON.stringify(_emptyStore());
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bolao_palpites_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Lê um arquivo JSON e valida. Retorna Promise<store>. */
export function importJSON(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("Nenhum arquivo selecionado."));
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data || typeof data.palpites !== "object") {
          throw new Error("JSON inválido: campo 'palpites' ausente.");
        }
        savePalpites(data);
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo."));
    reader.readAsText(file);
  });
}

/* ─────────────────────────────────────────────────────────
   CACHE DE API
   ───────────────────────────────────────────────────────── */

export function saveCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* ignora erros de quota no cache */ }
}

/** Retorna dados do cache se ainda válidos, ou null se expirado/ausente. */
export function loadCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
   OVERRIDES MANUAIS DE PLACAR
   ───────────────────────────────────────────────────────── */

const OVERRIDES_KEY = "bolao_overrides_v1";

/** Carrega overrides manuais do localStorage. Retorna objeto vazio se ausente. */
export function loadOverrides() {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) ?? {};
  } catch { return {}; }
}

/** Salva overrides manuais de placar. */
export function saveOverrides(overrides) {
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  } catch (e) {
    if (e.name === "QuotaExceededError") console.warn("[storage] localStorage cheio.");
  }
}

/* ─────────────────────────────────────────────────────────
   HELPERS PRIVADOS
   ───────────────────────────────────────────────────────── */
function _emptyStore() {
  return { versao: 1, palpites: {} };
}
