/**
 * النشر على صفحة فيسبوك عن طريق Graph API.
 * بيتحفظ في data/facebook.json: رقم الصفحة واسمها و Page Access Token (سري).
 */
const store = require('./store');

const GRAPH = (process.env.FB_GRAPH_BASE || 'https://graph.facebook.com/v26.0').replace(/\/$/, '');

function cfg() { return store.get('facebook') || {}; }
function save(c) { store.set('facebook', c); }
function connected() { const c = cfg(); return Boolean(c.pageId && c.pageToken); }

// رسايل أخطاء مفهومة بدل رسايل فيسبوك
function friendly(err) {
  const e = (err && err.error) || err || {};
  const code = e.code;
  if (code === 190) return 'صلاحية الربط خلصت أو اتلغت (ممكن تكون غيّرت باسورد فيسبوك). اربط الصفحة تاني من "ربط فيسبوك".';
  if (code === 200 || code === 10 || code === 3) return 'الحساب ملوش صلاحية النشر على الصفحة. اتأكد إنك اخترت صلاحية pages_manage_posts وإنك أدمن على الصفحة.';
  if (code === 100 && /exchange|client_secret|client_id/i.test(e.message || '')) return 'App ID أو App Secret غلط، أو التوكن مش تابع للتطبيق ده.';
  if (code === 368) return 'فيسبوك وقف النشر مؤقتاً على الصفحة دي. جرّب تاني بعد شوية.';
  return 'فيسبوك رد بخطأ: ' + (e.message || 'غير معروف') + (code ? ' (كود ' + code + ')' : '');
}

async function call(path, opts) {
  let res, body;
  try {
    res = await fetch(GRAPH + path, Object.assign({ signal: AbortSignal.timeout(60000) }, opts || {}));
    body = await res.json().catch(() => ({}));
  } catch (e) {
    throw new Error('مقدرناش نوصل لفيسبوك. اتأكد إن السيرفر متصل بالإنترنت. (' + e.message + ')');
  }
  if (!res.ok || body.error) throw new Error(friendly(body));
  return body;
}
const q = o => Object.entries(o).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');

/** الخطوة 1: نحوّل توكن المستخدم القصير لتوكن طويل، ونجيب الصفحات اللي هو أدمن عليها */
async function connect(appId, appSecret, userToken) {
  const ll = await call('/oauth/access_token?' + q({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: userToken }));
  const acc = await call('/me/accounts?' + q({ fields: 'id,name,access_token,tasks', limit: 100, access_token: ll.access_token }));
  const pages = (acc.data || []).filter(p => p.access_token);
  if (!pages.length) throw new Error('الحساب ده مش أدمن على أي صفحة، أو ما اخترتش الصفحة وإنت بتعمل التوكن.');
  const c = cfg();
  c.appId = appId;
  c.pending = pages.map(p => ({ id: p.id, name: p.name, token: p.access_token, canPost: !p.tasks || p.tasks.includes('CREATE_CONTENT') }));
  save(c);
  return c.pending;
}

function selectPage(pageId) {
  const c = cfg();
  const p = (c.pending || []).find(x => x.id === pageId);
  if (!p) return null;
  c.pageId = p.id; c.pageName = p.name; c.pageToken = p.token; c.connectedAt = new Date().toISOString();
  delete c.pending;
  save(c);
  return p;
}

async function manual(pageId, pageToken) {
  const info = await call('/' + encodeURIComponent(pageId) + '?' + q({ fields: 'id,name', access_token: pageToken }));
  const c = cfg();
  c.pageId = info.id; c.pageName = info.name; c.pageToken = pageToken; c.connectedAt = new Date().toISOString();
  delete c.pending;
  save(c);
  return info;
}

async function test() {
  const c = cfg();
  return call('/' + c.pageId + '?' + q({ fields: 'id,name,link,followers_count', access_token: c.pageToken }));
}

function disconnect() {
  const c = cfg();
  ['pageId', 'pageName', 'pageToken', 'pending', 'connectedAt'].forEach(k => delete c[k]);
  save(c);
}

/** ينشر صورة ومعاها نص على الصفحة. بيرجع لينك البوست */
async function postPhoto(buffer, type, caption) {
  const c = cfg();
  const fd = new FormData();
  fd.append('source', new Blob([buffer], { type: type || 'image/jpeg' }), 'post.' + (/png/.test(type) ? 'png' : 'jpg'));
  fd.append('caption', caption || '');
  fd.append('published', 'true');
  fd.append('access_token', c.pageToken);
  const r = await call('/' + c.pageId + '/photos', { method: 'POST', body: fd });
  const postId = r.post_id || (c.pageId + '_' + r.id);
  return { id: postId, url: 'https://www.facebook.com/' + postId };
}

/** بوست نص ولينك (من غير صورة) */
async function postLink(message, link) {
  const c = cfg();
  const r = await call('/' + c.pageId + '/feed', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: q({ message, link, access_token: c.pageToken }) });
  return { id: r.id, url: 'https://www.facebook.com/' + r.id };
}

module.exports = { cfg, connected, connect, selectPage, manual, test, disconnect, postPhoto, postLink };
