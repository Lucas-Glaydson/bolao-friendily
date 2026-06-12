# Prompt para GitHub Copilot - Bolão da Copa do Mundo 2026

## Visão Geral
Crie uma aplicação web completa (HTML, CSS, JavaScript vanilla) para gerenciar um **bolão da fase de grupos da Copa do Mundo 2026** entre amigos. A aplicação deve ter **autenticação simples (login/senha)** para permitir edição; usuários sem login só visualizam.

---

## 🎯 Requisitos Funcionais

### 1. Autenticação e Permissões
- **Login/senha hardcoded** no JS (ex: `admin` / `bolao2026`)
- **Com login**: Pode editar palpites, salvar, recalcular
- **Sem login**: Apenas visualização (tudo `readonly`, botões de edição ocultos)
- Sessão persistida via `localStorage` (token simples ou flag `isAdmin`)

### 2. Dados dos Amigos (15 participantes)
```javascript
const amigos = [
  "Lucas", "Alefe", "Caetano", "Evelin", "Ingrid",
  "Rafael", "Valdemir", "Mauro", "Anderson", "AdilsonJR",
  "Felipe", "Miguel", "Bruno", "Emmanuel", "Zaine"
];
```

### 3. Estrutura da Tabela - Fase de Grupos (72 jogos)
A Copa 2026 tem **12 grupos (A-L)**, 4 times cada, **6 jogos por grupo = 72 jogos total**.

#### Colunas da Tabela (por jogo):
| Coluna | Conteúdo |
|--------|----------|
| 1 | **Jogo** (ex: "A1: México × África do Sul") |
| 2 | **Data/Hora** (local) |
| 3 | **Grupo** |
| 4 | **Rodada** (1, 2 ou 3) |
| 5 | **Placar Oficial** (preenchido automaticamente via API) |
| 6 | **Status** (⏳ Agendado / 🔴 Ao vivo / ✅ Finalizado) |
| --- | *Repetir para cada amigo (15 blocos de 2 colunas)* |
| 7-8 | **Lucas**: Palpite / Resultado (✅/❌/🟡) |
| 9-10 | **Alefe**: Palpite / Resultado |
| ... | ... (até Zaine) |
| Última coluna | **Total de Pontos da Rodada** (soma dos 3 jogos da rodada para aquele amigo) |
| Última linha | **Total Geral por Amigo** (soma de todas as rodadas) |

#### Formato do Palpite
- Input único no formato `"X x Y"` (ex: `"2 x 0"`)
- Validação: apenas números, separador `x` ou `X`

### 4. Sistema de Pontuação
| Critério | Pontos |
|----------|--------|
| Placar exato (ex: palpite 2x0, resultado 2x0) | **3 pontos** |
| Resultado certo, placar errado (ex: palpite 2x0, resultado 1x0) | **1 ponto** |
| Resultado errado | **0 pontos** |

#### Lógica de Comparação
```javascript
function calcularPontos(palpite, oficial) {
  if (!palpite || !oficial) return 0;
  const [pg, ps] = palpite.split('x').map(n => parseInt(n.trim()));
  const [og, os] = oficial.split('x').map(n => parseInt(n.trim()));

  if (pg === og && ps === os) return 3;           // Placar exato
  const resultadoPalpite = Math.sign(pg - ps);
  const resultadoOficial = Math.sign(og - os);
  if (resultadoPalpite === resultadoOficial) return 1; // Resultado certo
  return 0;
}
```

### 5. Cores / Feedback Visual
| Situação | Cor da Célula (Resultado) | Ícone |
|----------|---------------------------|-------|
| Placar exato (3 pts) | **Verde** (`#2e7d32`) | ✅ |
| Resultado certo (1 pt) | **Amarelo** (`#f9a825`) | 🟡 |
| Errado (0 pts) | **Vermelho** (`#c62828`) | ❌ |
| Jogo não finalizado | Cinza claro / sem cor | ⏳ |

