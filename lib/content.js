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
  { key: 'services', label: 'خدماتنا (ماذا نورّد وكيف)', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'title', type: 'bi', label: 'اسم الخدمة' }, { k: 'desc', type: 'bitext', label: 'الوصف' }] },
  { key: 'process', label: 'طريقة الطلب', hint: 'خطوات الطلب بالترتيب.', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'title', type: 'bi', label: 'الخطوة' }, { k: 'desc', type: 'bitext', label: 'الشرح' }] },
  { key: 'sectors', label: 'تصنيفات المنتجات (حديد / أسمنت)', hint: 'هي نفسها التصنيفات اللي بتختار منها لكل منتج، وبتظهر كاختيارات في فورم «اطلب عرض سعر». لو غيّرت اسم تصنيف راجع المنتجات اللي عليه.', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'name', type: 'bi', label: 'اسم التصنيف' }] },
  { key: 'why', label: 'لماذا روك لاين', kind: 'list',
    fields: [{ k: 'icon', type: 'icon', label: 'الأيقونة' }, { k: 'text', type: 'bi', label: 'الميزة' }] },
  { key: 'warehouses', label: 'مخازن إضافية (اختياري)', hint: 'الموقع بيقول إن فيه مخازن في أنحاء الجمهورية، ومعروض عنوان ولوكيشن مقر الشركة (من «بيانات الشركة والتواصل»). لو عايز تعرض مخزن بعينه ضيفه هنا بالاسم والعنوان وبيظهر في صفحة «المخازن» والفوتر.', kind: 'list',
    fields: [{ k: 'name', type: 'bi', label: 'اسم المخزن' }, { k: 'address', type: 'bi', label: 'العنوان (المحافظة والمنطقة)' }, { k: 'phone', type: 'text', label: 'تليفون المخزن (اختياري)' }, { k: 'map', type: 'text', label: 'لينك الخريطة (اختياري)' }] },
  { key: 'team', label: 'فريق التواصل', hint: 'الأشخاص والأقسام اللي الزبون يتواصل معاهم (الإدارة، المبيعات، الحسابات، خدمة العملاء). بتظهر في صفحة «تواصل معنا».', kind: 'list',
    fields: [{ k: 'name', type: 'bi', label: 'الاسم أو القسم' }, { k: 'role', type: 'bi', label: 'الوظيفة' }, { k: 'phone', type: 'text', label: 'التليفون (اختياري)' }, { k: 'email', type: 'text', label: 'الإيميل (اختياري)' }] },
  { key: 'calc', label: 'حاسبة الكميات (الإعدادات)', hint: 'الأقطار المتاحة في الحاسبة (بفاصلة بينهم)، وطول عود الحديد القياسي بالمتر، ووزن كيس الأسمنت بالكيلو.', kind: 'object',
    fields: [{ k: 'diameters', type: 'text', label: 'الأقطار بالمم (مثال: 8,10,12,16,25)' }, { k: 'barLength', type: 'text', label: 'طول العود (متر)' }, { k: 'bagKg', type: 'text', label: 'وزن كيس الأسمنت (كجم)' }] },
  { key: 'prices', label: 'أسعار اليوم (اختياري)', hint: 'جدول أسعار استرشادية بتحدّثه إنت. مش بيظهر غير لو فيه صفوف وفعّلت قسم «أسعار اليوم» من «ترتيب الصفحة الرئيسية» (مخفي افتراضياً).', kind: 'list',
    fields: [{ k: 'name', type: 'bi', label: 'الصنف' }, { k: 'unit', type: 'bi', label: 'الوحدة (طن، كيس...)' }, { k: 'price', type: 'text', label: 'السعر (مثال: 38,500 جنيه)' }] },
  { key: 'pricesinfo', label: 'أسعار اليوم: التاريخ والملاحظة', kind: 'object',
    fields: [{ k: 'updated', type: 'text', label: 'آخر تحديث (مثال: 2026-11-12)' }, { k: 'note', type: 'bitext', label: 'ملاحظة تحت الجدول (اختياري)' }] },
  { key: 'certificates', label: 'الشهادات والاعتمادات', hint: 'زي شهادات الأيزو أو شهادة الاتحاد. اكتب الشهادات الحقيقية بس. لو القايمة فاضية القسم مش هيظهر.', kind: 'list',
    fields: [{ k: 'name', type: 'bi', label: 'اسم الشهادة' }, { k: 'issuer', type: 'bi', label: 'الجهة المانحة' }, { k: 'year', type: 'text', label: 'السنة (اختياري)' }] },
  { key: 'quotes', label: 'آراء العملاء', hint: 'اكتب آراء حقيقية بس. لو القايمة فاضية القسم مش هيظهر.', kind: 'list',
    fields: [{ k: 'name', type: 'text', label: 'الاسم أو الشركة' }, { k: 'role', type: 'bi', label: 'الصفة أو المشروع' }, { k: 'text', type: 'bitext', label: 'الرأي' }, { k: 'video', type: 'text', label: 'لينك فيديو (اختياري، يوتيوب أو فيسبوك)' }] },
  { key: 'vtypes', label: 'أنواع الموردين', hint: 'الاختيارات في فورم تسجيل الموردين والمصانع.', kind: 'list',
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
