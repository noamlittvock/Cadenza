import { Teacher, Room, CalendarEvent, GanttBlock, Classification, AppSettings, ListsState, PositionAssignment } from './types';

export const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#f97316', // orange
  '#64748b', // slate
];

// --- Migration helper: ensure old teacher data gets positionAssignments ---
export const migrateTeacher = (t: any): Teacher => {
  // If positionAssignments already exists and has data, just ensure positions is synced
  if (t.positionAssignments && t.positionAssignments.length > 0) {
    return {
      ...t,
      tags: t.tags || [],
      positions: t.positionAssignments.map((pa: PositionAssignment) => pa.positionName),
    };
  }

  // Legacy migration: create positionAssignments from old positions[] array
  const assignments: PositionAssignment[] = (t.positions || []).map((posName: string, idx: number) => ({
    id: `${t.id}_PA${idx}`,
    positionName: posName,
    category: 'Individual Lesson',  // Safe default
    rateType: 'HOURLY' as const,
    rateValue: 0,                   // Unknown until user sets it
  }));

  return {
    ...t,
    tags: t.tags || [],
    positionAssignments: assignments,
    positions: t.positions || [],
  };
};

export const INITIAL_SETTINGS: AppSettings = {
  language: 'en-US',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '12h',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  defaultEventDuration: 60,
  weekNumberDisplay: 'none'
};

export const INITIAL_LISTS: ListsState = {
  positions: ['Piano Instructor', 'Voice Coach', 'Violin Teacher', 'Choir Director', 'Theory Teacher'],
  tags: ['Piano Dept', 'Strings Dept', 'Vocal Dept', 'Senior Staff', 'Junior Staff'],
  classifications: Object.values(Classification) as string[]
};

export const HEBREW_CALENDAR_OPTIONS = {
  // Config for Hebcal if needed
};

