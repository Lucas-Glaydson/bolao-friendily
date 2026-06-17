/**
 * Script para adicionar o resultado do jogo Austrália vs Jordânia manualmente
 * 
 * COMO USAR:
 * 1. Abra o app no navegador: http://127.0.0.1:8000
 * 2. Faça login como admin (usuário: admin, senha: bolao2026)
 * 3. Abra o Console do navegador (F12)
 * 4. Cole e execute este script completo
 */

// ============ CONFIGURAÇÃO ============
// ALTERE AQUI O RESULTADO REAL DO JOGO:
const GAME_ID = "9";  // ID do jogo Austrália vs Jordânia
const HOME_SCORE = 1;  // Gols da Austrália (exemplo)
const AWAY_SCORE = 0;  // Gols da Jordânia (exemplo)
const IS_FINISHED = true;  // true se o jogo terminou

// ============ SCRIPT ============
(function() {
  try {
    // Carrega overrides existentes
    const OVERRIDES_KEY = "bolao_overrides_v1";
    let overrides = {};
    
    try {
      const raw = localStorage.getItem(OVERRIDES_KEY);
      if (raw) overrides = JSON.parse(raw);
    } catch (e) {
      console.warn("Erro ao carregar overrides:", e);
    }
    
    // Adiciona o resultado do jogo
    overrides[GAME_ID] = {
      home_score: HOME_SCORE,
      away_score: AWAY_SCORE,
      finished: IS_FINISHED ? "TRUE" : "FALSE"
    };
    
    // Salva no localStorage
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
    
    console.log("✅ Resultado adicionado com sucesso!");
    console.log(`Jogo ID ${GAME_ID}: ${HOME_SCORE} x ${AWAY_SCORE}`);
    console.log("Agora recarregue a página (F5) para ver os pontos atualizados.");
    
    // Opcional: recarrega automaticamente após 2 segundos
    setTimeout(() => {
      if (confirm("Recarregar a página agora para aplicar as mudanças?")) {
        location.reload();
      }
    }, 2000);
    
  } catch (error) {
    console.error("❌ Erro ao adicionar resultado:", error);
  }
})();
