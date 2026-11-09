/**
 * تخزين بسيط في ملفات JSON - مفيش قاعدة بيانات محتاجة تركيب.
 * مكان البيانات: فولدر data جنب الموقع، أو أي فولدر تحدده في DATA_DIR
 * (مفيد على الاستضافة عشان البيانات متتمسحش لما ترفع نسخة جديدة).
 */
const fs = require('fs');
const path = require('path');

const APP_DATA = path.join(__dirname, '..', 'data');
// ~ في أول المسار = فولدر الحساب الرئيسي على السيرفر (مثلاً ~/nesr-data)
const resolveDir = p => path.resolve(String(p).trim().replace(/^~(?=$|[\\/])/, require('os').homedir()));
let DIR = process.env.DATA_DIR ? resolveDir(process.env.DATA_DIR) : APP_DATA;
try {
  fs.mkdirSync(DIR, { recursive: true });
  fs.accessSync(DIR, fs.constants.W_OK);
  // أول مرة: انسخ أي ملف ناقص (زي السير الذاتية في cv) من فولدر data اللي جاي مع الموقع
  if (DIR !== APP_DATA && fs.existsSync(APP_DATA)) fs.cpSync(APP_DATA, DIR, { recursive: true, force: false, errorOnExist: false });
} catch (e) {
  console.error('DATA_DIR مش صالح (' + DIR + '): ' + e.message + ' - هنستخدم فولدر data اللي جنب الموقع.');
  DIR = APP_DATA;
  fs.mkdirSync(DIR, { recursive: true });
}

const DEFAULTS = {
  site: {},
  jobs: [],
  news: [],
  gallery: { albums: [], items: [] },
  inbox: { messages: [] },
  mail: {},
  admin: {},
  stats: { days: {} },
  facebook: {},
  masar: {},
  social: {},
  security: {},
  audit: { items: [] }
};

const cache = {};
const file = name => path.join(DIR, name + '.json');

// لو فولدر البيانات جديد وفاضي، انسخ المحتوى الافتراضي اللي جاي مع الموقع
function seed(name) {
  if (DIR === APP_DATA) return;
  const src = path.join(APP_DATA, name + '.json');
  if (!fs.existsSync(file(name)) && fs.existsSync(src)) fs.copyFileSync(src, file(name));
}

// ترقية البيانات القديمة لشكلها الجديد
function migrate(name, v) {
  if (name === 'inbox' && v && !Array.isArray(v.messages)) {
    const messages = [];
    (v.requests || []).forEach(r => messages.push({
      id: r.id, kind: 'company', channel: 'form', at: r.at, read: false,
      fields: { company: r.company, country: r.country, person: r.person, phone: r.contact, trades: r.jobs, count: r.count, notes: r.notes }
    }));
    (v.applications || []).forEach(a => messages.push({
      id: a.id, kind: 'worker', channel: 'form', at: a.at, read: false,
      fields: { name: a.name, phone: a.phone, profession: a.profession, years: a.years, country: a.dest, notes: a.notes, job: a.jobTitle },
      cvUrl: a.cv || ''
    }));
    messages.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return { messages };
  }
  if (name === 'gallery' && Array.isArray(v)) {
    const albums = v.length ? [{ id: 'general', title: { ar: 'صور متنوعة', en: 'Photos' }, at: new Date().toISOString() }] : [];
    return { albums, items: v.map(x => Object.assign({ album: 'general' }, x)) };
  }
  return v;
}

function get(name) {
  if (!(name in cache)) {
    seed(name);
    let v;
    try { v = JSON.parse(fs.readFileSync(file(name), 'utf8')); }
    catch (e) { v = JSON.parse(JSON.stringify(DEFAULTS[name] !== undefined ? DEFAULTS[name] : {})); }
    cache[name] = migrate(name, v);
  }
  return cache[name];
}

function set(name, value) {
  cache[name] = value;
  const tmp = file(name) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1), 'utf8');
  fs.renameSync(tmp, file(name));
  return value;
}

module.exports = { get, set, DIR, resolveDir };
