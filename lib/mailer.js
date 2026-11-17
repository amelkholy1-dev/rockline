/**
 * إرسال رسايل الموقع على إيميل الشركة (SMTP).
 * - الإعدادات من لوحة التحكم (الإيميل وطرق الإرسال) أو من متغيرات البيئة (MAIL_*) لو متظبطة.
 * - ليه سيرفر SMTP احتياطي اختياري: لو الأساسي فشل بنجرّب الاحتياطي.
 * - بنسجّل آخر نجاح وآخر فشل (mailstate) وبنشرح سبب الفشل بالعربي.
 */
const nodemailer = require('nodemailer');
const store = require('./store');

const PRESETS = {
  hostinger: { label: 'Hostinger Email', host: 'smtp.hostinger.com', port: 465, enc: 'ssl' },
  titan: { label: 'Titan Email (هوستنجر)', host: 'smtp.titan.email', port: 465, enc: 'ssl' },
  gmail: { label: 'Gmail (محتاج App Password)', host: 'smtp.gmail.com', port: 465, enc: 'ssl' },
  outlook: { label: 'Outlook / Microsoft 365', host: 'smtp.office365.com', port: 587, enc: 'starttls' }
};

const envOn = k => ['1', 'true', 'yes'].includes(String(process.env[k] || '').toLowerCase());
const ENCS = () => ['ssl', 'starttls'].concat(envOn('ALLOW_INSECURE_SMTP') ? ['none'] : []);
const encOf = m => (ENCS().includes(m && m.enc) ? m.enc : (m && m.secure === false ? 'starttls' : 'ssl'));

// عناوين داخلية مرفوضة (عشان صلاحية الإيميل متتحولش لفحص الشبكة الداخلية)
function hostProblem(h) {
  h = String(h || '').trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(h)) return 'اسم السيرفر (Host) مكتوب غلط';
  if (!envOn('ALLOW_PRIVATE_SMTP') && (/^(localhost|0\.0\.0\.0)$/.test(h) || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.endsWith('.local') || h.endsWith('.internal'))) return 'عنوان السيرفر ده داخلي ومش مسموح';
  return '';
}
const emailOk = e => /^[^\s<>;,"'()\\]+@[^\s<>;,"'()\\]+\.[^\s<>;,"'()\\]+$/.test(String(e || '').trim());
const listOf = s => String(s || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);

/** which: 'main' | 'backup' */
function config(which) {
  const m = store.get('mail') || {};
  if (which === 'backup') {
    const b = m.backup || {};
    return { host: String(b.host || '').trim(), port: Number(b.port) || 465, enc: encOf(b), login: String(b.login || b.user || '').trim(), user: String(b.user || '').trim(), pass: b.pass || '', from: String(b.from || b.user || '').trim(), fromName: m.fromName || 'Website', to: m.to || m.user || '' };
  }
  return {
    host: process.env.MAIL_HOST || m.host || 'smtp.hostinger.com',
    port: Number(process.env.MAIL_PORT || m.port || 465),
    enc: process.env.MAIL_SECURE ? (process.env.MAIL_SECURE === 'true' ? 'ssl' : 'starttls') : encOf(m),
    user: process.env.MAIL_USER || m.user || '',            // الإيميل اللي بيبعت منه الموقع
    login: process.env.MAIL_USER || m.login || m.user || '', // اسم الدخول (الغالب نفس الإيميل)
    pass: process.env.MAIL_PASS || m.pass || '',
    from: m.from || process.env.MAIL_USER || m.user || '',
    fromName: m.fromName || 'Website',
    to: m.to || m.user || '',
    replyTo: m.replyTo || '',
    bcc: m.bcc || ''
  };
}
const ready = which => { const c = config(which); return Boolean(c.host && c.login && c.pass && (which === 'backup' ? c.from : c.to)); };
const anyReady = () => ready() ;

