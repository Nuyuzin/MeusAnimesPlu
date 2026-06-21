const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 7000;
const HOST = '0.0.0.0';
const SITE = 'https://meusanimes.blog';

// ─── KEEP-ALIVE (Render free tier dorme após 15 min) ─────────────────────────
// Pinga o próprio serviço a cada 14 min para mantê-lo acordado.
const SELF_URL = process.env.RENDER_EXTERNAL_URL || null;
if (SELF_URL) {
  setInterval(() => {
    fetch(`${SELF_URL}/health`)
      .then(() => console.log('[keep-alive] ping OK'))
      .catch(e => console.warn('[keep-alive] ping falhou:', e.message));
  }, 14 * 60 * 1000);
  console.log('[keep-alive] ativo —', SELF_URL);
}

// ─── CACHE ────────────────────────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 20 * 60 * 1000;

async function fetchHtml(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < CACHE_TTL) return hit.v;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
    timeout: 20000,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  const text = await res.text();
  cache.set(url, { v: text, t: Date.now() });
  return text;
}

// ─── HTML HELPERS ─────────────────────────────────────────────────────────────
function decodeHtml(str) {
  return (str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8220;/g, '\u201c')
    .replace(/&#8221;/g, '\u201d')
    .replace(/&#8230;/g, '...')
    .replace(/&#039;/g, "'")
    .replace(/&#[0-9]+;/g, '')
    .trim();
}

function cleanPoster(url) {
  if (!url) return null;
  return url.replace(/-\d+x\d+(\.\w+)$/, '$1');
}

function parseMonthDate(str) {
  if (!str) return new Date().toISOString();
  const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  const m = String(str).match(/(\w{3})\.\s*(\d+),\s*(\d{4})/);
  if (m) {
    return new Date(parseInt(m[3]), months[m[1]] ?? 0, parseInt(m[2])).toISOString();
  }
  return new Date().toISOString();
}

// ─── PARSERS ──────────────────────────────────────────────────────────────────
function parseAnimeList(html) {
  const items = [];
  const seen = new Set();
  const articleRe = /<article\b[^>]*>([\s\S]*?)<\/article>/g;
  let m;
  while ((m = articleRe.exec(html)) !== null) {
    const block = m[1];
    if (/href=['"]https?:\/\/meusanimes\.blog\/e\//.test(block)) continue;
    const slugM = /href=['"]https?:\/\/meusanimes\.blog\/a\/([^/'"]+)\/['"]/i.exec(block);
    if (!slugM) continue;
    const slug = slugM[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const titleM = /<h3[^>]*>(?:<a[^>]*>)?([^<]+?)(?:<\/a>)?<\/h3>/i.exec(block);
    const imgM   = /<img\b[^>]+src=['"]([^'"]+)['"]/i.exec(block);
    const ratingM = /<(?:div[^>]*class=["']rating["']|b)>([0-9.]+)<\//i.exec(block);
    const yearM  = /<span[^>]*>(\d{4})<\/span>/i.exec(block);
    items.push({
      slug,
      title:  titleM  ? decodeHtml(titleM[1])     : slug.replace(/-/g, ' '),
      poster: cleanPoster(imgM ? imgM[1] : null),
      rating: ratingM ? parseFloat(ratingM[1])    : null,
      year:   yearM   ? parseInt(yearM[1])         : null,
    });
  }
  return items;
}

function parseAnimePage(html, slug) {
  const ogTitle = /property="og:title"\s+content="([^"]+)"/i.exec(html);
  const h1      = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);
  let title = (ogTitle ? ogTitle[1] : h1 ? h1[1] : slug)
    .replace(/Assistir\s+/i, '')
    .replace(/\s+(Online|Todos os Episodios?|Dublado|Legendado).*$/i, '')
    .replace(/ - Meus Animes.*$/, '')
    .trim();
  title = decodeHtml(title);

  const posterM = /property="og:image"\s+content="([^"]+)"/i.exec(html);
  const poster  = posterM ? posterM[1] : null;

  const descM = /<p[^>]*class="wp-block-paragraph"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  let description = '';
  if (descM) {
    description = decodeHtml(
      descM[1].replace(/<a[^>]*>.*?<\/a>/g, '').replace(/<[^>]+>/g, '')
    ).trim();
  }
  if (!description) {
    const metaDesc = /name="description"\s+content="([^"]+)"/i.exec(html);
    description = metaDesc ? decodeHtml(metaDesc[1]) : '';
  }

  const skipTags = new Set(['legendado','dublado','animes','letra-a','letra-b','letra-c','letra-d','letra-e','letra-f','letra-g','letra-h','letra-i','letra-j','letra-k','letra-l','letra-m','letra-n','letra-o','letra-p','letra-q','letra-r','letra-s','letra-t','letra-u','letra-v','letra-w','letra-x','letra-y','letra-z']);
  const genres = [];
  const genreRe = /href="https?:\/\/meusanimes\.blog\/g\/([^/"]+)\/"[^>]*rel="tag">([^<]+)<\/a>/gi;
  let gm;
  while ((gm = genreRe.exec(html)) !== null) {
    if (!skipTags.has(gm[1]) && !genres.includes(decodeHtml(gm[2]))) {
      genres.push(decodeHtml(gm[2]));
    }
  }

  const yearM = /<span\s+class="date"[^>]*>([^<]+)<\/span>/i.exec(html);
  const year  = yearM ? parseInt(yearM[1]) : null;

  const videos = [];
  const seasonBlocks = html.split("<div class='se-c'>");
  for (let si = 1; si < seasonBlocks.length; si++) {
    const block = seasonBlocks[si];
    const snM = /<span class='se-t[^']*'>(\d+)<\/span>/i.exec(block);
    const seasonNum = snM ? parseInt(snM[1]) : si;
    const liRe = /<li class='mark-\d+'>([\s\S]*?)<\/li>/g;
    let li;
    while ((li = liRe.exec(block)) !== null) {
      const ep     = li[1];
      const numM   = /<div class='numerando'>(\d+)\s*-\s*(\d+)<\/div>/i.exec(ep);
      const linkM  = /href='https?:\/\/meusanimes\.blog\/e\/([^/']+)\/'[^>]*>([^<]+)<\/a>/i.exec(ep);
      const imgM   = /<img\s+src='([^']+)'/i.exec(ep);
      const dateM  = /<span\s+class='date'>([^<]+)<\/span>/i.exec(ep);
      if (!numM || !linkM) continue;
      videos.push({
        id:        `meusanimes:ep:${linkM[1]}`,
        title:     decodeHtml(linkM[2]),
        season:    parseInt(numM[1]),
        episode:   parseInt(numM[2]),
        thumbnail: imgM ? imgM[1] : null,
        released:  parseMonthDate(dateM ? dateM[1] : null),
        overview:  `Temporada ${numM[1]}, ${decodeHtml(linkM[2])}`,
      });
    }
  }

  return { title, poster, description, genres, year, videos };
}

