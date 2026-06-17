# 🔧 Como Corrigir o Resultado do Jogo Austrália vs Jordânia

## Problema
O jogo Austrália vs Jordânia (ID 9) não tem resultado oficial na API, então os pontos não estão sendo contabilizados.

---

## ✅ Solução 1: Interface Visual (RECOMENDADO)

### Passo a Passo:

1. **Abra o app no navegador:**
   - URL: http://127.0.0.1:8000
   
2. **Faça login como admin:**
   - Clique em "🔑 Login"
   - Usuário: `admin`
   - Senha: `bolao2026`

3. **Localize o jogo Austrália vs Jordânia:**
   - Vá para a aba "📅 Calendário"
   - Use os filtros se necessário
   - Procure pelo jogo entre Austrália e Jordânia
   
4. **Clique no placar do jogo:**
   - Clique na linha do jogo no calendário
   - Um modal "✏️ Placar Manual" será aberto

5. **Insira o resultado:**
   - Digite o número de gols de cada time
   - ✅ Marque a caixa "Marcar jogo como Finalizado"
   - Clique em "💾 Salvar"

6. **Pronto!**
   - Os pontos serão calculados automaticamente
   - Todos os participantes verão a pontuação atualizada

---

## ⚡ Solução 2: Script Rápido (Console do Navegador)

### Passo a Passo:

1. **Abra o app:** http://127.0.0.1:8000

2. **Faça login como admin** (admin / bolao2026)

3. **Abra o Console do navegador:**
   - Pressione `F12` ou
   - Clique direito → "Inspecionar" → aba "Console"

4. **Execute este comando:**

```javascript
// ALTERE OS VALORES PARA O RESULTADO REAL DO JOGO:
const gameId = "9";
const homeScore = 1;  // Gols da Austrália
const awayScore = 0;  // Gols da Jordânia

// Executa:
const key = "bolao_overrides_v1";
let overrides = JSON.parse(localStorage.getItem(key) || "{}");
overrides[gameId] = { home_score: homeScore, away_score: awayScore, finished: "TRUE" };
localStorage.setItem(key, JSON.stringify(overrides));
console.log("✅ Resultado salvo! Recarregue a página (F5)");
```

5. **Recarregue a página:** Pressione `F5`

---

## 📋 Encontrar o ID do Jogo

Se você não tem certeza de qual é o ID do jogo, execute no console:

```javascript
// Listar todos os jogos com Austrália ou Jordânia
fetch('/palpites_bolao.json')
  .then(r => r.json())
  .then(data => {
    const games = Object.keys(data.palpites);
    console.log("IDs dos jogos com palpites:", games);
    // Procure visualmente no calendário qual jogo corresponde ao ID
  });
```

---

## ⚠️ Observações

- O resultado inserido manualmente tem prioridade sobre a API
- Os pontos são calculados automaticamente após salvar
- Você pode remover o override clicando em "🗑️ Remover" no modal
- Os outros participantes verão a atualização quando recarregarem a página

---

## 🏆 Sistema de Pontuação

- **✅ 3 pontos**: Placar exato (ex: palpitou 2x1, deu 2x1)
- **🟡 1 ponto**: Resultado correto, placar errado (ex: palpitou 2x1, deu 3x0)
- **❌ 0 pontos**: Errou o resultado

---

## 🚀 Servidor Local Ativo

O servidor está rodando em: http://127.0.0.1:8000

Para parar o servidor, pressione `CTRL+C` no terminal.