### 6. API Externa - Dados da Copa 2026
**API recomendada (gratuita, sem chave, open-source):**
- **Base URL**: `https://worldcup26.ir`
- **Endpoints principais**:
  - `GET /get/games` → Todos os 104 jogos (filtrar `type === "group"` para 72 jogos)
  - `GET /get/groups` → Classificação dos 12 grupos
  - `GET /get/teams` → 48 times com flags
  - `GET /get/stadiums` → 16 estádios

#### Exemplo de resposta `/get/games`:
```json
{
  "id": "1",
  "home_team_id": "1",
  "away_team_id": "2",
  "home_score": 0,
  "away_score": 0,
  "group": "A",
  "matchday": "1",
  "local_date": "06/11/2026 13:00",
  "stadium_id": "1",
  "finished": "FALSE",
  "type": "group",
  "home_team_label": "",
  "away_team_label": ""
}
```
- **`finished`: "TRUE"/"FALSE"** indica se o jogo acabou
- **`home_score` / `away_score`** são atualizados em tempo real durante a Copa
- **`matchday`: "1", "2", "3"** → corresponde às 3 rodadas da fase de grupos

#### Integração
- Fazer `fetch` no carregamento da página
- Cache em `localStorage` (expirar em 5 min para não sobrecarregar)
- Atualização automática a cada **60 segundos** se houver jogos "ao vivo" (`finished === "FALSE"` mas data passada)
- Mapear `home_team_id` / `away_team_id` para nomes via `/get/teams`

### 7. Interface - Design Minimalista Tema Copa
- **Cores**: Verde gramado (`#1b5e20`), Amarelo ouro (`#ffd600`), Branco, Cinza claro
- **Tipografia**: Inter ou Roboto, tamanhos claros
- **Layout**:
  - Header fixo com título "Bolão Copa 2026 - Fase de Grupos" + botão Login/Logout
  - Tabela responsiva com **scroll horizontal** (muitas colunas)
  - **Sticky columns**: Primeira coluna (Jogo) + coluna de Totais fixas
  - Linhas alternadas (zebra) para legibilidade
  - **Filtros**: Por Grupo (A-L), Por Rodada (1,2,3), Mostrar apenas meus palpites
  - **Ordenação**: Clicar no cabeçalho da coluna "Jogo" ou "Data"
- **Estados visuais**:
  - Input de palpite: borda verde se preenchido, vermelha se inválido
  - Célula de resultado: background colorido conforme pontuação
  - Tooltip no placar oficial com detalhes (gols, tempo, estádio)

### 8. Persistência Local (Palpites)
- Salvar palpites no `localStorage` chave: `bolao_palpites_v1`
- Estrutura:
```json
{
  "versao": 1,
  "atualizadoEm": "2026-06-12T10:30:00Z",
  "palpites": {
    "1": { "Lucas": "2 x 0", "Alefe": "1 x 1", ... },
    "2": { "Lucas": "1 x 1", ... }
  }
}
```
- **Auto-save** ao digitar (debounce 500ms)
- Botão "Exportar JSON" / "Importar JSON" para backup

### 9. Cálculos Automáticos (Recalcular ao carregar / ao editar / ao atualizar API)
- **Coluna "Total Rodada"**: Para cada amigo, soma dos pontos dos 3 jogos daquela rodada
- **Linha "Total Geral"**: Para cada amigo, soma de todos os pontos (todas as rodadas)
- **Linha "Ranking"**: Exibe a classificação dos amigos em ordem decrescente de pontos, destacando os 3 primeiros colocados.
- **Linha "Ranking"**: Ordena amigos por total geral (maior para menor) - opcional

### 10. Funcionalidades Extras (Nice to Have)
- **Botão "Preencher Aleatório"** (só admin) - preenche palpites aleatórios 0-3 gols
- **Botão "Limpar Meus Palpites"** (só admin)
- **Modal de detalhes do jogo** ao clicar no nome do jogo (estádio, horário, histórico confrontos)
- **Modo escuro** (toggle no header)
- **Compartilhar link** com hash `#view` para modo somente leitura