function parseEpisodeEmbed(html) {
  const playerM = /class=['"]player_sist[^'"]*['"][^>]*>[\s\S]{0,300}?<iframe\b[^>]+src=['"]([^'"]+)['"]/i.exec(html);
  if (playerM) return playerM[1];
  for (const im of html.matchAll(/<iframe\b[^>]+src=['"]([^'"]+)['"]/gi)) {
    if (/video|player|embed|stream|watch|serv/i.test(im[1])) return im[1];
  }
  const anyM = /<iframe\b[^>]+src=['"]([^'"]+)['"]/i.exec(html);
  return anyM ? anyM[1] : null;
}

// ─── MANIFEST ─────────────────────────────────────────────────────────────────
const MANIFEST = {
  id: 'com.meusanimes.stremio.addon',
  version: '1.0.2',
  name: 'Meus Animes',
  description: 'Animes legendados e dublados via meusanimes.blog — séries com episódios separados por temporada.',
  logo: `${SITE}/wp-content/uploads/2025/12/cropped-fovicon-192x192.png`,
  resources: ['catalog', 'meta', 'stream'],
  types: ['series'],
  catalogs: [
    { type: 'series', id: 'ma-todos',     name: '🎌 Todos os Animes', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
    { type: 'series', id: 'ma-lancamento',name: '🔥 Em Lançamento',   extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'ma-legendado', name: '🅻 Legendados',       extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'ma-dublado',   name: '🅳 Dublados',         extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'ma-acao',      name: '⚔️ Ação',             extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'ma-aventura',  name: '🗺️ Aventura',         extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'ma-comedia',   name: '😂 Comédia',          extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'ma-fantasia',  name: '🐉 Fantasia',         extra: [{ name: 'skip', isRequired: false }] },
  ],
  idPrefixes: ['meusanimes:'],
  behaviorHints: { adult: false, p2p: false },
};

const CATALOG_BASE = {
  'ma-todos':      `${SITE}/a/`,
  'ma-lancamento': `${SITE}/g/em-lancamento/`,
  'ma-legendado':  `${SITE}/g/legendado/`,
  'ma-dublado':    `${SITE}/g/dublado/`,
  'ma-acao':       `${SITE}/g/acao/`,
  'ma-aventura':   `${SITE}/g/aventura/`,
  'ma-comedia':    `${SITE}/g/comedia/`,
  'ma-fantasia':   `${SITE}/g/fantasia/`,
};

// ─── EXPRESS ──────────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
}));
app.use(express.json());

