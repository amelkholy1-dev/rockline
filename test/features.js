// اختبار الميزات الجديدة: نصوص الواجهة، ترتيب الرئيسية، الألوان، الحاسبة، قائمة الطلب، ورقة البيانات، والشات بوت (مع Gemini وهمي). التشغيل: npm run test:features
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-feat-'));
const PORT = 4314, MOCK = 4399, B = 'http://localhost:' + PORT;
const KEY = 'TESTKEY12345678901234567890';
let geminiCalls = [];
const mock = http.createServer((rq, rs) => {
  let body = ''; rq.on('data', d => body += d); rq.on('end', () => {
    let j = {}; try { j = JSON.parse(body); } catch (e) {}
    geminiCalls.push({ url: rq.url, key: rq.headers['x-goog-api-key'], body: j });
    if (/models\/bad-model/.test(rq.url) || rq.headers['x-goog-api-key'] !== KEY) { rs.statusCode = 500; return rs.end('{}'); }
    rs.setHeader('content-type', 'application/json');
    rs.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'رد من جيميناي' }] } }] }));
  });
}).listen(MOCK);
const env = Object.assign({}, process.env, { PORT, DATA_DIR: DATA, UPLOAD_DIR: path.join(DATA, 'up'), ADMIN_USER: 'owner', ADMIN_PASS: 'Strong#Pass1', SESSION_SECRET: 'x'.repeat(32), GEMINI_BASE_URL: 'http://localhost:' + MOCK });
delete env.GEMINI_API_KEY; env.UNDER_CONSTRUCTION = '0';
const srv = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); if (c) console.log('ok  ', m); };
function jar() { const c = {}; return { c, hdr() { return Object.entries(c).map(([k, v]) => k + '=' + v).join('; '); }, eat(r) { for (const s of r.headers.getSetCookie()) { const [kv] = s.split(';'); const i = kv.indexOf('='); c[kv.slice(0, i)] = kv.slice(i + 1); } } }; }
async function req(j, method, url, body, form) {
  const h = { cookie: j.hdr(), 'user-agent': 'Mozilla/5.0 (Windows NT 10) Chrome/120', origin: B };
  let b; if (form) b = form; else if (body) { h['content-type'] = 'application/x-www-form-urlencoded'; b = new URLSearchParams(body).toString(); }
  const r = await fetch(B + url, { method, headers: h, body: b, redirect: 'manual' }); j.eat(r);
  const t = await r.text(); return { s: r.status, loc: r.headers.get('location'), t, h: r.headers };
}
const totp = (secret, d = 0) => { const st = Math.floor(Date.now() / 30000) + d; const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(st)); const dec = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const ch of s) bits += A.indexOf(ch).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= bits.length; i += 8) o.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(o); }; const h = require('crypto').createHmac('sha1', dec(secret)).update(b).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const chatPost = (j, msg, lang = 'ar', hist = []) => fetch(B + '/' + lang + '/chat', { method: 'POST', headers: { 'content-type': 'application/json', cookie: j.hdr() }, body: JSON.stringify({ message: msg, history: hist }) }).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const site = () => JSON.parse(fs.readFileSync(path.join(DATA, 'site.json'), 'utf8'));