---

## 📁 Estrutura de Arquivos Sugerida

```
/bolao-copa2026/
├── index.html          # HTML principal
├── style.css           # Estilos (CSS custom properties para tema)
├── app.js              # Lógica principal (ES Modules)
├── api.js              # Módulo de integração com worldcup26.ir
├── auth.js             # Módulo de autenticação simples
├── storage.js          # Módulo de localStorage (palpites, cache API)
├── utils.js            # Helpers (pontuação, formatação, validação)
├── render.js           # Renderização da tabela e UI
└── README.md           # Este arquivo
```

---

## 🔐 Credenciais de Teste (hardcoded no auth.js)
```javascript
const CREDENCIAIS = {
  usuario: "admin",
  senha: "bolao2026"   // Altere em produção!
};
```

---

## ✅ Checklist de Entrega para o Copilot

- [ ] `index.html` semântico, acessível (ARIA labels na tabela), meta viewport
- [ ] `style.css` com variáveis CSS para cores do tema Copa, layout grid/flex, scroll horizontal na tabela, sticky columns
- [ ] `api.js` com `fetchGames()`, `fetchTeams()`, `fetchGroups()`, cache 5 min, mapeamento IDs → nomes/flags
- [ ] `auth.js` com `login()`, `logout()`, `isAuthenticated()`, proteção de funções de edição
- [ ] `storage.js` com `savePalpites()`, `loadPalpites()`, `exportJSON()`, `importJSON()`
- [ ] `utils.js` com `calcularPontos()`, `compararPlacares()`, `formatarData()`, `validarPalpite()`
- [ ] `render.js` com `renderTabela()`, `renderLinhaJogo()`, `atualizarCores()`, `atualizarTotais()`
- [ ] `app.js` orquestra tudo: init, event listeners, auto-refresh (60s), debounced save
- [ ] Tratamento de erros: API offline, JSON inválido, localStorage cheio
- [ ] **Zero dependências externas** (vanilla JS, sem frameworks, sem build step)

---

## 💡 Dicas de Implementação para o Copilot

1. **Tabela com muitas colunas**: Use `table { table-layout: fixed; width: 100%; }` + `th, td { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }` + container `overflow-x: auto`

2. **Sticky columns**: 
```css
th:first-child, td:first-child { position: sticky; left: 0; z-index: 2; background: var(--bg); }
th:last-child, td:last-child { position: sticky; right: 0; z-index: 1; background: var(--bg); }
```

3. **Atualização eficiente**: Não re-renderize toda a tabela a cada 60s. Atualize apenas células de "Placar Oficial", "Status" e "Resultado/Pontos" dos jogos finalizados recentemente.

4. **Mapeamento times**: Crie `Map<id, {name, flag, code}>` do `/get/teams` no init.

5. **Fase de grupos apenas**: Filtre `games.filter(g => g.type === "group")` → 72 jogos.

6. **Rodadas**: `matchday` "1", "2", "3" → agrupe jogos por `group` + `matchday` para calcular "Total Rodada".

---

## 🚀 Como Testar
1. Abra `index.html` no navegador (ou `npx serve .`)
2. Clique em "Login", use `admin` / `bolao2026`
3. Preencha alguns palpites no formato `2 x 0`
4. Veja cores atualizarem, totais calcularem
5. Recarregue a página → palpites persistem
6. Logout → tente editar (deve estar bloqueado)

---

## 📝 Observações Finais
- A API `worldcup26.ir` é **gratuita, open-source, sem rate limit agressivo** para leitura
- Durante a Copa (jun-jul/2026), os scores são **atualizados em tempo real**
- O código deve funcionar **offline** (cache + localStorage) se a API cair
- Mantenha o código **modular, legível e comentado** para futuras manutenções

---

**Arquivo gerado automaticamente para uso com GitHub Copilot.**
**Desenvolvido para Lucas - Engenharia de Software - Jala University**