function addonBase(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host  = req.headers['x-forwarded-host']  || req.get('host');
  return `${proto}://${host}`;
}

// Extrai extras tanto do path (/skip=15.json, /search=naruto.json) quanto de ?query
function parseExtras(pathExtras, query) {
  const result = { skip: 0, search: null };
  // Path-based: "skip=15", "search=naruto", "skip=15&search=naruto"
  if (pathExtras) {
    const parts = pathExtras.split('&');
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      const k = part.slice(0, eq).trim();
      const v = decodeURIComponent(part.slice(eq + 1).trim());
      if (k === 'skip')   result.skip   = parseInt(v) || 0;
      if (k === 'search') result.search = v || null;
    }
  }
  // Query-based (override path if present)
  if (query.skip   !== undefined) result.skip   = parseInt(query.skip) || 0;
  if (query.search !== undefined) result.search = query.search || null;
  return result;
}

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    addon:  MANIFEST.name,
    version: MANIFEST.version,
    uptime: Math.floor(process.uptime()) + 's',
    cached: cache.size,
    keepAlive: !!SELF_URL,
  });
});

app.get('/', (req, res) => res.redirect('/manifest.json'));

// ── MANIFEST ──────────────────────────────────────────────────────────────────
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');
  res.json(MANIFEST);
});

// ── CATALOG ───────────────────────────────────────────────────────────────────
async function handleCatalog(catalogId, skip, search) {
  const ITEMS_PER_PAGE = 15;
  const page = Math.floor((skip || 0) / ITEMS_PER_PAGE) + 1;
  let url;
  if (search) {
    url = `${SITE}/?s=${encodeURIComponent(search)}`;
  } else {
    const base = CATALOG_BASE[catalogId] || `${SITE}/a/`;
    url = page > 1 ? `${base}page/${page}/` : base;
  }
  console.log(`[catalog] ${catalogId} skip=${skip} search=${search} → ${url}`);
  const html  = await fetchHtml(url);
  const items = parseAnimeList(html);
  console.log(`[catalog] ${items.length} itens encontrados`);
  return items.map(item => ({
    id:          `meusanimes:${item.slug}`,
    type:        'series',
    name:        item.title,
    poster:      item.poster,
    posterShape: 'poster',
    imdbRating:  item.rating,
    year:        item.year,
  }));
}

// Rota base: /catalog/series/ma-todos.json  (sem extras ou com ?skip= ?search=)
app.get('/catalog/:type/:id.json', async (req, res) => {
  try {
    const { skip, search } = parseExtras(null, req.query);
    const metas = await handleCatalog(req.params.id, skip, search);
    res.setHeader('Cache-Control', 'max-age=3600, stale-while-revalidate=600');
    res.json({ metas });
  } catch (err) {
    console.error('[catalog]', err.message);
    res.json({ metas: [] });
  }
});

// Rota com extras no path: /catalog/series/ma-todos/skip=15.json
//                          /catalog/series/ma-todos/skip=15&search=naruto.json
//                          /catalog/series/ma-todos/search=naruto.json
app.get('/catalog/:type/:id/:extras.json', async (req, res) => {
  try {
    const { skip, search } = parseExtras(req.params.extras, req.query);
    const metas = await handleCatalog(req.params.id, skip, search);
    res.setHeader('Cache-Control', search ? 'max-age=600' : 'max-age=3600, stale-while-revalidate=600');
    res.json({ metas });
  } catch (err) {
    console.error('[catalog/extras]', err.message);
    res.json({ metas: [] });
  }
});

