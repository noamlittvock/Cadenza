export type ForteTreeDomain =
  | 'command'
  | 'people'
  | 'scheduling'
  | 'learning'
  | 'finance'
  | 'resources'
  | 'platform'
  | 'agent';

export type ForteTreeStatus = 'native' | 'embedded' | 'planned' | 'gap' | 'implemented';

export type ForteTreePriority = 'p0' | 'p1' | 'p2';

export interface ForteSourceSignal {
  id: string;
  source: 'forte-site-meta' | 'forte-bundle-text' | 'cadenza-existing-shape';
  summary: string;
  observedModules: string[];
}

export interface ForteIndustryStandard {
  id: string;
  label: string;
  requirement: string;
  agentReadableCheck: string;
}

export interface ForteFeatureNode {
  id: string;
  parentId?: string;
  domain: ForteTreeDomain;
  status: ForteTreeStatus;
  priority: ForteTreePriority;
  label: string;
  labelHe: string;
  shape: string;
  industryStandard: string;
  cadenzaFit: string;
  nextStep: string;
  dataEntities: string[];
  deterministicQueries: string[];
  embeddingText: string;
  sourceSignalIds: string[];
  agentReadable: {
    stableId: string;
    canonicalFields: string[];
    readableJoins: string[];
    auditFields: string[];
  };
}

export interface ForteReadableDataContract {
  contractId: string;
  version: string;
  principles: string[];
  deterministicQueryFamilies: Array<{
    id: string;
    description: string;
    inputs: string[];
    outputs: string[];
  }>;
}

export const FORTE_SOURCE_EXTRACTION = {
  sourceUrl: 'https://forte-cons.com/',
  extractedAt: '2026-06-16',
  summary:
    'Forte presents itself as a Hebrew, web-based conservatory and culture-center management system. Its public metadata and bundled app text point to a broad operational platform: admissions, students, families, teachers, schedules, rooms, ensembles, theory, programs, exams, certificates, concert programs, instruments, payroll, payments, agreements, reporting, onboarding, settings, and global administration.',
  signals: [
    {
      id: 'seo-core',
      source: 'forte-site-meta',
      summary:
        'The page metadata frames Forte as one place for students, teachers, scheduling, payments, ensembles, and reports.',
      observedModules: ['students', 'teachers', 'schedule', 'payments', 'ensembles', 'reports'],
    },
    {
      id: 'app-nav-hebrew',
      source: 'forte-bundle-text',
      summary:
        'The bundled Hebrew navigation text exposes app modules beyond the landing page: dashboard, family files, salaries, schedule, rooms, ensembles, theory, school programs, calendar, exams, certificates, concert programs, lesson details, instrument inventory, teacher evaluation, payments, agreements, year rollover, setup wizard, conservatory settings, conservatories, and global user management.',
      observedModules: [
        'dashboard',
        'students',
        'family-files',
        'teachers',
        'salaries',
        'schedule',
        'rooms',
        'ensembles',
        'theory',
        'school-program',
        'calendar',
        'exams',
        'certificates',
        'concert-programs',
        'lesson-details',
        'instrument-inventory',
        'teacher-evaluation',
        'payments',
        'agreements',
        'year-rollover',
        'setup-wizard',
        'settings',
        'multi-conservatory',
        'global-users',
      ],
    },
    {
      id: 'integration-copy',
      source: 'forte-bundle-text',
      summary:
        'The bundled text references online registration, payment tracking, real-time reports, and direct connection to the conservatory website.',
      observedModules: ['online-registration', 'payment-tracking', 'reports', 'website-embed'],
    },
    {
      id: 'cadenza-native-spine',
      source: 'cadenza-existing-shape',
      summary:
        'Cadenza is already calendar-first and data-backed: Activity Hub, staff, students, rooms, events, admin inbox, hours reporting, calendar subscriptions, command palette, and deterministic bot query layers exist in the codebase or specs.',
      observedModules: [
        'calendar',
        'activities',
        'staff',
        'students',
        'rooms',
        'admin-inbox',
        'hours-reports',
        'subscriptions',
        'deterministic-bot',
      ],
    },
  ] satisfies ForteSourceSignal[],
} as const;

