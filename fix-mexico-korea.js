/**
 * Script para adicionar o resultado México vs Coreia do Sul manualmente
 * 
 * RESULTADO: México 1 x 0 Coreia do Sul (18/06/2026)
 * 
 * COMO USAR:
 * 1. Abra o app no navegador: http://127.0.0.1:8000
 * 2. Faça login como admin (usuário: admin, senha: bolao2026)
 * 3. Abra o Console do navegador (F12)
 * 4. Cole e execute este script completo
 */

(async function fixMexicoSouthKoreaGame() {
  console.log("🔍 Procurando jogo México vs Coreia do Sul...\n");

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
        games = Array.isArray(data) ? data : (data.data || data.games || []);
      } catch (e) {
        console.error("❌ Erro ao buscar da API:", e.message);
      }
    }

    // Procura o jogo
    let gameId = null;
    let gameInfo = null;

    if (games.length > 0) {
      const mexicoKorea = games.find(g => {
        const home = (g.home_team_name_en || '').toLowerCase();
        const away = (g.away_team_name_en || '').toLowerCase();
        return (
          (home.includes('mexico') && (away.includes('korea') || away.includes('south korea'))) ||
          ((home.includes('korea') || home.includes('south korea')) && away.includes('mexico'))
        );
      });

      if (mexicoKorea) {
        gameId = mexicoKorea.id;
        gameInfo = mexicoKorea;
        console.log(`✅ Jogo encontrado: ID ${gameId}`);
        console.log(`   ${mexicoKorea.home_team_name_en} vs ${mexicoKorea.away_team_name_en}`);
        console.log(`   Data: ${mexicoKorea.local_date}`);
      }
    }

    // Se não encontrou, tenta pelo ID conhecido (25)
    if (!gameId) {
      console.log("⚠️ Jogo não encontrado na busca, tentando ID conhecido: 25");
      gameId = "25";
      gameInfo = games.find(g => String(g.id) === gameId);
      if (gameInfo) {
        console.log(`✅ Jogo encontrado pelo ID: ${gameInfo.home_team_name_en} vs ${gameInfo.away_team_name_en}`);
      }
    }

    if (!gameId) {
      throw new Error("❌ Jogo México vs Coreia do Sul não encontrado!");
    }

    // Carrega os overrides do localStorage
    const overridesKey = 'bolao_overrides_v1';
    let overrides = {};
    try {
      const stored = localStorage.getItem(overridesKey);
      if (stored) overrides = JSON.parse(stored);
    } catch (e) {
      console.warn("⚠️ Erro ao carregar overrides:", e.message);
    }

    // Define o resultado correto
    // México é o time da casa, Coreia do Sul é visitante
    const newOverride = {
      home_score: 1,
      away_score: 0,
      finished: "TRUE",
      _manual: true,
      _timestamp: new Date().toISOString()
    };

    overrides[gameId] = newOverride;

    // Salva os overrides
    localStorage.setItem(overridesKey, JSON.stringify(overrides));

    console.log("\n✅ SUCESSO!");
    console.log(`   Jogo ID ${gameId} atualizado:`);
    console.log(`   Placar: México ${newOverride.home_score} x ${newOverride.away_score} Coreia do Sul`);
    console.log(`   Status: Finalizado`);
    console.log("\n🔄 Recarregue a página (F5) para ver as mudanças!\n");

    return { success: true, gameId, override: newOverride };

  } catch (error) {
    console.error("\n❌ ERRO:", error.message);
    console.error(error);
    return { success: false, error: error.message };
  }
})();
