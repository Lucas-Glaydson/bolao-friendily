# Bolão Copa 2026 – Fase de Grupos

Aplicação web **100% client-side** (HTML + CSS + JavaScript vanilla, zero dependências) para gerenciar um bolão da fase de grupos da Copa do Mundo 2026 entre amigos.

## 🚀 Como publicar grátis no GitHub Pages

1. **Crie um repositório público** no GitHub  
   → <https://github.com/new>  
   - Nome sugerido: `bolao-copa2026`  
   - Visibilidade: **Public** (Pages gratuito exige público)

2. **Suba os arquivos** do projeto para o repositório  
   ```bash
   git init
   git add .
   git commit -m "feat: bolão copa 2026 inicial"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/bolao-copa2026.git
   git push -u origin main
   ```

3. **Ative o GitHub Pages**  
   - Repositório → **Settings** → **Pages**  
   - Source: **Deploy from a branch**  
   - Branch: `main` / `/ (root)`  
   - Clique em **Save**

4. **Acesse o site** em ~1 min:  
   `https://SEU_USUARIO.github.io/bolao-copa2026/`

---

## 🔑 Credenciais de acesso

| Campo   | Valor       |
|---------|-------------|
| Usuário | `admin`     |
| Senha   | `bolao2026` |

> ⚠️ As credenciais estão hardcoded em `auth.js`. Altere antes de publicar se quiser mais segurança.

---

## 🎮 Como usar

1. Abra o site → clique em **Login** → insira as credenciais acima
2. Preencha palpites no formato `2 x 1` (ex: `2 x 0`, `1 x 1`)
3. Ao finalizar jogos, a pontuação é calculada automaticamente:
   - **✅ 3 pts** – placar exato
   - **🟡 1 pt** – resultado correto (vencedor certo, placar errado)
   - **❌ 0 pts** – resultado errado
4. Use os **filtros** (Grupo, Rodada, Status) para navegar
5. Clique em qualquer jogo para ver detalhes (estádio, horário, placar)
6. **Exporte** seus palpites em JSON como backup

---

## 📁 Estrutura de arquivos

```
├── index.html   – HTML principal
├── style.css    – Estilos (CSS custom properties, tema Copa)
├── app.js       – Orquestração principal, event listeners
├── api.js       – Integração com worldcup26.ir (com cache 5 min)
├── auth.js      – Login/logout (credenciais hardcoded)
├── storage.js   – localStorage: palpites e cache de API
├── utils.js     – Pontuação, validação, formatação, AMIGOS[]
├── render.js    – Renderização da tabela e ranking
└── README.md    – Este arquivo
```

---

## ⚙️ Funcionalidades

- **72 jogos** da fase de grupos (12 grupos × 6 jogos)
- **15 participantes** configurados em `utils.js`
- Dados em tempo real via API pública `worldcup26.ir`
- Cache local de 5 min para não sobrecarregar a API
- Auto-refresh a cada **60 segundos** quando há jogos ao vivo
- Modo **admin**: editar palpites, preencher aleatório, limpar, importar
- Modo **visitante**: somente leitura (link `#view`)
- **Modo escuro** (toggle no header)
- Exportar / Importar palpites em JSON
- Persistência automática via `localStorage` (debounce 500 ms)

---

## 🌐 API utilizada

- **Base URL**: `https://worldcup26.ir`
- Gratuita, open-source, sem autenticação
- Endpoints: `/get/games`, `/get/teams`, `/get/stadiums`, `/get/groups`

---

**Desenvolvido para Lucas – Engenharia de Software – Jala University**
