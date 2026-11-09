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
  { key: 'points', label: 'مميزات الواجهة', hint: 'الكلمات القصيرة اللي جنب العنوان (جودة، سلامة...).', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'text', type: 'bi', label: 'الكلمة' }] },
  { key: 'stats', label: 'الأرقام', hint: 'أرقام حقيقية عن الشركة (سنين الخبرة، عدد المشروعات...). سيب الرقم فاضي لو مش جاهز وهيتخفي.', kind: 'list',
    fields: [{ k: 'value', type: 'text', label: 'الرقم (مثال: 120+)' }, { k: 'label', type: 'bi', label: 'الوصف' }] },
  { key: 'about', label: 'من نحن', kind: 'object',
    fields: [
      { k: 'p1', type: 'bitext', label: 'الفقرة الأولى' },
      { k: 'p2', type: 'bitext', label: 'الفقرة الثانية' },
      { k: 'vision', type: 'bitext', label: 'رؤيتنا' },
      { k: 'mission', type: 'bitext', label: 'رسالتنا' }
    ] },
  { key: 'values', label: 'قيمنا', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'text', type: 'bi', label: 'القيمة' }] },
  { key: 'milestones', label: 'مسيرتنا (التاريخ)', hint: 'أهم محطات الشركة بالترتيب (سنة التأسيس، أول مشروع كبير...). لو فاضية مش هتظهر.', kind: 'list',
    fields: [{ k: 'year', type: 'text', label: 'السنة' }, { k: 'title', type: 'bi', label: 'الحدث' }, { k: 'desc', type: 'bitext', label: 'تفاصيل (اختياري)' }] },
  { key: 'services', label: 'خدماتنا', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'title', type: 'bi', label: 'اسم الخدمة' }, { k: 'desc', type: 'bitext', label: 'الوصف' }] },
  { key: 'process', label: 'آلية العمل', hint: 'الخطوات بالترتيب.', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'title', type: 'bi', label: 'الخطوة' }, { k: 'desc', type: 'bitext', label: 'الشرح' }] },
  { key: 'sectors', label: 'القطاعات (تصنيفات المشروعات)', hint: 'بتظهر في الصفحة الرئيسية، وهي نفسها التصنيفات اللي بتختار منها لكل مشروع. لو غيّرت اسم قطاع راجع المشروعات اللي عليه.', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'name', type: 'bi', label: 'اسم القطاع' }] },
  { key: 'why', label: 'لماذا روك لاين', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'text', type: 'bi', label: 'الميزة' }] },
  { key: 'hse', label: 'الجودة والسلامة والبيئة', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'title', type: 'bi', label: 'العنوان' }, { k: 'desc', type: 'bitext', label: 'الشرح' }] },
  { key: 'certificates', label: 'الشهادات والاعتمادات', hint: 'زي شهادات الأيزو أو شهادة الاتحاد. اكتب الشهادات الحقيقية بس. لو القايمة فاضية القسم مش هيظهر.', kind: 'list',
    fields: [{ k: 'name', type: 'bi', label: 'اسم الشهادة' }, { k: 'issuer', type: 'bi', label: 'الجهة المانحة' }, { k: 'year', type: 'text', label: 'السنة (اختياري)' }] },
  { key: 'regions', label: 'نطاق العمل (المناطق)', kind: 'list',
    fields: [{ k: 'name', type: 'bi', label: 'المنطقة / المحافظة' }, { k: 'note', type: 'bi', label: 'ملاحظة (نوع المشروعات فيها)' }] },
  { key: 'partners', label: 'عملاؤنا وشركاؤنا', hint: 'كل مجموعة ليها اسم (مثلاً: جهات حكومية، مطورين عقاريين)، وتحتها اسم كل عميل في سطر. اكتب عملاء حقيقيين بس.', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'group', type: 'bi', label: 'اسم المجموعة' }, { k: 'items', type: 'lines', label: 'أسماء العملاء (كل واحد في سطر)' }] },
  { key: 'quotes', label: 'آراء العملاء', hint: 'اكتب آراء حقيقية بس. لو القايمة فاضية القسم مش هيظهر.', kind: 'list',
    fields: [{ k: 'name', type: 'text', label: 'الاسم أو الشركة' }, { k: 'role', type: 'bi', label: 'الصفة أو المشروع' }, { k: 'text', type: 'bitext', label: 'الرأي' }, { k: 'video', type: 'text', label: 'لينك فيديو (اختياري، يوتيوب أو فيسبوك)' }] },
  { key: 'professions', label: 'التخصصات (للتقديم على الوظائف)', hint: 'بتظهر كاقتراحات في فورم التقديم على الوظائف.', kind: 'list',
    fields: [{ k: 'text', type: 'bi', label: 'التخصص' }] },
  { key: 'vtypes', label: 'أنواع الموردين', hint: 'الاختيارات في فورم تسجيل الموردين ومقاولي الباطن.', kind: 'list',
    fields: [{ k: 'text', type: 'bi', label: 'النوع' }] },
  { key: 'docs', label: 'مستندات تسجيل الموردين', kind: 'list',
    fields: [{ k: 'text', type: 'bi', label: 'المستند' }] },
  { key: 'faq', label: 'الأسئلة الشائعة', kind: 'list',
    fields: [{ k: 'q', type: 'bi', label: 'السؤال' }, { k: 'a', type: 'bitext', label: 'الإجابة' }] },
  { key: 'privacy', label: 'سياسة الخصوصية', hint: 'سطر يبدأ بـ "## " بيبقى عنوان، وسطر يبدأ بـ "- " بيبقى نقطة. الكلمات {company} {license} {email} {phone} {address} بتتبدل لوحدها ببيانات الشركة. راجع النص مع محامي قبل النشر.', kind: 'object',
    fields: [
      { k: 'updated', type: 'text', label: 'تاريخ آخر تحديث (مثال: 2026-11-09)' },
      { k: 'body', type: 'bitext', label: 'نص السياسة', rows: 22, max: 30000 }
    ] }
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
