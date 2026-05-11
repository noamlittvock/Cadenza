const fs = require('fs');

const data = [
    // --- Chart Builder / Overlays ---
    { key: 'chart_builder_bar', context: 'Chart type', en: 'Bar', he_nat: 'עמודות', he_form: 'תרשים עמודות', he_con: 'עמודות', he_col: 'עמודות' },
    { key: 'chart_builder_stacked', context: 'Chart type', en: 'Stacked', he_nat: 'מוערם', he_form: 'תרשים מוערם', he_con: 'מוערם', he_col: 'מוערם' },
    { key: 'chart_builder_line', context: 'Chart type', en: 'Line', he_nat: 'קו', he_form: 'תרשים רציף', he_con: 'קוות', he_col: 'קווים' },
    { key: 'chart_builder_pie', context: 'Chart type', en: 'Pie', he_nat: 'עוגה', he_form: 'תרשים עוגה', he_con: 'עוגה', he_col: 'פאי' },
    { key: 'chart_builder_table', context: 'Chart type', en: 'Table', he_nat: 'טבלה', he_form: 'תצוגה טבלאית', he_con: 'טבלה', he_col: 'טבלה' },

    { key: 'chart_calc_sum', context: 'Calculation type', en: 'Sum', he_nat: 'סכום', he_form: 'סכום', he_con: 'סך', he_col: 'סך הכל' },
    { key: 'chart_calc_avg', context: 'Calculation type', en: 'Average', he_nat: 'ממוצע', he_form: 'ממוצע', he_con: 'ממוצע', he_col: 'ממוצע' },
    { key: 'chart_calc_count', context: 'Calculation type', en: 'Count', he_nat: 'ספירה', he_form: 'כמות רשומות', he_con: 'כמות', he_col: 'כמה יש' },
    { key: 'chart_calc_min', context: 'Calculation type', en: 'Min', he_nat: 'מינימום', he_form: 'ערך מינימלי', he_con: 'מינ\'', he_col: 'הכי קצת' },
    { key: 'chart_calc_max', context: 'Calculation type', en: 'Max', he_nat: 'מקסימום', he_form: 'ערך מקסימלי', he_con: 'מקס\'', he_col: 'הכי הרבה' },

    { key: 'chart_time_today', context: 'Timeframe', en: 'Today', he_nat: 'היום', he_form: 'היום הנוכחי', he_con: 'היום', he_col: 'היום' },
    { key: 'chart_time_curr_week', context: 'Timeframe', en: 'Current Week', he_nat: 'שבוע נוכחי', he_form: 'שבוע קלנדרי נוכחי', he_con: 'השבוע', he_col: 'השבוע הזה' },
    { key: 'chart_time_curr_month', context: 'Timeframe', en: 'Current Month', he_nat: 'חודש נוכחי', he_form: 'חודש קלנדרי נוכחי', he_con: 'החודש', he_col: 'החודש הזה' },
    { key: 'chart_time_custom', context: 'Timeframe', en: 'Custom Range', he_nat: 'טווח מותאם אישית', he_form: 'תקופת בחירה', he_con: 'מותאם אישית', he_col: 'טווח שלי' },
    { key: 'chart_time_spec_day', context: 'Timeframe', en: 'Specific Day', he_nat: 'יום מסוים', he_form: 'תאריך ספציפי', he_con: 'יום מסוים', he_col: 'יום ספציפי' },
    { key: 'chart_time_spec_week', context: 'Timeframe', en: 'Specific Week', he_nat: 'שבוע מסוים', he_form: 'שבוע ספציפי', he_con: 'שבוע מסוים', he_col: 'שבוע ספציפי' },
    { key: 'chart_time_spec_month', context: 'Timeframe', en: 'Specific Month', he_nat: 'חודש מסוים', he_form: 'חודש ספציפי', he_con: 'חודש מסוים', he_col: 'חודש ספציפי' },

    { key: 'chart_no_options', context: 'Empty state', en: 'No options available', he_nat: 'אין אפשרויות זמינות', he_form: 'לא נמצאו ערכים מתאימים', he_con: 'אין אפשרויות', he_col: 'אין כלום' },
    { key: 'chart_select_period', context: 'Placeholder', en: 'Select a period', he_nat: 'בחר תקופה', he_form: 'נא לבחור תקופת ייחוס', he_con: 'בחר תקופה', he_col: 'תבחרו תקופה' },
    { key: 'chart_edit_title', context: 'Modal title', en: 'Edit Chart', he_nat: 'ערוך תרשים', he_form: 'עריכת מאפייני תרשים', he_con: 'ערוך גרף', he_col: 'לערוך גרף' },
    { key: 'chart_create_title', context: 'Modal title', en: 'Create Custom Chart', he_nat: 'צור תרשים מותאם אישית', he_form: 'הקמת תרשים ניתוח נתונים', he_con: 'גרף חדש', he_col: 'להכין גרף' },
    { key: 'chart_inp_title', context: 'Input label', en: 'Chart Title', he_nat: 'כותרת התרשים', he_form: 'הגדרת שם התרשים', he_con: 'כותרת', he_col: 'שם לגרף' },

    { key: 'chart_desc_grouping', context: 'Helper text', en: 'Classify data by category (timeframes are controlled separately below)', he_nat: 'סווג נתונים לפי קטגוריה (תקופות זמן מנוהלות בנפרד למטה)', he_form: 'קביעת פרמטרים לחיתוך מידע (חתכי זמן נקבעים בנפרד)', he_con: 'סיווג נתונים (תקופות יוגדרו למטה)', he_col: 'לפי מה לחלק את הנתונים?' },
    { key: 'chart_desc_time', context: 'Helper text', en: 'Select the time period for analysis (independent of grouping)', he_nat: 'בחר תקופת זמן לניתוח (ללא קשר לסיווג)', he_form: 'קביעת מסגרת הזמן לניתוח הנתונים', he_con: 'בחר תקופה', he_col: 'על איזו תקופה להסתכל?' },
    { key: 'chart_comp_active', context: 'Helper text', en: 'Comparison Mode is active — add periods to compare against the primary timeframe', he_nat: 'מצב השוואה פעיל — הוסף תקופות להשוואה מול תקופת הזמן הראשית', he_form: 'ממשק השוואתי הופעל: נא להגדיר תקופות דיווח ביחס למדד העדכני', he_con: 'השוואה פעילה – הוסף תקופות', he_col: 'אנחנו במצב השוואה - תוסיפו עוד תקופות להשוות' },
    { key: 'chart_comp_inactive', context: 'Helper text', en: 'Compare the same filters against different periods of the same timeframe type', he_nat: 'השווה את אותם מסננים כנגד תקופות שונות מאותו סוג', he_form: 'השוואת מדדי החתך ביחס לתקופות קודמות בעלות מאפיינים זהים', he_con: 'השווה תקופות שונות', he_col: 'אפשר להשוות את אותם דברים לתקופות אחרות' },

    { key: 'chart_filter_mode', context: 'Label', en: 'Filter Mode', he_nat: 'מצב סינון', he_form: 'ניתוב מנגנון סינון', he_con: 'מצב סינון', he_col: 'סוג פילטר' },
    { key: 'chart_mode_live', context: 'Option', en: 'Live', he_nat: 'חי', he_form: 'מעקב זמן אמת', he_con: 'חי', he_col: 'זז איתי' },
    { key: 'chart_mode_live_desc', context: 'Desc', en: 'Reacts to dashboard filters', he_nat: 'מגיב לסינוני הדשבורד', he_form: 'משתנה בהתאם להגדרות התצוגה בעמוד הרלוונטי', he_con: 'מושפע מהדשבורד', he_col: 'משתנה כשמשחקים עם הפילטרים בחוץ' },
    { key: 'chart_mode_snap', context: 'Option', en: 'Snapshot', he_nat: 'תמונת מצב', he_form: 'פריז (הקפאת נתונים)', he_con: 'קבוע', he_col: 'נעול' },
    { key: 'chart_mode_snap_desc', context: 'Desc', en: 'Freezes filters at save time', he_nat: 'מקפיא סינונים בשעת השמירה', he_form: 'הקפאת נתוני סינון בהתאם למועד יצירת התרשים', he_con: 'סינון קבוע', he_col: 'נשאר קבוע כמו עכשיו' },

    { key: 'chart_data_total', context: 'Table footer', en: 'Total', he_nat: 'סך הכל', he_form: 'סך הכל (סה"כ)', he_con: 'סה"כ', he_col: 'בסך הכל' },

    // --- Calendar Specifics ---
    { key: 'cal_event_name_req', context: 'Input label', en: 'Event Name *', he_nat: 'שם האירוע *', he_form: 'שם האירוע (שדה חובה)', he_con: 'שם אירוע *', he_col: 'שם אירוע (חובה)' },
    { key: 'cal_event_cat_req', context: 'Input label', en: 'Category *', he_nat: 'קטגוריה *', he_form: 'שיוך קטגוריאלי (שדה חובה)', he_con: 'קטגוריה *', he_col: 'סוג (חובה)' },
    { key: 'cal_cat_teacher_lessons', context: 'OptGroup', en: 'Teacher Lessons', he_nat: 'שיעורי מורים', he_form: 'מערך שיעורי סגל', he_con: 'שיעורים', he_col: 'שיעורים רגילים' },
    { key: 'cal_cat_indiv_lesson', context: 'Option', en: 'Individual Lesson', he_nat: 'שיעור פרטני', he_form: 'הוראה פרטנית במרכז', he_con: 'פרטני', he_col: 'שיעור פרטי' },
    { key: 'cal_cat_group_lesson', context: 'Option', en: 'Group Lesson', he_nat: 'שיעור קבוצתי', he_form: 'פעילות הרכב/קבוצה', he_con: 'קבוצתי', he_col: 'קבוצה' },
    { key: 'cal_cat_general_events', context: 'OptGroup', en: 'General Events', he_nat: 'אירועים כלליים', he_form: 'רשימת סיווגים כללים (פעילות חיצונית/מנהלה)', he_con: 'כללי', he_col: 'שונות (לא שיעורים)' },

    { key: 'cal_recur_biweekly', context: 'Option', en: 'Bi-Weekly', he_nat: 'דו-שבועי', he_form: 'מופע פעם בשבועיים', he_con: 'דו-שבועי', he_col: 'כל שבועיים' },
    { key: 'cal_recur_ends_after', context: 'Input label', en: 'Ends after', he_nat: 'מסתיים לאחר', he_form: 'פקיעת תוקף המחזוריות (לאחר)', he_con: 'מסתיים אחרי', he_col: 'נגמר אחרי' },
    { key: 'cal_recur_ends_on', context: 'Input label', en: 'Ends on', he_nat: 'מסתיים בתאריך', he_form: 'מועד תפוגת מחזוריות (תאריך ספציפי)', he_con: 'מסתיים ב-', he_col: 'עד מתי' },
    { key: 'cal_recur_occurrences', context: 'Suffix', en: 'occurrences', he_nat: 'מופעים', he_form: 'מופעים חזוריים', he_con: 'פעמים', he_col: 'פעמים' },

    { key: 'cal_btn_save_series', context: 'Button text', en: 'Save & Update Series', he_nat: 'שמור ועדכן סדרה', he_form: 'שמירת שינויים והחלה על סדרת מופעים שלמה', he_con: 'עדכן סדרה', he_col: 'תשמור על הכל' },
    { key: 'cal_btn_delete_series', context: 'Button text', en: 'Delete Series', he_nat: 'מחק סדרה', he_form: 'מחיקה גורפת לסדרת המופעים', he_con: 'מחק סדרה', he_col: 'תמחק את כל הסדרה' },

    { key: 'cal_err_sync', context: 'Alert dialog', en: 'Failed to sync to Google Calendar', he_nat: 'סנכרון מול גוגל יומן נכשל', he_form: 'שגיאת מערכת: ניסיון ההתממשקות מול יומן Google לא צלח', he_con: 'שגיאת סנכרון גוגל', he_col: 'לא הצליח לשמור בגוגל' },
    { key: 'cal_err_time', context: 'Alert dialog', en: 'End time must be after start time', he_nat: 'זמן הסיום חייב להיות אחרי זמן ההתחלה', he_form: 'ערך לא תקין: מועד הסיום נדרש להיות מאוחר למועד ההתחלה', he_con: 'סיום לפני התחלה', he_col: 'הסיום לא הגיוני לעומת ההתחלה' }
];

fs.writeFileSync('data_part5.json', JSON.stringify(data, null, 2));
console.log('Written data_part5.json');