(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(B + '/admin/login'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }
  const V = jar(), A = jar();
  let r;
  // ---- الحاسبة وقسم الرئيسية الافتراضي
  r = await req(V, 'GET', '/ar/calculator'); ok(r.s === 200 && /data-calc/.test(r.t) && /calc\.js/.test(r.t), 'calculator page');
  r = await req(V, 'GET', '/en/calculator'); ok(r.s === 200, 'calculator page (en)');
  r = await req(V, 'GET', '/ar'); ok(/id="calc"/.test(r.t) && !/id="prices"/.test(r.t), 'home: calculator shown, prices board hidden by default');
  ok(/basket\.js/.test(r.t) && /id="basketBtn"/.test(r.t), 'basket script + header button present');
  ok(!/id="chat"/.test(r.t), 'chat widget off by default');
  let c = await chatPost(V, 'مواعيد العمل'); ok(c.s === 404, 'chat endpoint 404 while bot is off');
  // ---- قائمة الطلب: طلب بأصناف من غير الصنف والتفاصيل
  r = await req(V, 'GET', '/ar/quote'); ok(/id="basketList"/.test(r.t) && /name="items"/.test(r.t), 'quote page has basket list + items field');
  let f = await fetch(B + '/ar/send', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ kind: 'quote', name: 'سلة', phone: '01000000009', items: '• حديد 12 مم — 5 طن' }).toString() }).then(async x => ({ s: x.status, j: await x.json() }));
  ok(f.s === 200 && f.j.ok, 'quote with only basket items is accepted');
  f = await fetch(B + '/ar/send', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ kind: 'quote', name: 'x', phone: '01000000009' }).toString() }).then(async x => ({ s: x.status }));
  ok(f.s === 400, 'quote with no items and no details is still rejected');
  // ---- دخول الأدمن
  await req(A, 'POST', '/admin/login', { user: 'owner', pass: 'Strong#Pass1' });
  r = await req(A, 'GET', '/admin/2fa/setup'); const secret = (r.t.match(/<code[^>]*>([A-Z2-7]{32})<\/code>/) || [])[1];
  await req(A, 'POST', '/admin/2fa/setup', { code: totp(secret) }); await req(A, 'POST', '/admin/2fa/setup', {});
  r = await req(A, 'GET', '/admin/inbox'); ok(/حديد 12 مم/.test(r.t), 'basket items reach the inbox');
  for (const p of ['/admin/texts', '/admin/layout', '/admin/bot', '/admin/design', '/admin/images', '/admin/content/calc', '/admin/content/prices', '/admin/content/pricesinfo']) { const x = await req(A, 'GET', p); ok(x.s === 200, 'admin page ' + p + ' ' + x.s); }
  // ---- نصوص الواجهة
  r = await req(A, 'POST', '/admin/texts', { t_ar_nav_products: 'خامات البناء', t_ar_products: 'خامات البناء', t_en_nav_products: 'Materials', t_ar_cta_quote: 'احسب تكلفتك' });
  r = await req(V, 'GET', '/ar'); ok(/خامات البناء/.test(r.t) && /احسب تكلفتك/.test(r.t), 'UI text override shows on the site (ar)');
  r = await req(V, 'GET', '/en'); ok(/Materials/.test(r.t), 'UI text override shows on the site (en)');
  r = await req(V, 'GET', '/ar/products'); ok(/<title>خامات البناء/.test(r.t), 'page title uses the overridden text');
  ok(site().ui && site().ui.ar.nav_products === 'خامات البناء' && !site().ui.ar.nav_home, 'only changed texts are stored');
  // تطبيق المحتوى الجديد بيحتفظ بتعديلات نصوص الواجهة
  await req(A, 'POST', '/admin/apply-defaults', {}); r = await req(V, 'GET', '/ar'); ok(/خامات البناء/.test(r.t), 'apply-defaults keeps UI text overrides');
  await req(A, 'POST', '/admin/texts/reset', {}); r = await req(V, 'GET', '/ar'); ok(!/خامات البناء/.test(r.t), 'UI texts reset');
  // ---- ترتيب الصفحة الرئيسية
  await req(A, 'POST', '/admin/layout/calc/toggle', {}); r = await req(V, 'GET', '/ar'); ok(!/id="calc"/.test(r.t), 'hide the calculator section');
  await req(A, 'POST', '/admin/layout/calc/toggle', {}); r = await req(V, 'GET', '/ar'); ok(/id="calc"/.test(r.t), 'show it again');
  r = await req(V, 'GET', '/ar'); const posAbout = r.t.indexOf('id="about"'), posProducts = r.t.indexOf('id="products"');
  await req(A, 'POST', '/admin/layout/products/move', { dir: 'up' }); await req(A, 'POST', '/admin/layout/products/move', { dir: 'up' });
  r = await req(V, 'GET', '/ar'); ok(r.t.indexOf('id="products"') < r.t.indexOf('id="about"') && posAbout < posProducts, 'moving a section changes the order');
  await req(A, 'POST', '/admin/layout/reset', {}); r = await req(V, 'GET', '/ar'); ok(r.t.indexOf('id="about"') < r.t.indexOf('id="products"'), 'layout reset');
  // أسعار اليوم: الصفوف + إظهار القسم
  await req(A, 'POST', '/admin/content/prices', { json: JSON.stringify([{ name: { ar: 'حديد 12 مم' }, unit: { ar: 'طن' }, price: '99,000' }]) });
  r = await req(V, 'GET', '/ar'); ok(!/id="prices"/.test(r.t), 'prices stay hidden until enabled in layout');
  await req(A, 'POST', '/admin/layout/prices/toggle', {}); r = await req(V, 'GET', '/ar'); ok(/id="prices"/.test(r.t) && /99,000/.test(r.t), 'prices board shown when enabled');
  await req(A, 'POST', '/admin/layout/prices/toggle', {});
  // ---- الألوان
  r = await req(A, 'POST', '/admin/design/colors', { use_accent: 'on', accent: '#ff0000', use_primary: 'on', primary: '#00aa00' });
  r = await req(V, 'GET', '/ar'); ok(/--gold:#ff0000/.test(r.t) && /--navy:#00aa00/.test(r.t), 'custom colors injected');
  await req(A, 'POST', '/admin/design/colors', { use_accent: 'on', accent: 'javascript:1' }); r = await req(V, 'GET', '/ar'); ok(!/javascript:1/.test(r.t) && !/--gold:#ff0000/.test(r.t), 'invalid color rejected');
  await req(A, 'POST', '/admin/design/colors', { reset: '1' }); r = await req(V, 'GET', '/ar'); ok(!/--gold:#/.test(r.t.split('</head>')[0].split('--banner')[1] || ''), 'colors reset');
  // ---- صور: favicon وصور الخدمات
  r = await req(A, 'GET', '/admin/images'); ok(/id="favicon"/.test(r.t) && /id="svc0"/.test(r.t), 'favicon + service image slots in admin');
  // ---- ورقة بيانات PDF
  const fd = new FormData(); fd.set('title_ar', 'منتج بورقة'); fd.set('cat', 'حديد التسليح'); fd.set('visible', 'on');
  fd.set('datasheet', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'sheet.pdf');
  r = await req(A, 'POST', '/admin/projects/save', null, fd); ok(r.s === 302, 'product saved with datasheet');
  const prod = JSON.parse(fs.readFileSync(path.join(DATA, 'projects.json'), 'utf8')).find(p => p.title.ar === 'منتج بورقة');
  ok(prod && /^\/uploads\/datasheet-.*\.pdf$/.test(prod.datasheet), 'datasheet path stored');
  r = await req(V, 'GET', '/ar/products/' + prod.id); ok(r.s === 200 && r.t.includes('href="' + prod.datasheet + '"'), 'product page links the datasheet');
  const pdf = await fetch(B + prod.datasheet); ok(pdf.status === 200 && /pdf/.test(pdf.headers.get('content-type') || ''), 'datasheet downloadable');
  fs.writeFileSync(path.join(DATA, 'up', 'secret-doc.pdf'), 'x'); const sx = await fetch(B + '/uploads/secret-doc.pdf'); ok(sx.status === 404, 'other uploaded PDFs stay private');
  await req(A, 'POST', '/admin/projects/' + prod.id + '/delete', {}); ok(!fs.existsSync(path.join(DATA, 'up', path.basename(prod.datasheet))), 'datasheet file removed with the product');
  // ---- الشات بوت: وضع محتوى الموقع بس
  r = await req(A, 'POST', '/admin/bot', { enabled: 'on', mode: 'site', model: 'gemini-2.5-flash', dailyLimit: '300' }); ok(r.s === 302, 'bot enabled (site mode)');
  r = await req(V, 'GET', '/ar'); ok(/id="chat"/.test(r.t) && /chat\.js/.test(r.t), 'chat widget shown when enabled');
  c = await chatPost(V, 'مواعيد العمل'); ok(c.s === 200 && c.j.via === 'site' && /السبت/.test(c.j.reply), 'site mode answers working hours from the site: ' + (c.j.reply || '').slice(0, 40));
  c = await chatPost(V, 'بتوصلوا فين؟'); ok(/المحافظات/.test(c.j.reply), 'site mode answers delivery');
  c = await chatPost(V, 'عنوان الشركة فين'); ok(/شارع الضرائب/.test(c.j.reply) && (c.j.actions || []).some(a => /maps\.app\.goo\.gl/.test(a.url)), 'site mode answers address + map action');
  c = await chatPost(V, 'الحديد بكام؟'); ok(/عرض سعر/.test(c.j.reply) && (c.j.actions || []).some(a => /\/ar\/quote/.test(a.url)), 'site mode: price question → quote');
  c = await chatPost(V, 'what are your working hours?', 'ar'); ok(/Saturday|9 AM/.test(c.j.reply), 'English question gets an English answer');
  c = await chatPost(V, 'حاسبة الكميات'); ok((c.j.actions || []).some(a => /calculator/.test(a.url)), 'calculator action');
  c = await chatPost(V, 'ما هي عاصمة فرنسا'); ok(c.s === 200 && c.j.reply, 'unknown question gets a safe fallback');
  c = await chatPost(V, ''); ok(c.s === 400, 'empty message rejected');
  ok(geminiCalls.length === 0, 'no API call in site mode');
  // ---- الذكاء الاصطناعي (Gemini وهمي)
  r = await req(A, 'POST', '/admin/bot', { enabled: 'on', mode: 'ai', model: 'gemini-2.5-flash', dailyLimit: '300', apiKey: 'bad key!' }); ok(r.s === 302 && /bot/.test(r.loc) && !fs.existsSync(path.join(DATA, 'bot.json')) === false, 'bad key format rejected');
  r = await req(A, 'POST', '/admin/bot', { enabled: 'on', mode: 'ai', model: 'gemini-2.5-flash', dailyLimit: '300', apiKey: KEY, extra: 'كن مهذباً' });
  r = await req(A, 'GET', '/admin/bot'); ok(!r.t.includes(KEY) && r.t.includes('7890'), 'API key never shown in full (only the last 4)');
  c = await chatPost(V, 'عايز أعرف عن حديد التسليح'); ok(c.j.via === 'ai' && c.j.reply === 'رد من جيميناي', 'AI mode answers via Gemini');
  const g = geminiCalls[geminiCalls.length - 1];
  ok(g && g.key === KEY && /gemini-2\.5-flash:generateContent/.test(g.url), 'Gemini called with key header and model');
  const sys = g.body.systemInstruction.parts[0].text;
  ok(/KNOWLEDGE/.test(sys) && /مخازن في أنحاء الجمهورية/.test(sys) && /شارع الضرائب/.test(sys) && /حديد تسليح/.test(sys) && /كن مهذباً/.test(sys), 'prompt carries site knowledge + owner instructions');
  ok(g.body.contents[g.body.contents.length - 1].parts[0].text.includes('حديد التسليح'), 'user question sent as content, not in the system prompt');
  await req(A, 'POST', '/admin/bot', { enabled: 'on', mode: 'ai', model: 'bad-model', dailyLimit: '300' });
  c = await chatPost(V, 'مواعيد العمل'); ok(c.j.via === 'site' && /السبت/.test(c.j.reply), 'Gemini failure → falls back to site content');
  await req(A, 'POST', '/admin/bot', { enabled: 'on', mode: 'ai', model: 'gemini-2.5-flash', dailyLimit: String(geminiCalls.length + 1) });
  const before = geminiCalls.length; await chatPost(V, 'سؤال 1'); const after1 = geminiCalls.length; c = await chatPost(V, 'مواعيد العمل');
  ok(after1 === before + 1 && geminiCalls.length === after1 && c.j.via === 'site', 'daily limit → falls back to site content');
  await req(A, 'POST', '/admin/bot', { enabled: 'on', mode: 'ai', model: 'gemini-2.5-flash', dailyLimit: '300', remove_key: 'on' });
  const n0 = geminiCalls.length; c = await chatPost(V, 'مواعيد العمل'); ok(c.j.via === 'site' && geminiCalls.length === n0, 'removing the API key → relies on site content only');
  r = await req(A, 'POST', '/admin/bot/test', { message: 'مواعيد العمل' }); ok(r.s === 200 && /السبت/.test(r.t), 'admin test box works');
  r = await req(A, 'GET', '/admin/bot'); ok(/مواعيد العمل/.test(r.t), 'conversation log visible in admin');
  // ---- إيقاف البوت
  await req(A, 'POST', '/admin/bot', { mode: 'ai', model: 'gemini-2.5-flash', dailyLimit: '300' });
  r = await req(V, 'GET', '/ar'); ok(!/id="chat"/.test(r.t), 'bot off → widget gone'); c = await chatPost(V, 'مواعيد العمل'); ok(c.s === 404, 'bot off → endpoint 404');
  // الإدارة بس
  r = await req(V, 'GET', '/admin/bot'); ok(r.s === 302 || r.s === 403, 'bot admin page needs login');
  console.log(pass + ' passed, ' + fail + ' failed'); srv.kill(); mock.close();
  if (fail) { console.log(log.slice(-1500)); process.exit(1); }
})().catch(e => { console.log('ERR', e, log.slice(-1500)); srv.kill(); mock.close(); process.exit(1); });
