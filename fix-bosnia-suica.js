/**
 * Script para adicionar o resultado Bosnia vs Suíça manualmente
 * 
 * RESULTADO: Suíça 4 x 1 Bósnia (18/06/2026)
 * 
 * COMO USAR:
 * 1. Abra o app no navegador: http://127.0.0.1:8000
 * 2. Faça login como admin (usuário: admin, senha: bolao2026)
 * 3. Abra o Console do navegador (F12)
 * 4. Cole e execute este script completo
 */

(async function fixBosniaSwitzerlandGame() {
  console.log("🔍 Procurando jogo Bósnia vs Suíça...\n");
  
  try {
    // Carrega os jogos do localStorage ou tenta buscar da API
    let games = [];
    const cacheKey = 'bolao_cache_v2_get_games';
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
      const parsed = JSON.parse(cached);
      games = Array.isArray(parsed.data) ? parsed.data : [];
    }
    
    // Se não tiver cache, tenta buscar da API
    if (games.length === 0) {
      console.log("⚠️ Cache vazio, tentando buscar da API...");
      try {
        const response = await fetch('https://worldcup26.ir/get/games');
        const data = await response.json();
        games = Array.isArray(data) ? data : (data.data || []);
      } catch (e) {
        console.error("❌ Erro ao buscar da API:", e.message);
      }
    }
    
    // Procura o jogo
    let gameId = null;
    let gameInfo = null;
    
    if (games.length > 0) {
      const bosniaSwiss = games.find(g => {
        const home = (g.home_team_name_en || '').toLowerCase();
        const away = (g.away_team_name_en || '').toLowerCase();
        return (
          ((home.includes('bosnia') || home.includes('hercegovina')) && 
           (away.includes('switz') || away.includes('suíça'))) ||
          ((away.includes('bosnia') || away.includes('hercegovina')) && 
           (home.includes('switz') || home.includes('suíça')))
        );
      });
      
      if (bosniaSwiss) {
        gameId = bosniaSwiss.id;
        gameInfo = bosniaSwiss;
        console.log(`✅ Jogo encontrado!`);
        console.log(`   ID: ${gameId}`);
        console.log(`   ${bosniaSwiss.home_team_name_en} vs ${bosniaSwiss.away_team_name_en}`);
        console.log(`   Data: ${bosniaSwiss.local_date}\n`);
      }
    }
    
    // Se não encontrou, pede para o usuário informar o ID manualmente
    if (!gameId) {
      console.warn("⚠️ Não foi possível encontrar o jogo automaticamente.");
      console.log("\n📋 Para encontrar o ID manualmente:");
      console.log("1. Vá para a aba 'Calendário' no app");
      console.log("2. Localize o jogo Bósnia vs Suíça");
      console.log("3. Procure na tabela qual é a posição/linha do jogo");
      console.log("4. Execute este comando com o ID correto:\n");
      console.log(`const GAME_ID = "XX";  // <-- COLOQUE O ID AQUI
const OVERRIDES_KEY = "bolao_overrides_v1";
let overrides = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}");

// Determina quem é home e quem é away
// Se Bósnia é home: Bosnia 1 x 4 Suíça
// Se Suíça é home: Suíça 4 x 1 Bósnia
overrides[GAME_ID] = { 
  home_score: 4,  // Suíça
  away_score: 1,  // Bósnia
  finished: "TRUE" 
};

localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
console.log("✅ Salvo! Recarregue (F5)");`);
      return;
    }
    
    // Determina qual time é home e qual é away
    const isSwitchHome = (gameInfo.home_team_name_en || '').toLowerCase().includes('switz');
    const home_score = isSwitchHome ? 4 : 1;
    const away_score = isSwitchHome ? 1 : 4;
    
    // Adiciona o override
    const OVERRIDES_KEY = "bolao_overrides_v1";
    let overrides = {};
    
    try {
      const raw = localStorage.getItem(OVERRIDES_KEY);
      if (raw) overrides = JSON.parse(raw);
    } catch (e) {
      console.warn("Aviso ao carregar overrides:", e);
    }
    
    overrides[gameId] = {
      home_score: home_score,
      away_score: away_score,
      finished: "TRUE"
    };
    
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
    
    console.log("✅ Resultado adicionado com sucesso!");
    console.log(`   Jogo ID ${gameId}: ${gameInfo.home_team_name_en} ${home_score} x ${away_score} ${gameInfo.away_team_name_en}`);
    console.log("   Suíça venceu 4 x 1");
    console.log("\n🔄 Recarregando página em 2 segundos...");
    
    setTimeout(() => {
      location.reload();
    }, 2000);
    
  } catch (error) {
    console.error("❌ Erro ao adicionar resultado:", error);
    console.error(error.stack);
  }
})();
