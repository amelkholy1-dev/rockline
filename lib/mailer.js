/** إرسال رسايل الموقع على إيميل الشركة (SMTP) */
const nodemailer = require('nodemailer');
const store = require('./store');

function config() {
  const m = store.get('mail') || {};
  return {
    host: process.env.MAIL_HOST || m.host || 'smtp.hostinger.com',
    port: Number(process.env.MAIL_PORT || m.port || 465),
    secure: process.env.MAIL_SECURE ? process.env.MAIL_SECURE === 'true' : m.secure !== false,
    user: process.env.MAIL_USER || m.user || '',
    pass: process.env.MAIL_PASS || m.pass || '',
    to: m.to || m.user || '',
    fromName: m.fromName || 'Website'
  };
}

function ready() {
  const c = config();
  return Boolean(c.host && c.user && c.pass && c.to);
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/**
 * rows: [[label, value], ...]
 * opts: { subject, title, replyTo, attachments }
 */
async function send(rows, opts) {
  const c = config();
  if (!ready()) throw new Error('mail-not-configured');
  const transporter = nodemailer.createTransport({
    host: c.host, port: c.port, secure: c.secure,
    auth: { user: c.user, pass: c.pass },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000
  });
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
  return transporter.sendMail({
    from: { name: c.fromName, address: c.user },
    to: opts.to || [...new Set(String(c.to).split(/[,;\s]+/).concat(opts.extraTo || []).map(x => x.trim().toLowerCase()).filter(Boolean))].join(', '),
    replyTo: opts.replyTo || undefined,
    subject: opts.subject,
    text, html,
    attachments: opts.attachments || []
  });
}

module.exports = { send, ready, config };