function transport(c) {
  const o = { host: c.host, port: c.port, secure: c.enc === 'ssl', auth: { user: c.login, pass: c.pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 25000 };
  if (c.enc === 'starttls') o.requireTLS = true;
  if (c.enc === 'none') { o.ignoreTLS = true; }
  return nodemailer.createTransport(o);
}

// شرح سبب الفشل بالعربي
function explain(err) {
  const msg = String((err && (err.response || err.message)) || err || '');
  const code = String((err && err.code) || '');
  const rc = Number(err && err.responseCode) || 0;
  let hint = '';
  if (rc === 535 || /535|EAUTH|Invalid login|authentication failed|auth/i.test(code + ' ' + msg)) hint = 'اسم المستخدم أو كلمة المرور غلط. اسم المستخدم لازم يكون الإيميل كامل، وكلمة المرور بتاعة صندوق البريد (جرّب تدخل بيها على Webmail).';
  else if (/ENOTFOUND|EDNS|getaddrinfo/i.test(code + ' ' + msg)) hint = 'اسم السيرفر (SMTP Host) مكتوب غلط أو مش موجود.';
  else if (/ECONNREFUSED|ETIMEDOUT|ESOCKET|ECONNECTION|ECONNRESET|timeout|timed out|EHOSTUNREACH|ENETUNREACH/i.test(code + ' ' + msg)) hint = 'مش قادر يوصل للسيرفر: راجع الـ Host والمنفذ (Port)، أو الاستضافة بتمنع الاتصال الخارجي، أو السيرفر واقع مؤقتاً.';
  else if (/wrong version|ssl|tls|EPROTO|certificate|self.signed/i.test(code + ' ' + msg)) hint = 'مشكلة تشفير: مع المنفذ 465 اختار SSL، ومع 587 اختار STARTTLS. ولو الشهادة مش موثوقة راجع اسم السيرفر.';
  else if (rc === 550 || rc === 553 || /sender|from address|not owned|not allowed to send|relay/i.test(msg)) hint = 'السيرفر رفض عنوان المرسل أو المستقبل: لازم المرسل يكون نفس إيميل الدخول أو على نفس الدومين.';
  else if (rc === 554 || /spam|blocked|blacklist|policy/i.test(msg)) hint = 'السيرفر رفض الرسالة (سبام أو حساب محظور مؤقتاً). راجع الحساب في الاستضافة.';
  else if (rc === 452 || /quota|limit|too many/i.test(msg)) hint = 'الحساب وصل لحد الإرسال أو المساحة. جرّب بعد شوية.';
  const raw = msg.replace(/\s+/g, ' ').slice(0, 160);
  return hint ? hint + ' (' + raw + ')' : (raw || 'خطأ غير معروف');
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function state() { return store.get('mailstate') || {}; }
function record(patch) { try { store.set('mailstate', Object.assign({}, state(), patch)); } catch (e) { /* مش شرط */ } }

async function sendVia(which, rows, opts) {
  const c = config(which);
  const body = rows.filter(r => r[1]).map(r =>
    `<tr><td style="padding:10px 14px;background:#f4f7fc;color:#5b6b85;font-weight:600;white-space:nowrap;border-bottom:1px solid #e6ecf5">${esc(r[0])}</td>` +
    `<td style="padding:10px 14px;color:#0b1f44;border-bottom:1px solid #e6ecf5;white-space:pre-wrap">${esc(r[1])}</td></tr>`).join('');
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#eef3fa;padding:24px">
  <table role="presentation" style="max-width:640px;width:100%;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e3d3a6;border-collapse:collapse">
    <tr><td colspan="2" style="background:#0b1f44;color:#fff;padding:18px 20px;font-size:18px;font-weight:700;border-bottom:3px solid #c8a04a">${esc(opts.title || opts.subject)}</td></tr>
    ${body}
    <tr><td colspan="2" style="padding:12px 20px;color:#8a97ad;font-size:12px">${esc(new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }))} · ${esc(c.fromName)}</td></tr>
  </table></div>`;
  const text = rows.filter(r => r[1]).map(r => r[0] + ': ' + r[1]).join('\n');
  const mainCfg = config();
  const recipients = opts.to || [...new Set(listOf(mainCfg.to).concat(opts.extraTo || []).map(x => x.toLowerCase()).filter(emailOk))].join(', ');
  if (!recipients) throw Object.assign(new Error('مفيش إيميل مستقبِل متسجّل (الرسايل توصل على)'), { code: 'NORECIPIENT' });
  const bcc = listOf(mainCfg.bcc).filter(emailOk).join(', ');
  const t = transport(c);
  try {
    await t.sendMail({
      from: { name: c.fromName, address: c.from || c.user || c.login },
      to: recipients,
      bcc: bcc || undefined,
      replyTo: opts.replyTo || (emailOk(mainCfg.replyTo) ? mainCfg.replyTo : undefined),
      subject: opts.subject, text, html, attachments: opts.attachments || []
    });
  } finally { try { t.close(); } catch (e) { /* مش مهم */ } }
}

/**
 * rows: [[label, value], ...]
 * opts: { subject, title, replyTo, attachments, to, extraTo }
 * بيجرّب السيرفر الأساسي، ولو فشل وفيه احتياطي بيجرّبه. بيرجّع { via } أو بيرمي خطأ فيه .hint بالعربي.
 */
async function send(rows, opts) {
  if (!ready()) throw Object.assign(new Error('mail-not-configured'), { hint: 'الإيميل لسه مش متظبط: ناقص كلمة المرور أو الإيميل.' });
  opts = opts || {};
  let primaryErr;
  try { await sendVia('main', rows, opts); record({ lastOk: new Date().toISOString(), lastVia: 'main', lastError: '' }); return { via: 'main' }; }
  catch (e) { primaryErr = e; }
  if (ready('backup')) {
    try { await sendVia('backup', rows, opts); record({ lastOk: new Date().toISOString(), lastVia: 'backup', lastError: 'الأساسي فشل واتبعت من الاحتياطي: ' + explain(primaryErr).slice(0, 200) }); return { via: 'backup' }; }
    catch (e2) { primaryErr.message = explain(primaryErr) + ' | الاحتياطي: ' + explain(e2); }
  } else primaryErr.message = explain(primaryErr);
  primaryErr.hint = primaryErr.message;
  record({ lastFail: new Date().toISOString(), lastError: primaryErr.message.slice(0, 400) });
  throw primaryErr;
}

module.exports = { send, ready, config, explain, hostProblem, emailOk, listOf, PRESETS, ENCS, state, anyReady };
