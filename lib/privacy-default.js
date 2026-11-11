/**
 * النص الافتراضي لسياسة الخصوصية. بيتعدل من لوحة التحكم (محتوى الموقع > سياسة الخصوصية).
 * الكلمات اللي بين {} بتتبدل تلقائياً ببيانات الشركة: {company} {license} {email} {phone} {address}
 * سطر يبدأ بـ "## " = عنوان، وسطر يبدأ بـ "- " = نقطة في قايمة.
 */
module.exports = {
  updated: '2026-11-09',
  body: {
    ar: `تحترم {company} خصوصية كل من يستخدم هذا الموقع. توضح هذه السياسة البيانات التي نجمعها، ولماذا نجمعها، وكيف نحميها، وما هي حقوقك.

## البيانات التي نجمعها
- عند طلب عرض سعر: الاسم، واسم الشركة، وبيانات التواصل، والصنف والكمية وموقع التسليم وتفاصيل الطلب، وأي ملف ترفقه.
- عند تسجيلك كمورد أو مصنع: بيانات الشركة ونشاطها والمسؤول عنها، والملف التعريفي إذا أرفقته.
- عند إرسال استفسار: الاسم، ورقم الموبايل، والبريد الإلكتروني، ونص الرسالة.
- عند استخدام المساعد (الشات): نص رسائلك، والاسم ورقم الموبايل لو تركتها لنتواصل معك. وعند تفعيل الذكاء الاصطناعي قد تُرسل رسائلك إلى مزوّد الخدمة (Google Gemini) لتوليد الرد، فلا ترسل بيانات حساسة.
- إحصائيات زيارات مجمّعة (عدد الزيارات والصفحات ومصدر الزيارة ونوع الجهاز) دون ملفات تعريف ارتباط (كوكيز) ودون حفظ عنوان IP أو أي بيانات تحدد هويتك.

## لماذا نستخدم بياناتك
- للتواصل معك بخصوص طلبك أو استفسارك وتجهيز عروض الأسعار.
- لتقييم الموردين والمصانع والتواصل معهم عند وجود فرصة تعاون.
- لا نبيع بياناتك ولا نستخدمها في أي غرض آخر.

## مع من نشارك البيانات
- شركات النقل أو المصانع الشريكة عند الحاجة لتجهيز طلبك وتوصيله، وفي حدود ما يلزم لذلك.
- الجهات الحكومية المختصة عندما يتطلب القانون ذلك.
- مزودو الخدمات التقنية التي يعمل عليها الموقع (الاستضافة والبريد الإلكتروني)، وذلك لتشغيل الخدمة فقط.
- عند اختيارك الإرسال عبر واتساب، تنتقل الرسالة من جهازك مباشرة إلى واتساب وتخضع لسياسة الخصوصية الخاصة به.

## حماية البيانات ومدة الاحتفاظ بها
- البيانات محفوظة على خادم الموقع، ولا يطّلع عليها إلا موظفو الشركة المصرّح لهم من خلال لوحة تحكم محمية.
- الملفات المرفوعة (قوائم الكميات والملفات التعريفية) غير متاحة للعامة.
- نحتفظ بالبيانات طوال المدة اللازمة لتحقيق الغرض الذي جُمعت من أجله، وبحد أقصى سنتين من آخر تواصل، ما لم تطلب حذفها قبل ذلك.

## حقوقك
- معرفة البيانات المحفوظة عنك والاطلاع عليها.
- تصحيح أي بيانات غير دقيقة أو تحديثها.
- طلب حذف بياناتك أو سحب موافقتك في أي وقت.
- لممارسة أي من هذه الحقوق، تواصل معنا على {email} أو {phone}.

## التواصل معنا
{company}، {address}. البريد الإلكتروني: {email}، الهاتف: {phone}.

قد نقوم بتحديث هذه السياسة من وقت لآخر، وسيظهر تاريخ آخر تحديث أعلى الصفحة.`,
    en: `{company} respects the privacy of everyone who uses this website. This policy explains what data we collect, why we collect it, how we protect it and what your rights are.

## Data we collect
- When you request a quotation: your name, company, contact details, item, quantity, delivery location and order details, and any file you attach.
- When you register as a supplier or factory: your company details, activity and contact person, and your company profile if you attach it.
- When you send an enquiry: your name, mobile number, email and message.
- When you use the assistant (chat): the text of your messages, and your name and mobile number if you leave them for a call back. When AI replies are enabled, your messages may be sent to the service provider (Google Gemini) to generate the reply, so please do not share sensitive data.
- Aggregated visit statistics (number of visits, pages, traffic source and device type) without cookies and without storing IP addresses or anything that identifies you.

## Why we use your data
- To contact you about your request or enquiry and prepare quotations.
- To evaluate suppliers and factories and contact them when there is an opportunity to work together.
- We never sell your data or use it for any other purpose.

## Who we share data with
- Transport companies or partner factories when needed to prepare and deliver your order, limited to what that requires.
- Competent government authorities when required by law.
- The technical providers the website runs on (hosting and email), only to operate the service.
- If you choose to send via WhatsApp, the message goes directly from your device to WhatsApp and is subject to WhatsApp's own privacy policy.

## Protection and retention
- Data is stored on the website server and is only accessible to authorised company staff through a protected control panel.
- Uploaded files (quantity lists and company profiles) are never publicly accessible.
- We keep data only as long as needed for the purpose it was collected for, and no longer than two years after the last contact, unless you ask us to delete it earlier.

## Your rights
- To know and access the data we hold about you.
- To correct or update inaccurate data.
- To ask us to delete your data or withdraw your consent at any time.
- To exercise any of these rights, contact us at {email} or {phone}.

## Contact us
{company}, {address}. Email: {email}, phone: {phone}.

We may update this policy from time to time. The date of the last update appears at the top of the page.`
  }
};
