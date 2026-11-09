/**
 * ربط الموقع بنظام مسار HR (من سيرفر لسيرفر).
 * - صفحات التقديم (nisrelkhaleeg.com/apply/...) بتتعرض من هنا وبتتمرّر لمسار بمفتاح سري، فدومين مسار مبيظهرش للزوار.
 * - فورمات الموقع (سجّل كعامل / التقديم على وظيفة) بتتبعت لمسار ويتحط في "الوارد" بتاعه.
 * الإعدادات (الرابط والمفتاح) بتتحفظ في data/masar.json (سرية - متترفعش على GitHub)، أو من متغيرات البيئة MASAR_URL و MASAR_SITE_KEY.
 */
const { Readable } = require('stream');
const store = require('./store');

const DEF_CH = { whatsapp: true, email: true, masar: true };
const PASS_HEADERS = ['content-type', 'content-disposition', 'cache-control', 'content-security-policy', 'x-frame-options', 'x-robots-tag', 'referrer-policy', 'x-content-type-options', 'etag'];

const okUrl = u => /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u);
function cfg() {
  const m = store.get('masar') || {};
  const url = String(process.env.MASAR_URL || m.url || '').trim().replace(/\/+$/, '');
  const key = String(process.env.MASAR_SITE_KEY || m.key || '').trim();
  return { url, key, ready: okUrl(url) && key.length >= 24, fromEnv: Boolean(process.env.MASAR_SITE_KEY), channels: Object.assign({}, DEF_CH, m.channels || {}) };
}
// القنوات اللي الزائر يشوفها: واتساب / إيميل / مسار (مسار بيشتغل بس لو الربط متظبط)
function channels() {
  const c = cfg();
  return { whatsapp: c.channels.whatsapp !== false, email: c.channels.email !== false, masar: c.ready && c.channels.masar !== false };
}
function save(patch) {
  const m = store.get('masar') || {};
  if (patch.url !== undefined) m.url = String(patch.url).trim().replace(/\/+$/, '');
  if (patch.key) m.key = String(patch.key).trim();
  if (patch.channels) m.channels = Object.assign({}, DEF_CH, m.channels || {}, patch.channels);
  store.set('masar', m);
}

function headersFor(c, ip, extra) {
  return Object.assign({ 'X-Site-Key': c.key, 'X-Applicant-IP': String(ip || '').slice(0, 64) }, extra || {});
}
// طلب JSON لمسار (قراءة وإدارة الروابط)
async function json(path, opts) {
  const c = cfg();
  if (!c.ready) throw new Error('الربط مع مسار مش متظبط');
  const o = opts || {};
  const hasBody = o.body !== undefined;
  const r = await fetch(c.url + path, {
    method: o.method || 'GET',
    headers: headersFor(c, o.ip, hasBody ? { 'Content-Type': 'application/json' } : {}),
    body: hasBody ? JSON.stringify(o.body) : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(o.timeout || 15000)
  });
  let data = null;
  try { data = await r.json(); } catch (e) { /* مش JSON */ }
  if (!r.ok || !data || data.ok === false) throw new Error((data && data.message) || (r.status === 404 ? 'مسار رفض المفتاح أو الرابط غلط' : 'خطأ ' + r.status));
  return data;
}
// إرسال فورم (multipart) لمسار
async function ingest(formData, ip) {
  const c = cfg();
  if (!c.ready) return { ok: false, message: 'الربط مش متظبط' };
  try {
    const r = await fetch(c.url + '/p/api/ingest', { method: 'POST', headers: headersFor(c, ip), body: formData, redirect: 'manual', signal: AbortSignal.timeout(30000) });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok && d.ok !== false, message: d.message || '', receipt: d.receipt || '', status: r.status };
  } catch (e) { return { ok: false, message: String(e && e.message || e).slice(0, 200), status: 0 }; }
}
// بيمرّر طلب الزائر لمسار ويرجّع الرد زي ما هو (صفحة، ملفات، صور، API)
async function proxy(req, res, target, o) {
  const c = cfg();
  if (!c.ready) return res.status(404).type('text/plain; charset=utf-8').send('الرابط مش شغال حالياً');
  const opt = o || {};
  const headers = headersFor(c, req.ip);
  (opt.forward || []).forEach(h => { const v = req.headers[h]; if (v) headers[h] = String(v).slice(0, 200); });
  if (opt.json) {
    // طلب JSON: express.json اتقرا الجسم بالفعل، فبنبعته تاني من req.body
    const raw = JSON.stringify(req.body && typeof req.body === 'object' ? req.body : {});
    if (raw.length > 20000) return res.status(413).json({ ok: false, message: 'الطلب كبير' });
    headers['Content-Type'] = 'application/json'; headers['Content-Length'] = String(Buffer.byteLength(raw));
    opt.rawBody = raw;
  } else if (opt.body) {
    const len = Number(req.headers['content-length'] || 0);
    if (!len || len > (opt.maxBytes || 6 * 1024 * 1024)) return res.status(413).json({ ok: false, message: 'الملف أكبر من 5 ميجا' });
    headers['Content-Type'] = req.headers['content-type'] || '';
    headers['Content-Length'] = String(len);
  }
  let r;
  try {
    r = await fetch(c.url + target, { method: (opt.body || opt.json) ? 'POST' : 'GET', headers, body: opt.json ? opt.rawBody : opt.body ? req : undefined, duplex: opt.body && !opt.json ? 'half' : undefined, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  } catch (e) {
    return res.status(502).json({ ok: false, message: 'تعذر الاتصال دلوقتي. جرّب بعد شوية.' });
  }
  res.status(r.status);
  PASS_HEADERS.forEach(h => { const v = r.headers.get(h); if (v) res.setHeader(h, v); });
  if (!r.body) return res.end();
  Readable.fromWeb(r.body).on('error', () => res.end()).pipe(res);
}

// المفتاح اللي مسار بيبعته مع إشعاراته (نفس MASAR_SITE_KEY)
function keyOk(req) {
  const k = String(req.headers['x-site-key'] || ''), c = cfg().key;
  if (!c || c.length < 24 || k.length !== c.length) return false;
  try { return require('crypto').timingSafeEqual(Buffer.from(k), Buffer.from(c)); } catch (e) { return false; }
}
module.exports = { cfg, channels, save, json, ingest, proxy, okUrl, keyOk };
