/**
 * نصوص الواجهة اللي ظاهرة للزوار (عناوين الأقسام، أسماء القوايم، الأزرار، عناوين الفورم...).
 * الافتراضي في lib/i18n.js، واللي بيتغيّر من لوحة التحكم (نصوص الواجهة) بيتحفظ في site.ui ويغلب الافتراضي.
 */
const { dict } = require('./i18n');

const GROUPS = [
  { title: 'القائمة والأزرار العامة', keys: ['nav_home', 'nav_about', 'nav_products', 'nav_services', 'nav_warehouses', 'nav_news', 'nav_gallery', 'nav_contact', 'nav_calc', 'nav_vendors', 'cta_quote', 'cta_products', 'cta_warehouses', 'cta_call', 'cta_wa', 'cta_profile', 'more', 'view_all', 'back_home', 'menu', 'lang_switch', 'quick_links', 'deliver_all'] },
  { title: 'الصفحة الرئيسية', keys: ['services', 'services_sub', 'featured_products', 'process', 'process_sub', 'why', 'home_duo_wh', 'home_duo_wh_sub', 'quote_cta_title', 'news', 'news_sub', 'gallery', 'gallery_sub', 'quotes', 'faq', 'prices_title', 'prices_sub', 'prices_unit', 'prices_price', 'prices_updated'] },
  { title: 'من نحن', keys: ['about_title', 'vision', 'mission', 'values', 'milestones', 'certificates'] },
  { title: 'المنتجات', keys: ['products', 'products_sub', 'all_cats', 'no_products', 'p_cat', 'p_pack', 'p_specs', 'p_about_prod', 'p_related', 'p_cta', 'p_cta_sub', 'p_datasheet', 'share', 'clear', 'add_to_list', 'added_to_list', 'qty', 'unit_ton', 'unit_bag', 'unit_bar'] },
  { title: 'المخازن والمقر', keys: ['warehouses', 'warehouses_sub', 'wh_everywhere', 'wh_everywhere_sub', 'hq', 'hq_sub', 'hq_open', 'wh_open', 'wh_more'] },
  { title: 'حاسبة الكميات', keys: ['calc_title', 'calc_sub', 'calc_steel', 'calc_cement', 'calc_dia', 'calc_len', 'calc_count', 'calc_total_weight', 'calc_per_bar', 'calc_bags', 'calc_tons', 'calc_note', 'calc_add_row', 'calc_add_list', 'calc_bag_kg'] },
  { title: 'قائمة الطلب (السلة)', keys: ['list_title', 'list_empty', 'list_items', 'list_remove', 'list_clear', 'f_items'] },
  { title: 'طلب عرض السعر والفورم', keys: ['quote_title', 'quote_sub', 'quote_side', 'f_quote_title', 'f_quote_tab', 'f_contact_tab', 'f_contact_title', 'f_name', 'f_company', 'f_phone', 'f_email', 'f_ptype', 'f_location', 'f_area', 'f_start', 'f_details', 'f_message', 'f_file_quote', 'f_file_hint', 'f_choose', 'f_other', 'send_wa', 'send_email', 'send_form', 'or', 'sending', 'sent_ok', 'sent_fail', 'sent_wa_note', 'required', 'too_many', 'consent_pre', 'consent_post', 'wa_hello', 'wa_quote', 'wa_contact'] },
  { title: 'الموردين والمصانع', keys: ['vendors_title', 'vendors_sub', 'vendor_steps', 'vendor_step1', 'vendor_step2', 'vendor_step3', 'vendor_docs', 'f_vendor_tab', 'f_vendor_title', 'f_vtype', 'f_specialty', 'f_grade', 'f_person', 'f_city', 'f_notes', 'f_file_vendor', 'wa_vendor'] },
  { title: 'التواصل والفوتر', keys: ['contact_title', 'contact_sub', 'phones', 'phones2', 'email', 'whatsapp', 'address', 'hours', 'team', 'rights', 'privacy', 'read_more', 'updated_on', 'no_news', 'no_gallery', 'photos'] },
  { title: 'المساعد (الشات)', keys: ['chat_title', 'chat_placeholder', 'chat_send', 'chat_welcome', 'chat_ai_note', 'chat_leave', 'chat_leave_name', 'chat_leave_phone', 'chat_leave_send', 'chat_leave_ok', 'chat_wa', 'chat_error', 'chat_chip1', 'chat_chip2', 'chat_chip3'] },
  { title: 'صفحة الخطأ 404', keys: ['notfound', 'notfound_sub'] }
];

function groups() {
  return GROUPS.map(g => ({ title: g.title, keys: g.keys.filter(k => dict.ar[k] !== undefined || dict.en[k] !== undefined) })).filter(g => g.keys.length);
}
const allKeys = () => groups().flatMap(g => g.keys);

function merged(lang, site) {
  const ui = (site && site.ui && site.ui[lang]) || {};
  const out = Object.assign({}, dict[lang]);
  Object.keys(ui).forEach(k => { if (typeof ui[k] === 'string' && ui[k].trim()) out[k] = ui[k]; });
  return out;
}

module.exports = { groups, allKeys, merged };