export const TRANSLATIONS: Record<string, Record<string, string>> = {
  'en-US': {
    'app.title': 'Music Center Calendar',
    'app.subtitle': 'Management System',
    'nav.calendar': 'Smart Calendar',
    'settings.general': 'General Settings',
    'settings.integrations': 'Integrations',
    'settings.dev_tools': 'Developer Tools',
    'settings.generate_data': 'Generate Test Data',
    'settings.generate_data_desc': 'Populate the calendar with 20 teachers and random events.',
    'settings.generate_btn': 'Generate Data',
    'settings.unsaved': 'You have unsaved changes',
    'alert.confirm_generate': 'This will overwrite existing teachers and events. Continue?',
    'alert.data_generated': 'Test data generated!',
    'alert.delete_event': 'Are you sure you want to delete this event?',
    'alert.delete_gantt': 'Delete this Gantt block? This may affect blackouts.',
    'alert.end_time_error': 'End time must be after start time',
    'label.default_lang': 'Default Language',
    'label.system_default': 'System Default',
    'label.coming_soon': 'Coming Soon',
    'nav.gantt': 'Gantt & Blackout',
    'nav.teachers': 'Teachers',
    'nav.rooms': 'Rooms',
    'nav.lists': 'Manage Lists',
    'nav.manage': 'Manage',
    'nav.financial': 'Financial Dashboard',
    'nav.settings': 'Settings',
    'nav.power_tools': 'Power Tools',
    'ops': 'Operations',
    'admin': 'Administration',
    'analytics': 'Analytics',
    'today': 'TODAY',
    'btn.add': 'Add',
    'btn.create': 'Create',
    'btn.save': 'Save',
    'btn.cancel': 'Cancel',
    'btn.delete': 'Delete',
    'btn.close': 'Close',
    'mode.day': 'DAY',
    'mode.week': 'WEEK',
    'mode.month': 'MONTH',
    'filter.teacher': 'Teacher: All',
    'filter.room': 'Room: All',
    'filter.type': 'Type: All',
    'filter.show_canceled': 'Show Canceled',
    'filter.show_blackouts': 'Show Blackouts',
    'modal.add_event': 'Add Event',
    'modal.edit_event': 'Edit Event',
    'label.name': 'Event Name',
    'label.desc': 'Description',
    'label.teacher': 'Teacher',
    'label.room': 'Room',
    'label.type': 'Type',
    'label.start': 'Start',
    'label.end': 'End',
    'label.recurrence': 'Recurrence',
    'label.timezone': 'Time Zone',
    'label.date_format': 'Date Format',
    'label.time_format': 'Time Format',
    'label.calendar_defaults': 'Calendar Defaults',
    'label.default_duration': 'Default Event Duration (minutes)',
    'label.week_numbers': 'Week Number Display',
    'nav.section.localization': 'Localization',
    'nav.section.date_time': 'Date & Time',
    'nav.section.analytics': 'Analytics',
    'nav.section.operations': 'Operations',
    'nav.section.admin': 'Administration',
    'recurrence.none': 'Does not repeat',
    'recurrence.daily': 'Daily',
    'recurrence.weekly': 'Weekly',
    'recurrence.monthly': 'Monthly',
    'recurrence.yearly': 'Yearly',
    'recurrence.until': 'Until',
    'role.admin': 'Admin',
    'role.viewer': 'Viewer',
    'pt.bulk_delete': 'Bulk Delete',
    'pt.date_range': 'Date Range',
    'pt.criteria': 'Filter Criteria',
    'pt.preview': 'Preview',
    'pt.delete_all': 'Delete All Matches',
    'pt.confirm_delete': 'Please confirm deletion of {count} events.',
    'pt.success': 'Successfully deleted {count} events.',
    'pt.no_matches': 'No matching events found.',
  },
  'he-IL': {
    'app.title': 'מרכז המוזיקה אלפרט',
    'app.subtitle': 'מערכת ניהול',
    'nav.calendar': 'לוח שנה חכם',
    'settings.general': 'הגדרות כלליות',
    'settings.integrations': 'אינטגרציות',
    'settings.dev_tools': 'כלי מפתח',
    'settings.generate_data': 'יצירת נתוני בדיקה',
    'settings.generate_data_desc': 'אכלוס הלוח עם 20 מורים ואירועים אקראיים.',
    'settings.generate_btn': 'צור נתונים',
    'settings.unsaved': 'ישנם שינויים שלא נשמרו',
    'alert.confirm_generate': 'פעולה זו תדרוס מורים ואירועים קיימים. להמשיך?',
    'alert.data_generated': 'נתונים נוצרו בהצלחה!',
    'alert.delete_event': 'האם למחוק את האירוע?',
    'alert.delete_gantt': 'למחוק בלוק זה? הפעולה עשויה להשפיע על חסימות.',
    'alert.end_time_error': 'שעת הסיום חייבת להיות אחרי שעת ההתחלה',
    'label.default_lang': 'שפת מערכת',
    'label.system_default': 'ברירת מחדל של המערכת',
    'label.coming_soon': 'בקרוב',
    'nav.gantt': 'גאנט וחסימות',
    'nav.teachers': 'מורים',
    'nav.rooms': 'חדרים',
    'nav.lists': 'ניהול רשימות',
    'nav.manage': 'ניהול',
    'nav.financial': 'דשבורד פיננסי',
    'nav.settings': 'הגדרות',
    'nav.power_tools': 'כלים מתקדמים', // Added
    'ops': 'תפעול',
    'admin': 'ניהול',
    'analytics': 'אנליטיקה',
    'today': 'היום',
    'btn.add': 'הוסף',
    'btn.create': 'צור', // Added
    'btn.save': 'שמור',
    'btn.cancel': 'ביטול',
    'btn.delete': 'מחק',
    'btn.close': 'סגור', // Added help
    'mode.day': 'יום',
    'mode.week': 'שבוע',
    'mode.month': 'חודש',
    'filter.teacher': 'מורה: הכל',
    'filter.room': 'חדר: הכל',
    'filter.type': 'סוג: הכל',
    'filter.show_canceled': 'הצג אירועים מבוטלים', // Added
    'filter.show_blackouts': 'הצג חסימות', // Added
    'modal.add_event': 'הוסף אירוע',
    'modal.edit_event': 'ערוך אירוע',
    'label.name': 'שם האירוע',
    'label.desc': 'תיאור',
    'label.teacher': 'מורה',
    'label.room': 'חדר',
    'label.type': 'סוג',
    'label.start': 'התחלה',
    'label.end': 'סיום',
    'label.recurrence': 'חזרתיות',
    'label.timezone': 'אזור זמן',
    'label.date_format': 'פורמט תאריך',
    'label.time_format': 'פורמט שעה',
    'label.calendar_defaults': 'הגדרות יומן ברירת מחדל',
    'label.default_duration': 'משך אירוע ברירת מחדל (דקות)',
    'label.week_numbers': 'תצוגת מספרי שבועות',
    'nav.section.localization': 'לוקליזציה',
    'nav.section.date_time': 'תאריך ושעה',
    'nav.section.analytics': 'אנליטיקה',
    'nav.section.operations': 'תפעול',
    'nav.section.admin': 'ניהול',
    'recurrence.none': 'ללא חזרה',
    'recurrence.daily': 'יומי',
    'recurrence.weekly': 'שבועי',
    'recurrence.monthly': 'חודשי',
    'recurrence.yearly': 'שנתי',
    'recurrence.until': 'עד תאריך',
    'role.admin': 'מנהל',
    'role.viewer': 'צופה',
    'pt.bulk_delete': 'מחיקה מרוכזת', // Power Tools
    'pt.date_range': 'טווח תאריכים',
    'pt.criteria': 'קריטריונים לסינון',
    'pt.preview': 'תצוגה מקדימה',
    'pt.delete_all': 'מחק הכל',
    'pt.confirm_delete': 'נא לאשר מחיקה של {count} אירועים.',
    'pt.success': 'נמחקו {count} אירועים בהצלחה.',
    'pt.no_matches': 'לא נמצאו אירועים מתאימים.',
  }
};

