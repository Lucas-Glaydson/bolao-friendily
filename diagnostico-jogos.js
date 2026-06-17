/**
 * Script de Diagnóstico - Jogos sem Resultado
 * 
 * Execute no console do navegador (F12) para ver quais jogos
 * deveriam estar finalizados mas não têm resultado oficial.
 */

(async function diagnosticarJogos() {
  console.log("🔍 DIAGNÓSTICO - Jogos sem Resultado\n");
  console.log("=" .repeat(60));
  
  try {
    // Carrega os palpites para ver os IDs dos jogos
    const response = await fetch('./palpites_bolao.json');
    const data = await response.json();
    const gameIds = Object.keys(data.palpites);
    
    // Carrega overrides
    const OVERRIDES_KEY = "bolao_overrides_v1";
    const overrides = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}");
    
    console.log(`\n📋 Total de jogos com palpites: ${gameIds.length}`);
    console.log(`\n🔧 Jogos com override manual: ${Object.keys(overrides).length}`);
    
    if (Object.keys(overrides).length > 0) {
      console.log("\n📝 Lista de overrides ativos:");
      for (const [id, result] of Object.entries(overrides)) {
        console.log(`   ID ${id}: ${result.home_score} x ${result.away_score} (${result.finished === "TRUE" ? "Finalizado" : "Em andamento"})`);
      }
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("\n💡 COMO ADICIONAR RESULTADO MANUAL:");
    console.log("\n1. Faça login como admin (se ainda não fez)");
    console.log("2. Vá para a aba Calendário");
    console.log("3. Clique no jogo que quer editar");
    console.log("4. No modal, insira o placar e marque como finalizado");
    console.log("5. Clique em Salvar");
    
    console.log("\n📝 OU use este template no console:");
    console.log(`
const gameId = "9";  // ← ALTERE AQUI
const home = 1;      // ← Gols do time da casa
const away = 0;      // ← Gols do visitante

const key = "bolao_overrides_v1";
let ov = JSON.parse(localStorage.getItem(key) || "{}");
ov[gameId] = { home_score: home, away_score: away, finished: "TRUE" };
localStorage.setItem(key, JSON.stringify(ov));
console.log("✅ Salvo! Recarregue (F5)");
    `);
    
    // Mostra alguns palpites do jogo 9 para referência
    console.log("\n" + "=".repeat(60));
    console.log("\n🎯 Palpites do Jogo ID 9 (Austrália vs Jordânia):");
    if (data.palpites["9"]) {
      for (const [pessoa, palpite] of Object.entries(data.palpites["9"])) {
        console.log(`   ${pessoa.padEnd(15)} → ${palpite}`);
      }
    }
    
  } catch (error) {
    console.error("❌ Erro:", error);
  }
})();
