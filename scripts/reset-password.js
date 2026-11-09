/**
 * تغيير كلمة مرور لوحة التحكم من السيرفر مباشرة (لو الإيميل مش متظبط ونسيت كلمة المرور)
 * الاستخدام:
 *   npm run reset-password                 يعرض المستخدمين
 *   npm run reset-password -- admin NewPass#123   يغيّر كلمة مرور المستخدم admin
 */
const path = require('path');
const fs = require('fs');
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
}
const users = require('../lib/users');
const [login, pass] = process.argv.slice(2);
const list = users.list();
if (!login) {
  if (!list.length) console.log('مفيش مستخدمين لسه. ادخل ببيانات ملف .env (ADMIN_USER و ADMIN_PASS).');
  else list.forEach(u => console.log('-', u.user, u.email ? '(' + u.email + ')' : '', u.owner ? '[المدير]' : ''));
  console.log('\nعشان تغيّر كلمة مرور:  npm run reset-password -- اسم_المستخدم كلمة_المرور_الجديدة');
  process.exit(0);
}
const u = users.find(login);
if (!u) { console.error('المستخدم ده مش موجود:', login); process.exit(1); }
const security = require('../lib/security');
const pr = security.passwordProblem(pass, u.user);
if (!pass || pr) { console.error(pr || 'اكتب كلمة المرور الجديدة'); console.error('الشروط:', security.POLICY_HINT); process.exit(1); }
users.setPassword(u.id, pass);
security.audit(u, 'password_reset', 'من السيرفر (reset-password)', 'server');
console.log('تم تغيير كلمة مرور', u.user, '— (التحقق الثنائي لسه زي ما هو)');
