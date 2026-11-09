/**
 * النص الافتراضي لسياسة الخصوصية. بيتعدل من لوحة التحكم (محتوى الموقع > سياسة الخصوصية).
 * الكلمات اللي بين {} بتتبدل تلقائياً ببيانات الشركة: {company} {license} {email} {phone} {address}
 * سطر يبدأ بـ "## " = عنوان، وسطر يبدأ بـ "- " = نقطة في قايمة.
 */
module.exports = {
  updated: '2026-09-28',
  body: {
    ar: `تحترم {company} (ترخيص رقم {license}) خصوصية كل من يستخدم هذا الموقع. توضح هذه السياسة البيانات التي نجمعها، ولماذا نجمعها، وكيف نحميها، وما هي حقوقك.

## البيانات التي نجمعها
- عند تسجيلك كعامل: الاسم، ورقم الموبايل، والمهنة، وسنوات الخبرة، والدولة المفضلة، وأي تفاصيل تكتبها، والسيرة الذاتية إذا أرفقتها.
- عند طلب عمالة من شركة: اسم الشركة، والدولة، واسم المسؤول، وبيانات التواصل، والمهن والأعداد المطلوبة.
- عند إرسال استفسار: الاسم، ورقم الموبايل، والبريد الإلكتروني، ونص الرسالة.
- إحصائيات زيارات مجمّعة (عدد الزيارات والصفحات ومصدر الزيارة ونوع الجهاز) دون ملفات تعريف ارتباط (كوكيز) ودون حفظ عنوان IP أو أي بيانات تحدد هويتك.

## لماذا نستخدم بياناتك
- للتواصل معك بخصوص طلبك أو استفسارك.
- لترشيح العمال لفرص العمل المناسبة لدى جهات العمل بالخارج.
- للرد على طلبات الشركات وتقديم خدماتنا لها.
- لا نبيع بياناتك ولا نستخدمها في أي غرض آخر.

## مع من نشارك البيانات
- جهات العمل (أصحاب العمل) عند ترشيحك لوظيفة محددة، وفي حدود ما يلزم لهذا الترشيح.
- الجهات الحكومية المختصة عندما يتطلب القانون أو إجراءات السفر ذلك.
- مزودو الخدمات التقنية التي يعمل عليها الموقع (الاستضافة والبريد الإلكتروني)، وذلك لتشغيل الخدمة فقط.
- عند اختيارك الإرسال عبر واتساب، تنتقل الرسالة من جهازك مباشرة إلى واتساب وتخضع لسياسة الخصوصية الخاصة به.

## حماية البيانات ومدة الاحتفاظ بها
- البيانات محفوظة على خادم الموقع، ولا يطّلع عليها إلا موظفو الشركة المصرّح لهم من خلال لوحة تحكم محمية بكلمة مرور.
- السير الذاتية المرفوعة غير متاحة للعامة.
- نحتفظ بالبيانات طوال المدة اللازمة لتحقيق الغرض الذي جُمعت من أجله، وبحد أقصى سنتين من آخر تواصل، ما لم تطلب حذفها قبل ذلك.

## حقوقك
- معرفة البيانات المحفوظة عنك والاطلاع عليها.
- تصحيح أي بيانات غير دقيقة أو تحديثها.
- طلب حذف بياناتك أو سحب موافقتك في أي وقت.
- لممارسة أي من هذه الحقوق، تواصل معنا على {email} أو {phone}.

## التواصل معنا
{company}، {address}. البريد الإلكتروني: {email}، الهاتف: {phone}.

قد نقوم بتحديث هذه السياسة من وقت لآخر، وسيظهر تاريخ آخر تحديث أعلى الصفحة.`,
    en: `{company} (License No. {license}) respects the privacy of everyone who uses this website. This policy explains what data we collect, why we collect it, how we protect it and what your rights are.

## Data we collect
- When you register as a worker: your name, mobile number, trade, years of experience, preferred country, any details you write and your CV if you attach it.
- When a company requests manpower: company name, country, contact person, contact details, and the trades and numbers required.
- When you send an enquiry: your name, mobile number, email and message.
- Aggregated visit statistics (number of visits, pages, traffic source and device type) without cookies and without storing IP addresses or anything that identifies you.

## Why we use your data
- To contact you about your request or enquiry.
- To shortlist workers for suitable job opportunities with employers abroad.
- To respond to company requests and provide our services.
- We never sell your data or use it for any other purpose.

## Who we share data with
- Employers, when you are shortlisted for a specific vacancy, limited to what that shortlisting requires.
- Competent government authorities when required by law or by travel procedures.
- The technical providers the website runs on (hosting and email), only to operate the service.
- If you choose to send via WhatsApp, the message goes directly from your device to WhatsApp and is subject to WhatsApp's own privacy policy.

## Protection and retention
- Data is stored on the website server and is only accessible to authorised company staff through a password-protected control panel.
- Uploaded CVs are never publicly accessible.
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