// ── META ──────────────────────────────────────────────────────────────────────
app.get('/meta/:type/:id.json', async (req, res) => {
  try {
    const rawId = decodeURIComponent(req.params.id);
    if (!rawId.startsWith('meusanimes:')) return res.json({ meta: null });
    // ID: "meusanimes:{slug}"  — nunca "meusanimes:ep:..."
    const parts = rawId.replace('meusanimes:', '').split(':');
    const slug  = parts[0];
    if (!slug || slug === 'ep') return res.json({ meta: null });
    const url  = `${SITE}/a/${slug}/`;
    console.log(`[meta] ${slug} → ${url}`);
    const html = await fetchHtml(url);
    const data = parseAnimePage(html, slug);
    console.log(`[meta] ${data.videos.length} episódios`);
    res.setHeader('Cache-Control', 'max-age=3600, stale-while-revalidate=600');
    res.json({
      meta: {
        id:          rawId,
        type:        'series',
        name:        data.title,
        poster:      data.poster,
        posterShape: 'poster',
        background:  data.poster,
        description: data.description,
        genres:      data.genres,
        year:        data.year,
        videos:      data.videos,
      },
    });
  } catch (err) {
    console.error('[meta]', err.message);
    res.json({ meta: null });
  }
});

// ── STREAM ────────────────────────────────────────────────────────────────────
app.get('/stream/:type/:id.json', async (req, res) => {
  try {
    const rawId = decodeURIComponent(req.params.id);
    if (!rawId.startsWith('meusanimes:ep:')) return res.json({ streams: [] });
    const epSlug = rawId.slice('meusanimes:ep:'.length);
    const epUrl  = `${SITE}/e/${epSlug}/`;
    console.log(`[stream] ${epSlug} → ${epUrl}`);
    const html      = await fetchHtml(epUrl);
    const iframeSrc = parseEpisodeEmbed(html);
    console.log(`[stream] embed: ${iframeSrc || 'NÃO ENCONTRADO'}`);

    if (!iframeSrc) {
      return res.json({ streams: [{ name: 'Meus Animes', title: '🌐 Abrir no Navegador', externalUrl: epUrl }] });
    }

    const playerUrl = `${addonBase(req)}/player/${encodeURIComponent(iframeSrc)}`;
    res.setHeader('Cache-Control', 'max-age=1800');
    res.json({
      streams: [
        { name: 'Meus Animes', title: '▶ Assistir Online',       url: playerUrl },
        { name: 'Meus Animes', title: '🌐 Abrir no Navegador',   externalUrl: epUrl },
      ],
    });
  } catch (err) {
    console.error('[stream]', err.message);
    res.json({ streams: [] });
  }
});

// ── PLAYER PAGE ───────────────────────────────────────────────────────────────
app.get('/player/:embedUrl(*)', (req, res) => {
  const embedUrl = decodeURIComponent(req.params.embedUrl);
  const safe = embedUrl.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Player — Meus Animes</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
iframe{position:fixed;top:0;left:0;width:100%;height:100%;border:none}
#fb{display:none;position:fixed;inset:0;background:#111;color:#fff;font-family:sans-serif;
    flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;gap:16px}
#fb a{color:#ef5350;font-size:1.1em}
</style>
</head>
<body>
<iframe id="fr" src="${safe}" allowfullscreen
  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-pointer-lock"
  referrerpolicy="no-referrer"></iframe>
<div id="fb">
  <p>Não foi possível carregar o player inline.</p>
  <a href="${safe}" target="_blank" rel="noopener">Abrir o vídeo diretamente</a>
</div>
<script>
document.getElementById('fr').addEventListener('error',function(){
  this.style.display='none';
  document.getElementById('fb').style.display='flex';
});
</script>
</body>
</html>`);
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log(`\n[Meus Animes] Rodando na porta ${PORT}`);
  console.log(`[Meus Animes] Manifest: http://localhost:${PORT}/manifest.json`);
  console.log(`[Meus Animes] Health:   http://localhost:${PORT}/health\n`);
});