export const INITIAL_TEACHERS: Teacher[] = [
  {
    id: 'T1', fullName: 'John Smith',
    positions: ['Piano Instructor'],
    positionAssignments: [
      { id: 'T1_PA0', positionName: 'Piano Instructor', category: 'Individual Lesson', rateType: 'HOURLY', rateValue: 150 },
    ],
    tags: ['Piano Dept', 'Senior Staff'], phone: '555-0101', email: 'john@music.com', color: '#3b82f6'
  },
  {
    id: 'T2', fullName: 'Sarah Jones',
    positions: ['Voice Coach', 'Choir Director'],
    positionAssignments: [
      { id: 'T2_PA0', positionName: 'Voice Coach', category: 'Individual Lesson', rateType: 'HOURLY', rateValue: 120 },
      { id: 'T2_PA1', positionName: 'Choir Director', category: 'Group Lesson', rateType: 'GLOBAL_MONTHLY', rateValue: 5000 },
    ],
    tags: ['Vocal Dept'], phone: '555-0102', email: 'sarah@music.com', color: '#ef4444'
  },
  {
    id: 'T3', fullName: 'Michael Brown',
    positions: ['Violin Teacher'],
    positionAssignments: [
      { id: 'T3_PA0', positionName: 'Violin Teacher', category: 'Individual Lesson', rateType: 'HOURLY', rateValue: 130 },
    ],
    tags: ['Strings Dept'], phone: '555-0103', email: 'mike@music.com', color: '#10b981'
  },
];

export const INITIAL_ROOMS: Room[] = [
  { id: 'R1', name: 'Studio A', itinerary: 'Grand Piano, roughly 20 person capacity.' },
  { id: 'R2', name: 'Studio B', itinerary: 'Upright Piano, soundproofed.' },
  { id: 'R3', name: 'Practice Room 1', itinerary: 'Small room for individual practice.' },
];

// Helper to generate some initial events relative to "today"
const today = new Date();
const getIso = (daysOffset: number, hour: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

export const INITIAL_EVENTS: CalendarEvent[] = [
  {
    id: 'E1',
    name: 'Piano Lesson - Alice',
    description: 'Weekly lesson',
    teacherId: 'T1',
    roomId: 'R1',
    positionId: 'T1_PA0',
    classification: Classification.INDIVIDUAL,
    start: getIso(0, 10),
    end: getIso(0, 11),
    isCanceled: false,
    isHidden: false,
  },
  {
    id: 'E2',
    name: 'Voice Coaching - Bob',
    description: 'Prep for recital',
    teacherId: 'T2',
    roomId: 'R2',
    positionId: 'T2_PA0',
    classification: Classification.INDIVIDUAL,
    start: getIso(0, 10), // INTENTIONAL CONFLICT with time, different room
    end: getIso(0, 11),
    isCanceled: false,
    isHidden: false,
  },
  {
    id: 'E3',
    name: 'Group Theory',
    description: 'Beginner theory',
    teacherId: 'T1', // INTENTIONAL CONFLICT: T1 is also in E1 at this time
    roomId: 'R3',
    positionId: 'T1_PA0',
    classification: Classification.GROUP,
    start: getIso(0, 10),
    end: getIso(0, 11),
    isCanceled: false,
    isHidden: false,
  }
];

export const INITIAL_GANTT: GanttBlock[] = [
  {
    id: 'G1',
    title: 'Winter Semester',
    startDate: new Date(today.getFullYear(), 0, 1).toISOString(),
    endDate: new Date(today.getFullYear(), 3, 30).toISOString(),
    color: '#3b82f6',
    isBlackout: false,
  }
];

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const formatDateForInput = (isoString: string) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().slice(0, 16);
};

export const formatDate = (date: Date, format: string) => {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();

  switch (format) {
    case 'DD/MM/YYYY': return `${d}/${m}/${y}`;
    case 'YYYY-MM-DD': return `${y}-${m}-${d}`;
    default: return `${m}/${d}/${y}`; // MM/DD/YYYY
  }
};