export const FORTE_INDUSTRY_STANDARDS: ForteIndustryStandard[] = [
  {
    id: 'source-of-truth',
    label: 'Calendar source of truth',
    requirement:
      'A viable conservatory system must derive lessons, attendance, room usage, payroll, student history, and reports from canonical event records.',
    agentReadableCheck:
      'Events expose stable IDs, orgId, start/end, activity, participants, room, status, recurrence, and audit metadata.',
  },
  {
    id: 'people-lifecycle',
    label: 'Student, family, and staff lifecycle',
    requirement:
      'Students, guardians, families, teachers, roles, assignments, documents, and archive state must be first-class, not spreadsheet notes.',
    agentReadableCheck:
      'People records expose canonical relationships and effective-dated joins to activities, enrollments, roles, and documents.',
  },
  {
    id: 'finance-reconciliation',
    label: 'Finance reconciliation',
    requirement:
      'Payroll, payments, charges, agreements, and reports must reconcile against scheduled/completed work and enrollment/payment state.',
    agentReadableCheck:
      'Finance queries return traceable rows with source entity IDs rather than computed-only totals.',
  },
  {
    id: 'pedagogical-record',
    label: 'Pedagogical record',
    requirement:
      'Lessons, attendance, exams, certificates, recitals, evaluations, notes, and report cards must be longitudinal and exportable.',
    agentReadableCheck:
      'Academic artifacts expose studentId, staffMemberId, activityId, period, score/status, and document links.',
  },
  {
    id: 'public-intake',
    label: 'Public intake and embedding',
    requirement:
      'Admissions and public forms should embed into the conservatory site while writing structured reviewable records into the admin system.',
    agentReadableCheck:
      'Public submissions become intake records with source, consent, status, linked student/family, and review trail.',
  },
  {
    id: 'operations-resilience',
    label: 'Operational resilience',
    requirement:
      'Scheduling must handle recurrence, holidays, year rollover, room conflicts, absences, imports, exports, permissions, RTL, and auditability.',
    agentReadableCheck:
      'Deterministic queries can answer conflicts, availability, rollover impact, permissions, and import lineage without UI scraping.',
  },
];
export const FORTE_READABLE_DATA_CONTRACT: ForteReadableDataContract = {
  contractId: 'cadenza.forte-tree.readable-data',
  version: '2026-06-16',
  principles: [
    'Every feature node has a stable ID and explicit source signals.',
    'Every operational record should carry orgId, status, timestamps, and archive semantics.',
    'Agent answers should flow through deterministic query functions before any natural-language wrapper.',
    'Embedding text is generated from structured node fields, not scraped from rendered UI.',
    'Human-facing Hebrew/English labels are separate from canonical IDs.',
  ],
  deterministicQueryFamilies: [
    {
      id: 'feature-tree.lookup',
      description: 'Find a feature by stable ID or parent-child relationship.',
      inputs: ['id', 'parentId'],
      outputs: ['ForteFeatureNode'],
    },
    {
      id: 'feature-tree.coverage',
      description: 'List native, embedded, planned, or gap modules by domain and priority.',
      inputs: ['domain', 'status', 'priority'],
      outputs: ['ForteFeatureNode[]', 'coverageCounts'],
    },
    {
      id: 'feature-tree.embedding-records',
      description: 'Produce compact, structured text chunks for retrieval or agent context.',
      inputs: ['domain?', 'status?', 'agentReadableOnly?'],
      outputs: ['EmbeddingRecord[]'],
    },
    {
      id: 'feature-tree.industry-gap',
      description: 'Return missing capabilities that are mandatory for a full conservatory management standard.',
      inputs: ['minimumPriority'],
      outputs: ['ForteFeatureNode[]'],
    },
  ],
};

