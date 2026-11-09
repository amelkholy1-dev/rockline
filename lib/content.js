/**
 * تعريف أقسام المحتوى اللي بتتعدل من لوحة التحكم (صفحة "محتوى الموقع").
 * كل قسم إما object (حقول ثابتة) أو list (عناصر تقدر تزود وتمسح وترتب).
 * أنواع الحقول:
 *   bi      نص قصير عربي + إنجليزي
 *   bitext  نص طويل عربي + إنجليزي
 *   text    نص واحد (رقم، رابط...)
 *   icon    اختيار أيقونة
 *   lines   قايمة أسطر (كل سطر عنصر)
 */
const SECTIONS = [
  { key: 'hero', label: 'الواجهة الرئيسية', hint: 'أول حاجة الزائر بيشوفها في الصفحة الرئيسية.', kind: 'object',
    fields: [
      { k: 'badge', type: 'bi', label: 'السطر الصغير فوق العنوان' },
      { k: 'title', type: 'bi', label: 'العنوان الكبير' },
      { k: 'sub', type: 'bitext', label: 'الوصف تحت العنوان' }
    ] },
  { key: 'points', label: 'مميزات الواجهة', hint: 'الكلمات القصيرة اللي جنب العنوان (ثقة، كفاءة...).', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'text', type: 'bi', label: 'الكلمة' }] },
  { key: 'stats', label: 'الأرقام', hint: 'أرقام حقيقية عن الشركة. سيب الرقم فاضي لو مش جاهز وهيتخفي.', kind: 'list',
    fields: [{ k: 'value', type: 'text', label: 'الرقم (مثال: 2500+)' }, { k: 'label', type: 'bi', label: 'الوصف' }] },
  { key: 'about', label: 'من نحن', kind: 'object',
    fields: [
      { k: 'p1', type: 'bitext', label: 'الفقرة الأولى' },
      { k: 'p2', type: 'bitext', label: 'الفقرة الثانية' },
      { k: 'vision', type: 'bitext', label: 'رؤيتنا' },
      { k: 'mission', type: 'bitext', label: 'رسالتنا' }
    ] },
  { key: 'values', label: 'قيمنا', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'text', type: 'bi', label: 'القيمة' }] },
  { key: 'services', label: 'خدماتنا', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'title', type: 'bi', label: 'اسم الخدمة' }, { k: 'desc', type: 'bitext', label: 'الوصف' }] },
  { key: 'process', label: 'آلية العمل', hint: 'الخطوات بالترتيب.', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'title', type: 'bi', label: 'الخطوة' }, { k: 'desc', type: 'bitext', label: 'الشرح' }] },
  { key: 'sectors', label: 'القطاعات', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'name', type: 'bi', label: 'اسم القطاع' }] },
  { key: 'why', label: 'لماذا نسر الخليج', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'text', type: 'bi', label: 'الميزة' }] },
  { key: 'countries', label: 'نطاق العمل (الدول)', kind: 'list',
    fields: [{ k: 'name', type: 'bi', label: 'الدولة' }, { k: 'note', type: 'bi', label: 'القطاعات المطلوبة فيها' }] },
  { key: 'professions', label: 'المهن', hint: 'بتظهر في فورمات التسجيل وفي الصفحة الرئيسية.', kind: 'list',
    fields: [{ k: 'text', type: 'bi', label: 'المهنة' }] },
  { key: 'partners', label: 'شركاؤنا', hint: 'كل مجموعة ليها اسم، وتحتها اسم كل شركة في سطر.', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'group', type: 'bi', label: 'اسم القطاع' }, { k: 'items', type: 'lines', label: 'أسماء الشركات (كل شركة في سطر)' }] },
  { key: 'quotes', label: 'آراء العملاء', hint: 'اكتب آراء حقيقية بس. لو القايمة فاضية القسم مش هيظهر.', kind: 'list',
    fields: [{ k: 'name', type: 'text', label: 'الاسم أو الشركة' }, { k: 'role', type: 'bi', label: 'الصفة أو الدولة' }, { k: 'text', type: 'bitext', label: 'الرأي' }, { k: 'video', type: 'text', label: 'لينك فيديو (اختياري، يوتيوب أو فيسبوك)' }] },
  { key: 'docs', label: 'الأوراق المطلوبة', kind: 'list',
    fields: [{ k: 'text', type: 'bi', label: 'الورقة' }] },
  { key: 'tips', label: 'نصائح للعمال', kind: 'list',
    fields: [{ k: 'text', type: 'bitext', label: 'النصيحة' }] },
  { key: 'faq', label: 'الأسئلة الشائعة', kind: 'list',
    fields: [{ k: 'q', type: 'bi', label: 'السؤال' }, { k: 'a', type: 'bitext', label: 'الإجابة' }] },
  { key: 'privacy', label: 'سياسة الخصوصية', hint: 'سطر يبدأ بـ "## " بيبقى عنوان، وسطر يبدأ بـ "- " بيبقى نقطة. الكلمات {company} {license} {email} {phone} {address} بتتبدل لوحدها ببيانات الشركة. راجع النص مع محامي قبل النشر.', kind: 'object',
    fields: [
      { k: 'updated', type: 'text', label: 'تاريخ آخر تحديث (مثال: 2026-09-28)' },
      { k: 'body', type: 'bitext', label: 'نص السياسة', rows: 22, max: 30000 }
    ] },
  { key: 'links', label: 'روابط تهمك', kind: 'list',
    fields: [{ k: 'title', type: 'bi', label: 'اسم الرابط' }, { k: 'url', type: 'text', label: 'الرابط' }] }
];

const byKey = Object.fromEntries(SECTIONS.map(s => [s.key, s]));

const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 3000);

function cleanField(f, v) {
  if (f.type === 'bi' || f.type === 'bitext') {
    const o = v && typeof v === 'object' ? v : {};
    const ar = str(o.ar, f.max), en = str(o.en, f.max);
    return { ar, en: en || '' };
  }
  if (f.type === 'lines') {
    const arr = Array.isArray(v) ? v : String(v || '').split('\n');
    return arr.map(x => str(x, 300)).filter(Boolean).slice(0, 300);
  }
  return str(v, 1000);
}

function cleanSection(sec, value) {
  const one = item => {
    const o = {};
    sec.fields.forEach(f => { o[f.k] = cleanField(f, item ? item[f.k] : undefined); });
    return o;
  };
  if (sec.kind === 'object') return one(value || {});
  return (Array.isArray(value) ? value : []).slice(0, 300).map(one);
}

module.exports = { SECTIONS, byKey, cleanSection };
