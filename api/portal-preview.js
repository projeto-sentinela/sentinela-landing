// Preview do portal para WhatsApp/redes.
// Recebe /p/{token} (via rewrite do vercel.json), busca a capa daquele portal
// no Supabase e devolve as tags Open Graph com a imagem certa; a pessoa real
// e redirecionada na hora para o portal de verdade.

const APP_PORTAL_BASE = "https://app.sentinelapro.com/g/";
// Fallback: imagem de marca usada quando o portal nao tem capa nem foto.
// (temporaria: usa um arquivo que ja existe na landing; trocar depois por uma 1200x630)
const FALLBACK_IMAGE = "https://sentinelapro.com/sentinela-alerta-hero.png";
const BUCKET = "portal-media";
const SITE_NAME = "Sentinela";
const TITLE = "Sentinela · seu portal de fotos";
const DESCRIPTION =
  "Acompanhe cada etapa da sua gestação e veja suas galerias, com todo o carinho da sua fotógrafa.";

export default async function handler(req, res) {
  const token = getToken(req);
  const destino = token
    ? `${APP_PORTAL_BASE}${encodeURIComponent(token)}`
    : "https://app.sentinelapro.com";

  let imageUrl = FALLBACK_IMAGE;

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (token && SUPABASE_URL && SUPABASE_ANON_KEY) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);

      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_portal_visual_publico`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ _token: token }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (r.ok) {
        const data = await r.json();
        const row = Array.isArray(data) ? data[0] : data;
        if (row && row.publicado !== false) {
          const rawPath = row.portal_capa_url || row.foto_mae_url || null;
          const built = buildPublicImageUrl(rawPath, SUPABASE_URL);
          if (built) imageUrl = built;
        }
      }
    }
  } catch (_e) {
    // qualquer erro -> usa a imagem de marca (fallback)
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(TITLE)}</title>
<meta name="description" content="${esc(DESCRIPTION)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(TITLE)}">
<meta property="og:description" content="${esc(DESCRIPTION)}">
<meta property="og:image" content="${esc(imageUrl)}">
<meta property="og:url" content="https://sentinelapro.com/p/${encodeURIComponent(token)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(TITLE)}">
<meta name="twitter:description" content="${esc(DESCRIPTION)}">
<meta name="twitter:image" content="${esc(imageUrl)}">
<link rel="canonical" href="${esc(destino)}">
<meta http-equiv="refresh" content="0; url=${esc(destino)}">
<script>window.location.replace(${JSON.stringify(destino)});</script>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#04342C;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px;">
<p>Abrindo seu portal… <a href="${esc(destino)}" style="color:#E1F5EE;">Clique aqui se não for redirecionado.</a></p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
  res.status(200).send(html);
}

// Le o token de qualquer forma que a Vercel entregar (query, URL crua ou path /p/xxx)
function getToken(req) {
  try {
    if (req.query && req.query.token) return String(req.query.token).trim();
  } catch (_) {}
  try {
    const u = new URL(req.url, "http://x");
    const q = u.searchParams.get("token");
    if (q) return q.trim();
    const m = u.pathname.match(/\/p\/([^\/?#]+)/);
    if (m) return decodeURIComponent(m[1]).trim();
  } catch (_) {}
  return "";
}

function buildPublicImageUrl(path, supabaseUrl) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path; // dado legado (ja e URL completa)
  const clean = String(path).replace(/^\/+/, "");
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${clean}`;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