export const FORTE_FEATURE_TREE: ForteFeatureNode[] = [
  {
    id: 'operations-command-center',
    domain: 'command',
    status: 'planned',
    priority: 'p1',
    label: 'Operations dashboard',
    labelHe: 'דשבורד תפעולי',
    shape:
      'A dense command view for today, unresolved conflicts, registrations, payment work, pending reports, and system health.',
    industryStandard:
      'Industry systems need a daily control surface that summarizes work without replacing the calendar.',
    cadenzaFit:
      'Cadenza has Admin Inbox, calendar, settings, and scenario banners; this should be a thin aggregation view, not a marketing dashboard.',
    nextStep:
      'Add dashboard rows fed by existing deterministic counters: conflicts, upcoming events, open inbox items, pending hours reports, and intake queue.',
    dataEntities: ['CalendarEvent', 'AdminInboxItem', 'HoursReport', 'ImportSession'],
    deterministicQueries: ['countOpenConflicts', 'listTodayEvents', 'countPendingHoursReports'],
    embeddingText:
      'Operations dashboard: daily command surface for conflicts, today schedule, pending forms, reports, registrations, and health. In Cadenza it should aggregate existing records without becoming the source of truth.',
    sourceSignalIds: ['app-nav-hebrew', 'cadenza-native-spine'],
    agentReadable: {
      stableId: 'operations-command-center',
      canonicalFields: ['orgId', 'date', 'statusCounts', 'sourceCollection', 'sourceIds'],
      readableJoins: ['events.id', 'adminInboxItems.relatedEntityIds', 'hoursReports.staffMemberId'],
      auditFields: ['generatedAt', 'sourceUpdatedAt'],
    },
  },
  {
    id: 'public-registration-intake',
    domain: 'people',
    status: 'gap',
    priority: 'p0',
    label: 'Online registration intake',
    labelHe: 'רישום אונליין',
    shape:
      'Public registration forms embedded in the conservatory website, producing reviewable intake records and linked student/family profiles.',
    industryStandard:
      'Admissions must be structured, consent-aware, deduplicated, and reviewable before creating live student/enrollment records.',
    cadenzaFit:
      'Cadenza can reuse tokenized public-page patterns from hours reporting and CSV import review semantics.',
    nextStep:
      'Create an intake collection with statuses, guardian consent, desired activities, website source, duplicate suggestions, and approve-to-student action.',
    dataEntities: ['RegistrationIntake', 'Student', 'Guardian', 'EnrollmentV2', 'ImportSession'],
    deterministicQueries: ['listPendingIntake', 'suggestStudentDuplicates', 'approveIntakeRecord'],
    embeddingText:
      'Online registration intake: public embedded form writes structured applications into Cadenza for review, duplicate resolution, and conversion into student, family, and enrollment records.',
    sourceSignalIds: ['integration-copy', 'seo-core'],
    agentReadable: {
      stableId: 'public-registration-intake',
      canonicalFields: ['id', 'orgId', 'source', 'status', 'studentDraft', 'guardianDrafts', 'requestedPrograms', 'consent'],
      readableJoins: ['students.id', 'enrollments.studentId', 'activities.id'],
      auditFields: ['createdAt', 'reviewedAt', 'reviewedBy', 'approvedAt'],
    },
  },
  {
    id: 'student-family-files',
    domain: 'people',
    status: 'embedded',
    priority: 'p0',
    label: 'Students and family files',
    labelHe: 'תלמידים ותיקי משפחה',
    shape:
      'Student profiles, guardians, family grouping, contact details, documents, assignments, notes, and archive state.',
    industryStandard:
      'Student and guardian data must support minors, family billing context, enrollment history, and document retention.',
    cadenzaFit:
      'Cadenza has Student and StudentV2 types, guardian fields, documents, filters, and dev data; the missing piece is a first-class minimal Student/Family surface.',
    nextStep:
      'Expose a Students tab or route that reads existing student collections and treats family as a lightweight grouping layer.',
    dataEntities: ['Student', 'StudentV2', 'Guardian', 'DocumentEntry', 'EnrollmentV2'],
    deterministicQueries: ['findStudentByName', 'listStudentsByGuardian', 'listStudentEnrollments'],
    embeddingText:
      'Students and family files: canonical student records with guardians, documents, assignments, notes, minor grade fields, and enrollment history.',
    sourceSignalIds: ['app-nav-hebrew', 'cadenza-native-spine'],
    agentReadable: {
      stableId: 'student-family-files',
      canonicalFields: ['id', 'orgId', 'fullName', 'dateOfBirth', 'guardians', 'tags', 'profileStatus'],
      readableJoins: ['enrollments.studentId', 'events.activityId', 'documents.filePath'],
      auditFields: ['createdAt', 'updatedAt', 'archivedAt'],
    },
  },
  {
    id: 'staff-teacher-management',
    domain: 'people',
    status: 'native',
    priority: 'p0',
    label: 'Staff and teachers',
    labelHe: 'מורים וצוות',
    shape:
      'Profiles for teaching and non-teaching staff, roles, assignments, credentials, documents, calendar sync, and effective dates.',
    industryStandard:
      'Teacher management must join identity, permission, teaching scope, rates, availability, and documents.',
    cadenzaFit:
      'Cadenza StaffMemberManager and v2 staff collections already align with the standard.',
    nextStep:
      'Keep tightening staff joins through eventParticipants and orgRoles so payroll and permissions do not depend on legacy teacherId.',
    dataEntities: ['Teacher', 'StaffMemberV2', 'TeachingAssignmentV2', 'OrgRoleV2', 'EventParticipant'],
    deterministicQueries: ['resolveStaffByName', 'listTeachingAssignments', 'whoTeachesActivity'],
    embeddingText:
      'Staff and teachers: staff profiles, teaching assignments, org roles, credentials, documents, permissions, and calendar sync.',
    sourceSignalIds: ['app-nav-hebrew', 'cadenza-native-spine'],
    agentReadable: {
      stableId: 'staff-teacher-management',
      canonicalFields: ['id', 'orgId', 'uid', 'role', 'fullName', 'email', 'isArchived'],
      readableJoins: ['teachingAssignments.staffMemberId', 'orgRoles.staffMemberId', 'eventParticipants.staffMemberId'],
      auditFields: ['createdAt', 'updatedAt', 'startDate'],
    },
  },
  {
    id: 'activity-program-tree',
    domain: 'scheduling',
    status: 'native',
    priority: 'p0',
    label: 'Activity and program tree',
    labelHe: 'עץ פעילויות ותכניות',
    shape:
      'Dynamic activity hierarchy for disciplines, programs, ensembles, external events, and administrative work.',
    industryStandard:
      'A conservatory platform needs configurable hierarchy rather than hardcoded categories.',
    cadenzaFit:
      'Cadenza ActivityManager, templates, L1/L2 subcategories, modules, and calendar filters provide this spine.',
    nextStep:
      'Use this tree as the anchor for public intake, student enrollment, exams, certificates, and finance modules.',
    dataEntities: ['ActivityV2', 'L1Subcategory', 'L2Subcategory', 'EnrollmentV2', 'TeachingAssignmentV2'],
    deterministicQueries: ['listActivityHierarchy', 'listActiveActivities', 'findAssignableStaff'],
    embeddingText:
      'Activity and program tree: dynamic conservatory taxonomy for disciplines, programs, ensembles, external work, and administrative events.',
    sourceSignalIds: ['seo-core', 'cadenza-native-spine'],
    agentReadable: {
      stableId: 'activity-program-tree',
      canonicalFields: ['id', 'orgId', 'name', 'template', 'activityType', 'modules', 'isArchived'],
      readableJoins: ['l1Subcategories.activityId', 'l2Subcategories.activityId', 'enrollments.activityId'],
      auditFields: ['createdAt', 'updatedAt'],
    },
  },
  {
    id: 'calendar-schedule-engine',
    domain: 'scheduling',
    status: 'native',
    priority: 'p0',
    label: 'Calendar and schedule engine',
    labelHe: 'לוח שנה ומערכת שעות',
    shape:
      'Day, week, and month scheduling with recurring events, rooms, staff, activities, filters, blackouts, and conflict detection.',
    industryStandard:
      'Scheduling must handle dense weeks, recurrence, rooms, cancellations, holidays, conflicts, and external sync.',
    cadenzaFit:
      'This is Cadenza core: CalendarView, Gantt, PowerTools, room conflicts, subscriptions, and Google import.',
    nextStep:
      'Continue migrating legacy event fields toward EventV2 and eventParticipants for cleaner deterministic joins.',
    dataEntities: ['CalendarEvent', 'EventV2', 'Room', 'GanttBlock', 'CalendarSubscription'],
    deterministicQueries: ['listForDay', 'findFreeRoom', 'checkRoomConflicts', 'lookupSchedule'],
    embeddingText:
      'Calendar and schedule engine: source-of-truth schedule for lessons, rooms, recurrence, blackouts, conflicts, filters, and external calendar sync.',
    sourceSignalIds: ['seo-core', 'app-nav-hebrew', 'cadenza-native-spine'],
    agentReadable: {
      stableId: 'calendar-schedule-engine',
      canonicalFields: ['id', 'orgId', 'start', 'end', 'activityId', 'staffMemberIds', 'roomId', 'status'],
      readableJoins: ['rooms.id', 'activities.id', 'eventParticipants.eventId'],
      auditFields: ['createdAt', 'updatedAt', 'canceledByBlackoutId'],
    },
  },
  {
    id: 'rooms-absence-requests',
    domain: 'scheduling',
    status: 'embedded',
    priority: 'p1',
    label: 'Rooms, absences, and day requests',
    labelHe: 'חדרים, היעדרויות ובקשות ימים',
    shape:
      'Room inventory, one-off room changes, teacher absence requests, extra teaching days, and admin approvals.',
    industryStandard:
      'Operational scheduling needs request/approval flows, not only static room CRUD.',
    cadenzaFit:
      'Cadenza has rooms, conflict notifications, and admin inbox primitives. Absence/day request semantics should reuse AdminInbox status flows.',
    nextStep:
      'Add request entities that can create, modify, or cancel schedule blocks after admin approval.',
    dataEntities: ['Room', 'CalendarEvent', 'AdminInboxItem', 'GanttBlock'],
    deterministicQueries: ['listRoomRequests', 'listAbsencesForPeriod', 'applyApprovedRoomChange'],
    embeddingText:
      'Rooms, absences, and day requests: operational request flow for room changes, teacher absence, extra days, and admin approval.',
    sourceSignalIds: ['app-nav-hebrew'],
    agentReadable: {
      stableId: 'rooms-absence-requests',
      canonicalFields: ['id', 'orgId', 'requestType', 'status', 'staffMemberId', 'roomId', 'dateRange'],
      readableJoins: ['adminInboxItems.relatedEntityIds', 'events.id', 'rooms.id'],
      auditFields: ['createdAt', 'approvedAt', 'approvedBy', 'resolvedAt'],
    },
  },
  {
    id: 'ensembles-theory-school-programs',
    domain: 'learning',
    status: 'planned',
    priority: 'p1',
    label: 'Ensembles, theory, and school programs',
    labelHe: 'הרכבים, תאוריה ובית ספר מנגן',
    shape:
      'Group learning modules with rosters, activities, program tracks, school partnerships, and attendance expectations.',
    industryStandard:
      'Conservatories need both one-to-one lessons and grouped programs with different roster and billing behavior.',
    cadenzaFit:
      'Activity templates support ENSEMBLE and PROGRAM; the next layer is domain-specific surfaces and roster workflows.',
    nextStep:
      'Build thin filtered views over Activity + Enrollment for ensembles, theory groups, and external school programs.',
    dataEntities: ['ActivityV2', 'EnrollmentV2', 'StudentV2', 'TeachingAssignmentV2'],
    deterministicQueries: ['listEnsembleRosters', 'listTheoryGroups', 'listSchoolProgramStudents'],
    embeddingText:
      'Ensembles, theory, and school programs: group-learning rosters and program tracks layered on Activity templates and enrollments.',
    sourceSignalIds: ['app-nav-hebrew'],
    agentReadable: {
      stableId: 'ensembles-theory-school-programs',
      canonicalFields: ['activityId', 'template', 'studentIds', 'staffMemberIds', 'status'],
      readableJoins: ['enrollments.activityId', 'students.id', 'teachingAssignments.activityId'],
      auditFields: ['createdAt', 'updatedAt', 'archivedAt'],
    },
  },
  {
    id: 'lesson-details-attendance',
    domain: 'learning',
    status: 'gap',
    priority: 'p0',
    label: 'Lesson details and attendance',
    labelHe: 'פירוט שיעורים ונוכחות',
    shape:
      'Per-lesson student attendance, notes, repertoire, makeups, completion state, and history derived from calendar events.',
    industryStandard:
      'Lesson records must connect schedule reality to student history and payroll inclusion.',
    cadenzaFit:
      'Cadenza can attach attendance and notes to EventV2 or a dedicated LessonRecord keyed by eventId.',
    nextStep:
      'Add LessonRecord with eventId, student statuses, notes, completion, and optional report-card references.',
    dataEntities: ['CalendarEvent', 'EventV2', 'LessonRecord', 'StudentV2', 'EventParticipant'],
    deterministicQueries: ['listStudentLessonHistory', 'listUnmarkedAttendance', 'summarizeLessonCompletion'],
    embeddingText:
      'Lesson details and attendance: event-linked student attendance, lesson notes, repertoire, makeups, and completion state.',
    sourceSignalIds: ['app-nav-hebrew'],
    agentReadable: {
      stableId: 'lesson-details-attendance',
      canonicalFields: ['id', 'orgId', 'eventId', 'studentStatuses', 'notes', 'completedAt'],
      readableJoins: ['events.id', 'students.id', 'staffMembers.id'],
      auditFields: ['createdAt', 'updatedAt', 'markedBy'],
    },
  },
  {
    id: 'exams-certificates-report-cards',
    domain: 'learning',
    status: 'planned',
    priority: 'p1',
    label: 'Exams, certificates, and report cards',
    labelHe: 'מבחנים, תעודות והערכות תלמיד',
    shape:
      'Assessment sessions, examiner submissions, scores, pass/fail status, certificates, report cards, and exports.',
    industryStandard:
      'Academic milestones need structured scoring, review, document generation, and student history links.',
    cadenzaFit:
      'The Academic Hub spec already describes session dashboards and report-card generation; keep it as an add-on over Student and Activity data.',
    nextStep:
      'Implement Academic Hub records using existing DocumentSection and PDF/export patterns.',
    dataEntities: ['ExamSession', 'ExaminerSubmission', 'Certificate', 'ReportCard', 'StudentV2'],
    deterministicQueries: ['listExamSessions', 'getStudentAssessmentSummary', 'listPendingCertificates'],
    embeddingText:
      'Exams, certificates, and report cards: structured assessment records, examiner scores, pass/fail status, generated documents, and student-history links.',
    sourceSignalIds: ['app-nav-hebrew'],
    agentReadable: {
      stableId: 'exams-certificates-report-cards',
      canonicalFields: ['id', 'orgId', 'studentId', 'sessionId', 'status', 'score', 'documentId'],
      readableJoins: ['students.id', 'activities.id', 'documents.filePath'],
      auditFields: ['createdAt', 'submittedAt', 'approvedAt', 'generatedAt'],
    },
  },
  {
    id: 'concert-programs-events',
    domain: 'learning',
    status: 'planned',
    priority: 'p2',
    label: 'Concert programs and events',
    labelHe: 'תכניות קונצרטים ואירועים',
    shape:
      'Concert planning, program order, performers, repertoire, rooms/halls, public event details, and printed program output.',
    industryStandard:
      'Performance schools need event planning that goes beyond a calendar title.',
    cadenzaFit:
      'Use CalendarEvent as the schedule anchor and add a ConcertProgram document for performer and repertoire structure.',
    nextStep:
      'Create ConcertProgram records linked to events and exportable as document templates.',
    dataEntities: ['CalendarEvent', 'ConcertProgram', 'StudentV2', 'StaffMemberV2', 'DocumentEntry'],
    deterministicQueries: ['listConcertPrograms', 'getProgramRunOfShow', 'listPerformerEvents'],
    embeddingText:
      'Concert programs and events: event-linked performance planning with performers, repertoire, order, venue, and printable program output.',
    sourceSignalIds: ['app-nav-hebrew'],
    agentReadable: {
      stableId: 'concert-programs-events',
      canonicalFields: ['id', 'orgId', 'eventId', 'title', 'performerIds', 'programItems', 'status'],
      readableJoins: ['events.id', 'students.id', 'staffMembers.id', 'documents.filePath'],
      auditFields: ['createdAt', 'updatedAt', 'publishedAt'],
    },
  },
  {
    id: 'payroll-salaries-hours',
    domain: 'finance',
    status: 'embedded',
    priority: 'p0',
    label: 'Payroll, salaries, and hours',
    labelHe: 'משכורות ודיווח שעות',
    shape:
      'Teacher hours, extra hours, event-derived compensation, self-report forms, reconciliation, and salary summaries.',
    industryStandard:
      'Payroll must reconcile staff assignments and completed events against reported hours and approved exceptions.',
    cadenzaFit:
      'Cadenza has HoursReport, TeacherHoursForm, EventParticipant, and financial specs; surface consolidation is the missing piece.',
    nextStep:
      'Restore or expose the finance dashboard route around HoursComparisonView and event participant cost rows.',
    dataEntities: ['HoursReport', 'HoursEntry', 'EventParticipant', 'TeachingAssignmentV2', 'OrgRoleV2'],
    deterministicQueries: ['listPendingHoursReports', 'compareReportedVsCalendarHours', 'calculatePayslipRows'],
    embeddingText:
      'Payroll, salaries, and hours: staff self-report, calendar-derived hours, approved exceptions, and reconciled compensation rows.',
    sourceSignalIds: ['app-nav-hebrew', 'cadenza-native-spine'],
    agentReadable: {
      stableId: 'payroll-salaries-hours',
      canonicalFields: ['id', 'orgId', 'staffMemberId', 'periodStart', 'periodEnd', 'status', 'reportedEntries'],
      readableJoins: ['events.id', 'eventParticipants.staffMemberId', 'teachingAssignments.id'],
      auditFields: ['createdAt', 'submittedAt', 'reviewedAt', 'reviewedBy'],
    },
  },
  {
    id: 'payments-charges',
    domain: 'finance',
    status: 'gap',
    priority: 'p0',
    label: 'Payments and charges',
    labelHe: 'תשלומים וחיובים',
    shape:
      'Student/family charges, payment tracking, payment method, invoices or receipts, adjustments, and real-time balance reports.',
    industryStandard:
      'Finance modules need auditable ledger rows and reconciliation against enrollments and agreements.',
    cadenzaFit:
      'Cadenza should not hide payment state inside student notes; add a simple ledger before any external payment processor.',
    nextStep:
      'Define Charge, Payment, Adjustment, and BalanceSnapshot collections linked to family/student/enrollment.',
    dataEntities: ['Charge', 'Payment', 'Adjustment', 'StudentV2', 'EnrollmentV2'],
    deterministicQueries: ['listOpenBalances', 'listPaymentsByFamily', 'reconcileEnrollmentCharges'],
    embeddingText:
      'Payments and charges: auditable family/student ledger with charges, payments, adjustments, receipts, and open balance queries.',
    sourceSignalIds: ['seo-core', 'integration-copy', 'app-nav-hebrew'],
    agentReadable: {
      stableId: 'payments-charges',
      canonicalFields: ['id', 'orgId', 'familyId', 'studentId', 'type', 'amount', 'currency', 'status'],
      readableJoins: ['students.id', 'enrollments.id', 'agreements.id'],
      auditFields: ['createdAt', 'postedAt', 'voidedAt', 'createdBy'],
    },
  },
  {
    id: 'agreements-consent',
    domain: 'finance',
    status: 'gap',
    priority: 'p1',
    label: 'Agreements and consent',
    labelHe: 'הסכמים וחתימות',
    shape:
      'Policies, enrollment agreements, payment terms, signatures, document versions, and acceptance status.',
    industryStandard:
      'Schools need consent and policy acceptance attached to enrollment and payment state.',
    cadenzaFit:
      'Use DocumentEntry plus a structured AgreementAcceptance record instead of freeform uploaded files only.',
    nextStep:
      'Add AgreementTemplate and AgreementAcceptance entities with version, signer, acceptedAt, and linked student/family.',
    dataEntities: ['AgreementTemplate', 'AgreementAcceptance', 'StudentV2', 'Guardian'],
    deterministicQueries: ['listUnsignedAgreements', 'getAgreementHistory', 'findAgreementByEnrollment'],
    embeddingText:
      'Agreements and consent: versioned policies and enrollment/payment terms with signatures and acceptance status.',
    sourceSignalIds: ['app-nav-hebrew'],
    agentReadable: {
      stableId: 'agreements-consent',
      canonicalFields: ['id', 'orgId', 'templateId', 'version', 'signerId', 'status', 'acceptedAt'],
      readableJoins: ['students.id', 'guardians.id', 'enrollments.id', 'documents.filePath'],
      auditFields: ['createdAt', 'sentAt', 'acceptedAt', 'revokedAt'],
    },
  },
  {
    id: 'instrument-inventory',
    domain: 'resources',
    // D-STATUS: promoted gap → implemented. Meets the implemented bar (catalog,
    // checkout/return, counters, Supabase mapping, RTL smoke) and the feature-tree
    // consistency check is green (features/forteTree.consistency.test.ts).
    status: 'implemented',
    priority: 'p1',
    label: 'Instrument inventory',
    labelHe: 'אינוונטר כלי נגינה',
    shape:
      'Instrument catalog, condition, assignment/loan history, repairs, deposits, and availability.',
    industryStandard:
      'Conservatories often loan instruments; inventory must track custody and condition over time.',
    cadenzaFit:
      'A resource table can mirror RoomManager density and link assignments to students, staff, and agreements.',
    nextStep:
      'Create Instrument and InstrumentLoan records with status, condition, borrower, due date, and document links.',
    dataEntities: ['Instrument', 'InstrumentLoan', 'StudentV2', 'StaffMemberV2', 'AgreementAcceptance'],
    deterministicQueries: ['listAvailableInstruments', 'listOverdueLoans', 'getInstrumentCustodyHistory'],
    embeddingText:
      'Instrument inventory: catalog of instruments with condition, custody, loans, repairs, deposits, and availability.',
    sourceSignalIds: ['app-nav-hebrew'],
    agentReadable: {
      stableId: 'instrument-inventory',
      canonicalFields: ['id', 'orgId', 'instrumentType', 'serialNumber', 'condition', 'status', 'currentLoanId'],
      readableJoins: ['instrumentLoans.instrumentId', 'students.id', 'staffMembers.id'],
      auditFields: ['createdAt', 'updatedAt', 'checkedOutAt', 'returnedAt'],
    },
  },
  {
    id: 'teacher-evaluation-hr',
    domain: 'people',
    status: 'gap',
    priority: 'p2',
    label: 'Teacher evaluation',
    labelHe: 'הערכת מורים',
    shape:
      'Staff performance cycles, self-evaluations, manager reviews, notes, documents, and follow-up actions.',
    industryStandard:
      'Larger schools need HR evaluation records separate from teaching assignments and payroll.',
    cadenzaFit:
      'Add StaffEvaluation as a staff submodule; keep it quiet and document-first.',
    nextStep:
      'Create StaffEvaluation records linked to staffMemberId with review period, scores/text, status, and attachments.',
    dataEntities: ['StaffEvaluation', 'StaffMemberV2', 'DocumentEntry', 'AdminInboxItem'],
    deterministicQueries: ['listDueEvaluations', 'getStaffEvaluationHistory', 'listEvaluationActions'],
    embeddingText:
      'Teacher evaluation: HR review cycles, self-evaluation, manager notes, documents, and follow-up actions linked to staff.',
    sourceSignalIds: ['app-nav-hebrew'],
    agentReadable: {
      stableId: 'teacher-evaluation-hr',
      canonicalFields: ['id', 'orgId', 'staffMemberId', 'periodStart', 'periodEnd', 'status', 'reviewerId'],
      readableJoins: ['staffMembers.id', 'documents.filePath', 'adminInboxItems.relatedEntityIds'],
      auditFields: ['createdAt', 'submittedAt', 'reviewedAt', 'acknowledgedAt'],
    },
  },
  {
    id: 'reports-analytics',
    domain: 'command',
    status: 'planned',
    priority: 'p1',
    label: 'Reports and analytics',
    labelHe: 'דוחות בזמן אמת',
    shape:
      'Real-time reports for scheduling, students, payments, payroll, attendance, conflicts, and exports.',
    industryStandard:
      'Operators need exportable rows and drill-down traces, not only charts.',
    cadenzaFit:
      'Cadenza already uses Recharts in prior specs and has CSV utilities; reports should be query-backed tables first.',
    nextStep:
      'Build report definitions as deterministic query configs with CSV export and optional chart rendering.',
    dataEntities: ['ReportDefinition', 'CalendarEvent', 'StudentV2', 'Payment', 'HoursReport'],
    deterministicQueries: ['runReportDefinition', 'exportReportCsv', 'getReportLineage'],
    embeddingText:
      'Reports and analytics: deterministic, exportable reports over schedule, students, finance, payroll, attendance, and conflicts.',
    sourceSignalIds: ['seo-core', 'integration-copy', 'cadenza-native-spine'],
    agentReadable: {
      stableId: 'reports-analytics',
      canonicalFields: ['id', 'orgId', 'name', 'queryId', 'filters', 'columns'],
      readableJoins: ['sourceIds', 'exportSessions.reportId'],
      auditFields: ['createdAt', 'updatedAt', 'lastRunAt'],
    },
  },
  {
    id: 'year-rollover-setup',
    domain: 'platform',
    status: 'embedded',
    priority: 'p1',
    label: 'Year rollover and setup wizard',
    labelHe: 'מעבר שנה ואשף הקמה',
    shape:
      'First-run setup, required org settings, school-year dates, grade increment, rollover preview, and migration checks.',
    industryStandard:
      'School-year systems must preview and audit rollover effects before mutating student and schedule records.',
    cadenzaFit:
      'Cadenza has onboarding gate and school year settings; rollover should become a deterministic preview/apply workflow.',
    nextStep:
      'Add rollover preview rows with impacted students, enrollments, recurring events, and agreements before applying changes.',
    dataEntities: ['OnboardingState', 'OrgSettingsV2', 'StudentV2', 'EnrollmentV2', 'CalendarEvent'],
    deterministicQueries: ['previewYearRollover', 'applyYearRollover', 'listSetupMilestones'],
    embeddingText:
      'Year rollover and setup wizard: org setup gate, school-year settings, grade increment, and audited rollover preview/apply flow.',
    sourceSignalIds: ['app-nav-hebrew', 'cadenza-native-spine'],
    agentReadable: {
      stableId: 'year-rollover-setup',
      canonicalFields: ['orgId', 'schoolYearStartDate', 'schoolYearEndDate', 'setupGateCleared', 'previewRows'],
      readableJoins: ['students.id', 'enrollments.id', 'events.id'],
      auditFields: ['createdAt', 'updatedAt', 'appliedAt', 'appliedBy'],
    },
  },
  {
    id: 'org-settings-global-users',
    domain: 'platform',
    status: 'native',
    priority: 'p0',
    label: 'Conservatory settings and user management',
    labelHe: 'הגדרות קונסרבטוריון וניהול משתמשים',
    shape:
      'Organization settings, language/RTL, timezone, access control, super admin tools, global users, and multi-conservatory administration.',
    industryStandard:
      'Tenant settings and role resolution must be explicit, auditable, and separate from client-only state.',
    cadenzaFit:
      'Cadenza has AuthContext, StaffMember role lookup, Settings, SuperAdmin, translations, and org-scoped Firestore sync.',
    nextStep:
      'Continue reducing hardcoded superadmin assumptions and expose tenant health as readable data.',
    dataEntities: ['AppSettings', 'OrgSettingsV2', 'UserProfile', 'StaffMemberV2'],
    deterministicQueries: ['resolveUserAccess', 'listOrgUsers', 'getOrgSettingsHealth'],
    embeddingText:
      'Conservatory settings and user management: org-scoped settings, language, timezone, roles, access control, global users, and super admin tooling.',
    sourceSignalIds: ['app-nav-hebrew', 'cadenza-native-spine'],
    agentReadable: {
      stableId: 'org-settings-global-users',
      canonicalFields: ['orgId', 'timezone', 'language', 'uid', 'role', 'staffMemberId'],
      readableJoins: ['userProfiles.uid', 'staffMembers.uid', 'system_configs.orgId'],
      auditFields: ['createdAt', 'updatedAt', 'lastLoginAt'],
    },
  },
  {
    id: 'import-export-data-portability',
    domain: 'platform',
    status: 'native',
    priority: 'p1',
    label: 'Import, export, and data portability',
    labelHe: 'ייבוא, ייצוא וניידות נתונים',
    shape:
      'CSV import, duplicate review, export scopes, templates, error reports, and migration sessions.',
    industryStandard:
      'Industry systems must onboard existing spreadsheets and export operational data without vendor lock-in.',
    cadenzaFit:
      'Cadenza has CsvImportModal, ImportSession, PapaParse utilities, and export scope patterns.',
    nextStep:
      'Extend import sessions to public registration, payments, instruments, and assessments as those modules land.',
    dataEntities: ['ImportSession', 'ImportRowResult', 'CalendarEvent', 'StudentV2', 'StaffMemberV2'],
    deterministicQueries: ['listImportSessions', 'getImportErrors', 'exportEntityCsv'],
    embeddingText:
      'Import, export, and data portability: CSV import review, duplicate handling, error reports, scoped exports, and migration lineage.',
    sourceSignalIds: ['cadenza-native-spine'],
    agentReadable: {
      stableId: 'import-export-data-portability',
      canonicalFields: ['id', 'orgId', 'entityType', 'status', 'fileName', 'rowResults'],
      readableJoins: ['createdBy', 'rowResults.duplicateOf', 'rowResults.autoCreated'],
      auditFields: ['createdAt', 'updatedAt', 'completedAt'],
    },
  },
  {
    id: 'calendar-website-integrations',
    domain: 'platform',
    status: 'embedded',
    priority: 'p1',
    label: 'Calendar and website integrations',
    labelHe: 'חיבורים לאתר וליומנים',
    shape:
      'Google Calendar import/sync, tokenized iCal subscriptions, public website embeds, and source tracking.',
    industryStandard:
      'External integrations must be revocable, scoped, tokenized where public, and traceable back to source records.',
    cadenzaFit:
      'Cadenza has Google import/sync settings, CalendarSubscriptionManager, and tokenized hours forms.',
    nextStep:
      'Unify tokenized public surfaces under one PublicEndpoint registry with scopes and revocation.',
    dataEntities: ['CalendarSubscription', 'CalendarEvent', 'PublicEndpoint', 'HoursReport'],
    deterministicQueries: ['listActiveSubscriptions', 'resolvePublicToken', 'listExternalSyncState'],
    embeddingText:
      'Calendar and website integrations: Google Calendar, tokenized iCal feeds, public embeds, and scoped revocable endpoints.',
    sourceSignalIds: ['integration-copy', 'cadenza-native-spine'],
    agentReadable: {
      stableId: 'calendar-website-integrations',
      canonicalFields: ['id', 'orgId', 'token', 'scope', 'filters', 'isActive'],
      readableJoins: ['events.googleEventId', 'calendarSubscriptions.filters', 'hoursReports.token'],
      auditFields: ['createdAt', 'revokedAt', 'lastAccessedAt'],
    },
  },
  {
    id: 'deterministic-agent-layer',
    domain: 'agent',
    status: 'native',
    priority: 'p0',
    label: 'Deterministic agent layer',
    labelHe: 'שכבת סוכן דטרמיניסטית',
    shape:
      'Readable data contracts, structured intents, pure query execution, entity resolution, and embedding-ready feature records.',
    industryStandard:
      'Agent-friendly software must expose structured data and deterministic query contracts rather than require UI scraping.',
    cadenzaFit:
      'Cadenza already has Cozy Bee intent types, resolve/execute stages, schema registry, and now this feature tree.',
    nextStep:
      'Expand bot intents to cover students, finance, intake, instruments, and blueprint coverage queries as modules land.',
    dataEntities: ['QueryIntent', 'QueryResult', 'ForteFeatureNode', 'ReadableDataContract'],
    deterministicQueries: ['queryForteTree', 'buildFeatureEmbeddingRecords', 'executeIntent'],
    embeddingText:
      'Deterministic agent layer: structured intents, entity resolution, pure query execution, readable data contracts, and embedding-ready feature records.',
    sourceSignalIds: ['cadenza-native-spine'],
    agentReadable: {
      stableId: 'deterministic-agent-layer',
      canonicalFields: ['intent', 'entityRefs', 'filters', 'result.kind', 'sourceIds'],
      readableJoins: ['featureTree.id', 'events.id', 'students.id', 'staffMembers.id'],
      auditFields: ['askedAt', 'stage', 'errorKey'],
    },
  },
];
