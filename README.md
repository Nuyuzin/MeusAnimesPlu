# Meus Animes — Addon para Stremio

Addon unofficial para o Stremio que usa o site [meusanimes.blog](https://meusanimes.blog) para assistir animes com episódios separados por temporada.

## ✅ Funcionalidades

- 🎌 **Todos os Animes** — catálogo completo
- 🔥 **Em Lançamento** — animes sendo lançados agora
- 🅻 **Legendados** — somente legendados
- 🅳 **Dublados** — somente dublados
- ⚔️ **Ação / 🗺️ Aventura / 😂 Comédia / 🐉 Fantasia** — por gênero
- 🔍 **Busca** — pesquise qualquer anime pelo nome
- 📺 **Episódios por temporada** — ao clicar em um anime, vê a lista de temporadas e episódios separados
- ▶ **Player integrado** — assiste direto dentro do Stremio
- 🌐 **Fallback** — opção de abrir no navegador

## 📦 Como usar

### Opção 1 — Localmente (mais simples para testar)

**Requisitos:** Node.js 16+

```bash
npm install
npm start
```

O servidor inicia em `http://localhost:7000`.

No Stremio:
1. **Configurações** → **Addons** → **Instalar addon via URL**
2. Cole: `http://127.0.0.1:7000/manifest.json`

### Opção 2 — Render (hospedagem gratuita)

1. Suba os arquivos no **GitHub** (sem a pasta externa — o `package.json` deve estar na raiz do repositório)
2. Crie uma conta em [render.com](https://render.com)
3. Crie um **Web Service** apontando para seu repositório
4. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Copie a URL gerada (ex: `https://meus-animes.onrender.com`)
6. No Stremio, instale: `https://meus-animes.onrender.com/manifest.json`

### Opção 3 — Railway

1. Faça login em [railway.app](https://railway.app)
2. Crie novo projeto a partir do seu repositório GitHub
3. Railway detecta o `package.json` automaticamente
4. Use a URL gerada + `/manifest.json` para instalar

## 📁 Estrutura

```
stremio-meusanimes/
├── index.js       ← tudo em um único arquivo
├── package.json
├── .gitignore
└── README.md
```

## ⚙️ Variáveis de ambiente

| Variável | Padrão    | Descrição              |
|----------|-----------|------------------------|
| `PORT`   | `7000`    | Porta do servidor      |
| `HOST`   | `0.0.0.0` | Host de escuta         |

## 🔧 Como funciona

1. **Catálogos**: o addon faz scraping das páginas `/a/`, `/g/legendado/`, `/g/dublado/`, etc.
2. **Detalhes do anime**: ao clicar em um título, o addon faz scraping de `/a/{slug}/` e monta a lista de episódios separados por temporada.
3. **Stream**: ao selecionar um episódio, o addon faz scraping de `/e/{slug}/` para extrair o iframe do player e o exibe em tela cheia.

## ⚠️ Aviso

Este addon é unofficial e não tem vínculo com o meusanimes.blog. A disponibilidade do conteúdo depende do site. Para uso pessoal apenas.

## 📄 Licença

MIT
