import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { AdminInboxItem, AppSettings, Teacher, Student, CalendarEvent, Room } from '../types';
import type { AgreementAcceptance, Family, HoursEntry, IntakeStatus, OperationalRequest, RegistrationIntake, ReportDefinition, RequestStatus } from '../types/blueprint';
import type { ImportSession } from '../types/v2';
import { TRANSLATIONS } from '../constants';
import { Modal } from './Modal';
import { ConflictResolutionPanel } from './ConflictResolutionPanel';
import { EventFormV2, EventFormState, EventFormV2Handle } from './EventFormV2';
import { OperationsSummary } from './OperationsSummary';
import { useSupabaseSync } from '../utils/useSupabaseSync';
import { useAuth } from '../context/AuthContext';
import type { OperationsActor, OperationsCardModel } from '../utils/blueprintQueries';
import { buildUpdatedCalendarEvent, applyEventUpdate } from '../utils/saveEventV2';
import { studentToMinimal } from '../utils/canonicalAdapters';
import {
  approveIntakeRecord,
  markIntakeDuplicate,
  rejectIntakeRecord,
} from '../utils/blueprintQueries';
import { decideOperationalRequest, OperationalRequestError, roomNameById } from '../utils/operationalRequestService';
import {
  applyRegistrationIntakeCorrection,
  applyApprovedIntakeGraphToCollections,
  buildRegistrationIntakeReviewRows,
  exportRegistrationIntakeCsv,
  type IntakeReviewStatusFilter,
} from '../utils/registrationIntakeReview';
import { downloadCSV } from '../utils/csvUtils';
import {
  ActivityV2, L1Subcategory, L2Subcategory, StaffMemberV2,
  TeachingAssignmentV2, OrgRoleV2, EnrollmentV2,
  EventParticipant, V2_COLLECTIONS,
} from '../types/v2';
import {
  Menu, Inbox, CheckCircle2, Bell, ChevronDown, ChevronUp,
  Clock, Users, Eye, EyeOff, Calendar, HelpCircle, AlertTriangle, GraduationCap,
  ExternalLink, Mail, Phone, XCircle, ShieldCheck, Trash2, Search, FileCheck2,
  SlidersHorizontal, Save, Check, CopyCheck, Ban, Loader2, Download,
} from 'lucide-react';

interface Props {
  inboxItems: AdminInboxItem[];
  setInboxItems: React.Dispatch<React.SetStateAction<AdminInboxItem[]>>;
  teachers: Teacher[];
  students: Student[];
  setStudents: SyncedCollectionSetter<Student>;
  families: Family[];
  setFamilies: SyncedCollectionSetter<Family>;
  events: CalendarEvent[];
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  rooms: Room[];
  operationalRequests: OperationalRequest[];
  setOperationalRequests: SyncedCollectionSetter<OperationalRequest>;
  operationalRequestsLoading?: boolean;
  hoursEntries: HoursEntry[];
  reportDefinitions: ReportDefinition[];
  importSessions: ImportSession[];
  operationsActor: OperationsActor;
  canAccessOperations: boolean;
  operationsLoading?: boolean;
  settings: AppSettings;
  onMobileMenuOpen: () => void;
  onNavigateToEvent?: (eventIds: string[]) => void;
  onNavigateToStaff?: (staffId: string) => void;
  onNavigateToOperationsCard?: (card: OperationsCardModel) => void;
}

type SyncedCollectionSetter<T extends { id: string }> = (
  value: T[] | ((prev: T[]) => T[]),
) => void | Promise<void>;

type IntakeDraft = {
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  studentFullName: string;
  studentDateOfBirth: string;
  instrument: string;
  requestedActivityId: string;
  primaryGuardianFullName: string;
  primaryGuardianPhone: string;
  primaryGuardianEmail: string;
  notes: string;
  l2Id: string;
  enrollmentStartDate: string;
  rejectionReason: string;
  duplicateStudentId: string;
};

const REVIEWABLE_INTAKE_STATUSES: IntakeReviewStatusFilter[] = ['ACTIVE', 'PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'DUPLICATE', 'CONVERTED', 'ALL'];

const makeId = (prefix: string) => {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30';
const labelClass = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

export const AdminInbox: React.FC<Props> = ({
  inboxItems, setInboxItems, teachers, students, setStudents, families, setFamilies, events, setEvents, rooms,
  operationalRequests, setOperationalRequests, operationalRequestsLoading = false,
  hoursEntries, reportDefinitions, importSessions, operationsActor, canAccessOperations, operationsLoading = false,
  settings, onMobileMenuOpen, onNavigateToEvent, onNavigateToStaff, onNavigateToOperationsCard
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const { currentUser } = useAuth();
  const actorId = currentUser?.uid || currentUser?.id || 'admin';
  const locale = settings.language === 'he-IL' ? 'he-IL' : 'en-US';
  const isRtl = settings.language === 'he-IL';
  const [showResolvedNotifs, setShowResolvedNotifs] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [viewStudentId, setViewStudentId] = useState<string | null>(null);
  const [registrationIntake, setRegistrationIntake, registrationIntakeLoading] = useSupabaseSync<RegistrationIntake>('registrationIntake', []);
  const [enrollmentsV2, setEnrollmentsV2] = useSupabaseSync<EnrollmentV2>(V2_COLLECTIONS.enrollments, []);
  const [agreementAcceptances, setAgreementAcceptances] = useSupabaseSync<AgreementAcceptance>('agreementAcceptances', []);
  const [intakeStatusFilter, setIntakeStatusFilter] = useState<IntakeReviewStatusFilter>('ACTIVE');
  const [intakeQuery, setIntakeQuery] = useState('');
  const [intakeActivityFilter, setIntakeActivityFilter] = useState('');
  const [selectedIntakeId, setSelectedIntakeId] = useState<string | null>(null);
  const [intakeDraft, setIntakeDraft] = useState<IntakeDraft | null>(null);
  const [lastPreparedGraph, setLastPreparedGraph] = useState<string | null>(null);
  const [focusedInboxItemIds, setFocusedInboxItemIds] = useState<Set<string>>(new Set());
  const [requestStatusFilter, setRequestStatusFilter] = useState<RequestStatus | 'ALL'>('PENDING');
  const [requestQuery, setRequestQuery] = useState('');
  const [requestDecisionNotes, setRequestDecisionNotes] = useState<Record<string, string>>({});
  const [requestDecisionError, setRequestDecisionError] = useState<string | null>(null);

  const notifications = useMemo(() => {
    const items = inboxItems.filter(i => i.type === 'NOTIFICATION');
    if (!showResolvedNotifs) return items.filter(i => i.status === 'OPEN')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items.sort((a, b) => {
      if (a.status === 'OPEN' && b.status !== 'OPEN') return -1;
      if (a.status !== 'OPEN' && b.status === 'OPEN') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [inboxItems, showResolvedNotifs]);

  const openNotifCount = useMemo(() =>
    inboxItems.filter(i => i.type === 'NOTIFICATION' && i.status === 'OPEN').length,
    [inboxItems]
  );

  const conflictStats = useMemo(() => {
    const all = inboxItems.filter(i => i.relatedEntityType === 'ROOM_CONFLICT');
    const resolved = all.filter(i => i.status === 'DONE').length;
    return { total: all.length, resolved };
  }, [inboxItems]);

  const [rescheduleEvent, setRescheduleEvent] = useState<CalendarEvent | null>(null);

  const handleMarkDone = (id: string) => {
    setInboxItems(prev => prev.map(item =>
      item.id === id
        ? { ...item, status: 'DONE' as const, markedDoneAt: new Date().toISOString() }
        : item
    ));
  };

  const autoAdvanceToNextConflict = (currentNotifId: string) => {
    // Find the next OPEN conflict notification to auto-expand
    const openConflicts = inboxItems.filter(
      i => i.relatedEntityType === 'ROOM_CONFLICT' && i.status === 'OPEN' && i.id !== currentNotifId
    );
    if (openConflicts.length > 0) {
      setExpandedItems(new Set([openConflicts[0].id]));
    } else {
      setExpandedItems(new Set());
    }
  };

  const handleChangeRoom = (eventId: string, newRoomId: string) => {
    setEvents(prev => prev.map(ev =>
      ev.id === eventId ? { ...ev, roomId: newRoomId } : ev
    ));
    // Auto-advance: find which notification this event belongs to
    const notif = inboxItems.find(i =>
      i.relatedEntityType === 'ROOM_CONFLICT' && i.status === 'OPEN' && i.relatedEntityIds?.includes(eventId)
    );
    if (notif) autoAdvanceToNextConflict(notif.id);
  };

  const handleCancelEvent = (eventId: string) => {
    setEvents(prev => prev.map(ev =>
      ev.id === eventId ? { ...ev, isCanceled: true } : ev
    ));
    const notif = inboxItems.find(i =>
      i.relatedEntityType === 'ROOM_CONFLICT' && i.status === 'OPEN' && i.relatedEntityIds?.includes(eventId)
    );
    if (notif) autoAdvanceToNextConflict(notif.id);
  };

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(settings.language === 'he-IL' ? 'he-IL' : 'en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const resolveStudentNames = (ids?: string[]) => {
    if (!ids?.length) return [];
    return ids.map(id => {
      const student = students.find(s => s.id === id);
      return student?.fullName || id;
    });
  };

  const resolveTeacherNames = (ids?: string[]) => {
    if (!ids?.length) return [];
    return ids.map(id => {
      const teacher = teachers.find(t => t.id === id);
      return teacher?.fullName || id;
    });
  };

  const resolveEventDate = (entityIds?: string[]): string | null => {
    if (!entityIds?.length) return null;
    const matchedEvents = events.filter(e => entityIds.includes(e.id));
    if (matchedEvents.length === 0) return null;
    const earliest = matchedEvents.reduce((a, b) => new Date(a.start) < new Date(b.start) ? a : b);
    return new Date(earliest.start).toLocaleDateString(settings.language === 'he-IL' ? 'he-IL' : 'en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  const [viewTeacherId, setViewTeacherId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // v2.0 Supabase hooks for reschedule modal
  const [activitiesV2] = useSupabaseSync<ActivityV2>(V2_COLLECTIONS.activities, []);
  const [l1Subs] = useSupabaseSync<L1Subcategory>(V2_COLLECTIONS.l1Subcategories, []);
  const [l2Subs] = useSupabaseSync<L2Subcategory>(V2_COLLECTIONS.l2Subcategories, []);
  const [staffMembersV2] = useSupabaseSync<StaffMemberV2>(V2_COLLECTIONS.staffMembers, []);
  const [teachingAssignmentsV2] = useSupabaseSync<TeachingAssignmentV2>(V2_COLLECTIONS.teachingAssignments, []);
  const [orgRolesV2] = useSupabaseSync<OrgRoleV2>(V2_COLLECTIONS.orgRoles, []);
  const [eventParticipantsV2] = useSupabaseSync<EventParticipant>(V2_COLLECTIONS.eventParticipants, []);

  const rescheduleFormRef = useRef<EventFormV2Handle>(null);

  const studentMinimals = useMemo(() => students.map(studentToMinimal), [students]);
  const intakeRows = useMemo(() => buildRegistrationIntakeReviewRows(registrationIntake, studentMinimals, {
    status: intakeStatusFilter,
    query: intakeQuery,
    activityId: intakeActivityFilter,
  }), [registrationIntake, studentMinimals, intakeStatusFilter, intakeQuery, intakeActivityFilter]);
  const selectedIntake = useMemo(
    () => registrationIntake.find(record => record.id === selectedIntakeId) ?? intakeRows[0]?.record ?? null,
    [registrationIntake, selectedIntakeId, intakeRows],
  );
  const selectedRow = useMemo(
    () => intakeRows.find(row => row.record.id === selectedIntake?.id) ?? null,
    [intakeRows, selectedIntake],
  );
  const activeIntakeCount = useMemo(
    () => registrationIntake.filter(record => record.status === 'PENDING' || record.status === 'IN_REVIEW').length,
    [registrationIntake],
  );
  const terminalIntakeCount = registrationIntake.length - activeIntakeCount;
  const selectedStatusHistory = selectedIntake?.statusHistory ?? [];
  const requestKindLabels: Record<OperationalRequest['kind'], string> = {
    ROOM_CHANGE: t('requests.kind.room_change'),
    ABSENCE: t('requests.kind.absence'),
    DAY_OFF: t('requests.kind.day_off'),
  };
  const requestStatusLabels: Record<RequestStatus, string> = {
    PENDING: t('requests.status.pending'),
    APPROVED: t('requests.status.approved'),
    REJECTED: t('requests.status.rejected'),
    CANCELLED: t('requests.status.cancelled'),
  };
  const requestApprovalItems = useMemo(() => {
    const pairs = new Map<string, AdminInboxItem>();
    inboxItems
      .filter(item => item.type === 'APPROVAL_REQUEST' && item.relatedEntityType === 'operationalRequest')
      .forEach(item => {
        (item.relatedEntityIds ?? []).forEach(entityId => {
          if (!pairs.has(entityId)) pairs.set(entityId, item);
        });
      });
    return pairs;
  }, [inboxItems]);
  const requestRows = useMemo(() => {
    const normalizedQuery = requestQuery.trim().toLowerCase();
    return operationalRequests
      .map(request => {
        const staff = teachers.find(teacher => teacher.id === request.requestedByStaffId);
        const event = request.eventId ? events.find(row => row.id === request.eventId) ?? null : null;
        const currentRoom = roomNameById(rooms, request.currentRoomId);
        const requestedRoom = roomNameById(rooms, request.requestedRoomId);
        const approvalItem = (request.adminInboxItemId
          ? inboxItems.find(item => item.id === request.adminInboxItemId)
          : null) ?? requestApprovalItems.get(request.id) ?? null;
        const staleReason = request.kind === 'ROOM_CHANGE'
          ? !event
            ? t('request_review.stale_event')
            : !currentRoom || !requestedRoom
              ? t('request_review.stale_room')
              : event.roomId !== request.currentRoomId
                ? t('request_review.stale_event_room')
                : null
          : null;
        return {
          request,
          staffName: staff?.fullName ?? request.requestedByStaffId ?? t('requests.staff_fallback'),
          event,
          currentRoom,
          requestedRoom,
          approvalItem,
          staleReason,
        };
      })
      .filter(row => requestStatusFilter === 'ALL' || row.request.status === requestStatusFilter)
      .filter(row => {
        if (!normalizedQuery) return true;
        const haystack = [
          row.staffName,
          row.event?.name,
          row.currentRoom,
          row.requestedRoom,
          row.request.reason,
          requestKindLabels[row.request.kind],
          requestStatusLabels[row.request.status],
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (a.request.status === 'PENDING' && b.request.status !== 'PENDING') return -1;
        if (a.request.status !== 'PENDING' && b.request.status === 'PENDING') return 1;
        const dateDiff = b.request.requestedFor.localeCompare(a.request.requestedFor);
        if (dateDiff !== 0) return dateDiff;
        return a.request.id.localeCompare(b.request.id);
      });
  }, [events, inboxItems, operationalRequests, requestApprovalItems, requestKindLabels, requestQuery, requestStatusFilter, requestStatusLabels, rooms, t, teachers]);
  const pendingRequestCount = operationalRequests.filter(request => request.status === 'PENDING').length;

  const handleOpenOperationsCard = useCallback((card: OperationsCardModel) => {
    if (card.source === 'openInboxItems') {
      setShowResolvedNotifs(false);
      setFocusedInboxItemIds(new Set(card.sourceIds));
      window.setTimeout(() => {
        const firstSource = card.sourceIds[0];
        if (!firstSource) return;
        document
          .querySelector(`[data-testid="admin-inbox-item-${firstSource}"]`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 0);
    } else {
      setFocusedInboxItemIds(new Set());
    }
    onNavigateToOperationsCard?.(card);
  }, [onNavigateToOperationsCard]);

  const activityName = useCallback((id?: string | null) => {
    if (!id) return t('intake_review.no_activity');
    return activitiesV2.find(activity => activity.id === id)?.name ?? id;
  }, [activitiesV2, t]);

  const l2OptionsForDraft = useMemo(() => {
    const activityId = intakeDraft?.requestedActivityId || selectedIntake?.requestedActivityId || '';
    return l2Subs.filter(l2 => !l2.isArchived && (!activityId || l2.activityId === activityId));
  }, [l2Subs, intakeDraft?.requestedActivityId, selectedIntake?.requestedActivityId]);

  const statusLabel = (status: IntakeStatus | IntakeReviewStatusFilter) => {
    const key = `intake_review.status.${status.toLowerCase()}`;
    return t(key) || String(status);
  };

  const makeDraft = useCallback((record: RegistrationIntake): IntakeDraft => {
    const primaryGuardian = record.guardians.find(g => g.isPrimary) ?? record.guardians[0] ?? null;
    const firstL2 = l2Subs.find(l2 => !l2.isArchived && l2.activityId === record.requestedActivityId)?.id ?? '';
    return {
      applicantName: record.applicantName ?? '',
      applicantEmail: record.applicantEmail ?? '',
      applicantPhone: record.applicantPhone ?? '',
      studentFullName: record.studentFullName,
      studentDateOfBirth: record.studentDateOfBirth ?? '',
      instrument: record.instrument ?? '',
      requestedActivityId: record.requestedActivityId ?? '',
      primaryGuardianFullName: primaryGuardian?.fullName ?? '',
      primaryGuardianPhone: primaryGuardian?.phone ?? '',
      primaryGuardianEmail: primaryGuardian?.email ?? '',
      notes: record.notes ?? '',
      l2Id: firstL2,
      enrollmentStartDate: settings.schoolYearStartDate || new Date().toISOString().slice(0, 10),
      rejectionReason: record.rejectionReason ?? '',
      duplicateStudentId: record.duplicateOfStudentId ?? '',
    };
  }, [l2Subs, settings.schoolYearStartDate]);

  useEffect(() => {
    if (!selectedIntakeId && intakeRows[0]) {
      setSelectedIntakeId(intakeRows[0].record.id);
    }
  }, [intakeRows, selectedIntakeId]);

  useEffect(() => {
    setIntakeDraft(selectedIntake ? makeDraft(selectedIntake) : null);
  }, [selectedIntake, makeDraft]);

  const updateDraft = (patch: Partial<IntakeDraft>) => {
    setIntakeDraft(prev => prev ? { ...prev, ...patch } : prev);
  };

  const updateIntakeRecord = (record: RegistrationIntake) => {
    void setRegistrationIntake(prev => prev.map(item => item.id === record.id ? record : item));
  };

  const appendInboxHistory = (item: AdminInboxItem) => {
    void setInboxItems(prev => [item, ...prev.filter(existing => existing.id !== item.id)]);
  };

  const handleSaveIntakeCorrection = () => {
    if (!selectedIntake || !intakeDraft) return;
    const corrected = applyRegistrationIntakeCorrection(selectedIntake, {
      applicantName: intakeDraft.applicantName,
      applicantEmail: intakeDraft.applicantEmail,
      applicantPhone: intakeDraft.applicantPhone,
      studentFullName: intakeDraft.studentFullName,
      studentDateOfBirth: intakeDraft.studentDateOfBirth,
      instrument: intakeDraft.instrument,
      requestedActivityId: intakeDraft.requestedActivityId,
      notes: intakeDraft.notes,
      primaryGuardianFullName: intakeDraft.primaryGuardianFullName,
      primaryGuardianPhone: intakeDraft.primaryGuardianPhone,
      primaryGuardianEmail: intakeDraft.primaryGuardianEmail,
    }, { now: new Date().toISOString(), reviewedBy: actorId });
    updateIntakeRecord(corrected);
  };

  const handleRejectIntake = () => {
    if (!selectedIntake || !intakeDraft?.rejectionReason.trim()) return;
    const result = rejectIntakeRecord(selectedIntake, {
      inboxItemId: makeId('inbox_intake_reject'),
      now: new Date().toISOString(),
      reviewedBy: actorId,
      reason: intakeDraft.rejectionReason.trim(),
    });
    updateIntakeRecord(result.intake);
    appendInboxHistory(result.inboxHistoryItem);
  };

  const handleDuplicateIntake = () => {
    const duplicateStudentId = intakeDraft?.duplicateStudentId || selectedRow?.duplicateSuggestions[0]?.studentId || '';
    if (!selectedIntake || !duplicateStudentId) return;
    const result = markIntakeDuplicate(selectedIntake, {
      inboxItemId: makeId('inbox_intake_duplicate'),
      now: new Date().toISOString(),
      reviewedBy: actorId,
      duplicateOfStudentId: duplicateStudentId,
      note: intakeDraft?.rejectionReason.trim() || undefined,
    });
    updateIntakeRecord(result.intake);
    appendInboxHistory(result.inboxHistoryItem);
  };

  const handleApproveIntake = async () => {
    if (!selectedIntake || !intakeDraft?.requestedActivityId || !intakeDraft.l2Id || !intakeDraft.enrollmentStartDate) return;
    const graph = approveIntakeRecord(
      {
        ...selectedIntake,
        requestedActivityId: intakeDraft.requestedActivityId,
        studentFullName: intakeDraft.studentFullName.trim() || selectedIntake.studentFullName,
        studentDateOfBirth: intakeDraft.studentDateOfBirth.trim() || null,
        instrument: intakeDraft.instrument.trim() || null,
        notes: intakeDraft.notes.trim() || null,
      },
      {
        studentId: makeId('student'),
        familyId: makeId('family'),
        enrollmentId: makeId('enrollment'),
        agreementRequestId: makeId('agreement_request'),
        inboxItemId: makeId('inbox_intake_approve'),
        now: new Date().toISOString(),
        reviewedBy: actorId,
        activityId: intakeDraft.requestedActivityId,
        l2Id: intakeDraft.l2Id,
        enrollmentStartDate: intakeDraft.enrollmentStartDate,
        decisionNote: intakeDraft.notes.trim() || undefined,
      },
    );
    const persisted = applyApprovedIntakeGraphToCollections(graph, {
      students,
      families,
      enrollments: enrollmentsV2,
      agreementAcceptances,
      registrationIntake,
      inboxItems,
    });
    await Promise.all([
      setStudents(persisted.students),
      setFamilies(persisted.families),
      setEnrollmentsV2(persisted.enrollments),
      setAgreementAcceptances(persisted.agreementAcceptances),
      setRegistrationIntake(persisted.registrationIntake),
      setInboxItems(persisted.inboxItems),
    ]);
    setLastPreparedGraph(`${persisted.legacyStudent.fullName} -> ${graph.family.name} / ${graph.enrollment.id}`);
  };

  const handleExportIntakeQueue = () => {
    const csv = exportRegistrationIntakeCsv(intakeRows, {
      activityName,
      statusLabel: status => statusLabel(status),
    });
    downloadCSV(csv, `registration_intake_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleDecideOperationalRequest = async (
    request: OperationalRequest,
    approvalItem: AdminInboxItem | null,
    decision: 'APPROVED' | 'REJECTED',
  ) => {
    setRequestDecisionError(null);
    if (!approvalItem) {
      setRequestDecisionError(t('request_review.error_missing_inbox'));
      return;
    }
    const linkedEvent = request.eventId ? events.find(event => event.id === request.eventId) ?? null : null;
    try {
      const result = decideOperationalRequest({
        request,
        inboxItem: approvalItem,
        decision,
        decidedBy: actorId,
        nowIso: new Date().toISOString(),
        note: requestDecisionNotes[request.id],
        eventIds: events.map(event => event.id),
        roomIds: rooms.map(room => room.id),
        currentEventRoomId: request.kind === 'ROOM_CHANGE' ? linkedEvent?.roomId ?? null : undefined,
      });
      await setOperationalRequests(prev => prev.map(row => row.id === request.id ? result.request : row));
      await setInboxItems(prev => prev.map(item => item.id === approvalItem.id ? result.inboxItem : item));
      if (result.eventUpdate) {
        setEvents(prev => prev.map(event => (
          event.id === result.eventUpdate!.eventId
            ? { ...event, roomId: result.eventUpdate!.roomId, location: roomNameById(rooms, result.eventUpdate!.roomId) ?? event.location }
            : event
        )));
      }
      setRequestDecisionNotes(prev => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
    } catch (error) {
      const code = error instanceof OperationalRequestError ? error.code : 'SAVE_FAILED';
      setRequestDecisionError(t(`request_review.error_${code.toLowerCase()}`) || t('request_review.error_save'));
    }
  };

  const handleRescheduleSave = useCallback((formState: EventFormState) => {
    if (!rescheduleEvent) return;
    const result = buildUpdatedCalendarEvent(rescheduleEvent, formState);
    applyEventUpdate(setEvents, result, rescheduleEvent.id);
    // Auto-advance to next conflict
    const notif = inboxItems.find(i =>
      i.relatedEntityType === 'ROOM_CONFLICT' && i.status === 'OPEN' && i.relatedEntityIds?.includes(rescheduleEvent.id)
    );
    if (notif) autoAdvanceToNextConflict(notif.id);
    setRescheduleEvent(null);
  }, [rescheduleEvent, setEvents, inboxItems]);

  return (
    <div className="h-full overflow-y-auto p-8 pb-20 custom-scrollbar">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onMobileMenuOpen} className="p-2 -ms-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors lg:hidden">
            <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl btn-cadenza bg-cadenza-gradient texture-cadenza flex items-center justify-center shadow-cadenza-soft">
              <Inbox size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{t('inbox.title')}</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">{t('inbox.subtitle')}</p>
            </div>
          </div>
        </div>

        <OperationsSummary
          settings={settings}
          orgId={currentUser?.orgId ?? null}
          actor={operationsActor}
          canAccessOperations={canAccessOperations}
          loading={operationsLoading}
          events={events}
          inboxItems={inboxItems}
          hoursEntries={hoursEntries}
          reportDefinitions={reportDefinitions}
          importSessions={importSessions}
          onOpenCard={handleOpenOperationsCard}
        />

        {operationsActor !== 'admin' ? (
          <section
            data-testid="admin-inbox-source-restricted"
            dir={isRtl ? 'rtl' : 'ltr'}
            className="mb-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4"
          >
            <div className="flex items-start gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <ShieldCheck size={16} className="text-slate-600 dark:text-slate-300" />
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">{t('operations.source_restricted_title')}</div>
                <div className="mt-0.5 text-slate-500 dark:text-slate-400">{t('operations.source_restricted_body')}</div>
              </div>
            </div>
          </section>
        ) : (
          <>
        <section
          data-testid="operational-request-review"
          dir={isRtl ? 'rtl' : 'ltr'}
          className="mb-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Calendar size={17} className="text-blue-700 dark:text-blue-300" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('request_review.title')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('request_review.subtitle').replace('{pending}', String(pendingRequestCount))}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={requestQuery}
                  onChange={e => setRequestQuery(e.target.value)}
                  placeholder={t('request_review.search_placeholder')}
                  className="ps-8 pe-3 py-2 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <select
                value={requestStatusFilter}
                onChange={e => setRequestStatusFilter(e.target.value as RequestStatus | 'ALL')}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-700 dark:text-slate-100"
                aria-label={t('request_review.status_filter')}
              >
                <option value="PENDING">{requestStatusLabels.PENDING}</option>
                <option value="APPROVED">{requestStatusLabels.APPROVED}</option>
                <option value="REJECTED">{requestStatusLabels.REJECTED}</option>
                <option value="CANCELLED">{requestStatusLabels.CANCELLED}</option>
                <option value="ALL">{t('request_review.status_all')}</option>
              </select>
            </div>
          </div>

          {requestDecisionError && (
            <div role="alert" className="mx-4 mt-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
              {requestDecisionError}
            </div>
          )}

          {operationalRequestsLoading ? (
            <div className="p-6 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 size={16} className="animate-spin" />
              {t('request_review.loading')}
            </div>
          ) : operationalRequests.length === 0 ? (
            <div className="p-8 text-center border-t border-dashed border-slate-200 dark:border-slate-800">
              <Calendar size={34} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{t('request_review.empty')}</p>
            </div>
          ) : requestRows.length === 0 ? (
            <div className="p-6 text-sm text-slate-500 dark:text-slate-400">{t('request_review.no_matches')}</div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {requestRows.map(row => {
                const isPending = row.request.status === 'PENDING';
                const canApprove = isPending && row.approvalItem?.status === 'OPEN' && !row.staleReason;
                const canReject = isPending && row.approvalItem?.status === 'OPEN';
                const dateRange = row.request.endDate && row.request.endDate !== row.request.requestedFor
                  ? `${row.request.requestedFor} - ${row.request.endDate}`
                  : row.request.requestedFor;
                return (
                  <article key={row.request.id} data-testid="operational-request-row" className="p-4">
                    <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">{requestKindLabels[row.request.kind]}</h4>
                          <span data-testid={`operational-request-status-${row.request.id}`} className="rounded-full border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            {requestStatusLabels[row.request.status]}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">{dateRange}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {row.staffName}
                          {row.event && <> · {row.event.name}</>}
                          {row.request.kind === 'ROOM_CHANGE' && <> · {row.currentRoom} {'->'} {row.requestedRoom}</>}
                        </p>
                        {row.request.reason && (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.request.reason}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                          {row.request.kind !== 'ROOM_CHANGE' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300">
                              <AlertTriangle size={11} />
                              {t('request_review.review_only_badge')}
                            </span>
                          )}
                          {row.staleReason && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/30 px-2 py-0.5 font-semibold text-rose-700 dark:text-rose-300">
                              <AlertTriangle size={11} />
                              {row.staleReason}
                            </span>
                          )}
                          {row.event && onNavigateToEvent && (
                            <button
                              type="button"
                              onClick={() => onNavigateToEvent([row.event!.id])}
                              className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                            >
                              <Calendar size={11} />
                              {t('request_review.view_event')}
                            </button>
                          )}
                          {row.request.requestedByStaffId && onNavigateToStaff && (
                            <button
                              type="button"
                              onClick={() => onNavigateToStaff(row.request.requestedByStaffId!)}
                              className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                            >
                              <Users size={11} />
                              {t('request_review.view_staff')}
                            </button>
                          )}
                        </div>
                        {row.request.decisionNote && (
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {t('request_review.decision_note')}: {row.request.decisionNote}
                          </p>
                        )}
                      </div>
                      <div className="xl:w-80 flex-shrink-0">
                        {isPending ? (
                          <div className="space-y-2">
                            <label className="block space-y-1">
                              <span className={labelClass}>{t('request_review.decision_note')}</span>
                              <input
                                value={requestDecisionNotes[row.request.id] ?? ''}
                                onChange={e => setRequestDecisionNotes(prev => ({ ...prev, [row.request.id]: e.target.value }))}
                                placeholder={t('request_review.decision_note_placeholder')}
                                className={inputClass}
                              />
                            </label>
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                disabled={!canReject}
                                onClick={() => handleDecideOperationalRequest(row.request, row.approvalItem, 'REJECTED')}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900/60 text-sm font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/20 disabled:opacity-40"
                              >
                                <Ban size={14} />
                                {t('request_review.reject')}
                              </button>
                              <button
                                type="button"
                                disabled={!canApprove}
                                onClick={() => handleDecideOperationalRequest(row.request, row.approvalItem, 'APPROVED')}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft text-sm font-medium disabled:opacity-40"
                              >
                                <Check size={14} />
                                {t('request_review.approve')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30 p-3 text-xs text-slate-500 dark:text-slate-400">
                            {row.request.decidedAt
                              ? `${t('request_review.decided')} ${formatDate(row.request.decidedAt)}`
                              : t('request_review.retained_history')}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Registration intake review */}
        <section
          data-testid="registration-intake-review"
          dir={isRtl ? 'rtl' : 'ltr'}
          className="mb-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <FileCheck2 size={17} className="text-amber-700 dark:text-amber-300" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('intake_review.title')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('intake_review.subtitle')
                    .replace('{active}', String(activeIntakeCount))
                    .replace('{history}', String(terminalIntakeCount))}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={intakeQuery}
                  onChange={e => setIntakeQuery(e.target.value)}
                  placeholder={t('intake_review.search_placeholder')}
                  className="ps-8 pe-3 py-2 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>
              <select
                value={intakeStatusFilter}
                onChange={e => setIntakeStatusFilter(e.target.value as IntakeReviewStatusFilter)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-700 dark:text-slate-100"
                aria-label={t('intake_review.status_filter')}
              >
                {REVIEWABLE_INTAKE_STATUSES.map(status => (
                  <option key={status} value={status}>{statusLabel(status)}</option>
                ))}
              </select>
              <select
                value={intakeActivityFilter}
                onChange={e => setIntakeActivityFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-700 dark:text-slate-100"
                aria-label={t('intake_review.activity_filter')}
              >
                <option value="">{t('student_family.filter.all_activities')}</option>
                {activitiesV2.filter(activity => !activity.isArchived).map(activity => (
                  <option key={activity.id} value={activity.id}>{activity.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleExportIntakeQueue}
                disabled={intakeRows.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-medium text-slate-700 dark:text-slate-100 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-40"
              >
                <Download size={14} />
                {t('intake_review.export_csv')}
              </button>
            </div>
          </div>

          {registrationIntakeLoading ? (
            <div className="p-6 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 size={16} className="animate-spin" />
              {t('intake_review.loading')}
            </div>
          ) : registrationIntake.length === 0 ? (
            <div className="p-8 text-center border-t border-dashed border-slate-200 dark:border-slate-800">
              <FileCheck2 size={34} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{t('intake_review.empty')}</p>
            </div>
          ) : (
            <div className="grid xl:grid-cols-[360px_minmax(0,1fr)] min-h-[420px]">
              <div className="border-e border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
                <div className="px-4 py-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <SlidersHorizontal size={13} />
                  {intakeRows.length} {t('intake_review.rows')}
                </div>
                <div className="max-h-[520px] overflow-y-auto custom-scrollbar">
                  {intakeRows.length === 0 ? (
                    <div className="p-5 text-sm text-slate-500 dark:text-slate-400">{t('intake_review.no_matches')}</div>
                  ) : intakeRows.map(row => {
                    const isSelected = selectedIntake?.id === row.record.id;
                    return (
                      <button
                        key={row.record.id}
                        type="button"
                        onClick={() => {
                          setSelectedIntakeId(row.record.id);
                          setLastPreparedGraph(null);
                        }}
                        className={`w-full text-start px-4 py-3 border-t border-slate-200 dark:border-slate-800 transition-colors ${isSelected ? 'bg-white dark:bg-slate-900' : 'hover:bg-white/70 dark:hover:bg-slate-900/70'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">{row.record.studentFullName}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{row.primaryGuardianName || row.record.applicantName || t('intake_review.no_guardian')}</div>
                          </div>
                          <span data-testid={`intake-review-row-status-${row.record.id}`} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            row.record.status === 'PENDING' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                            row.record.status === 'IN_REVIEW' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                            row.record.status === 'CONVERTED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                            'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}>
                            {statusLabel(row.record.status)}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="truncate">{activityName(row.record.requestedActivityId)}</span>
                          <span>{formatDate(row.record.submittedAt)}</span>
                        </div>
                        {row.duplicateSuggestions.length > 0 && (
                          <div className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            {t('intake_review.duplicate_hint')}: {row.duplicateSuggestions[0].studentName}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-4">
                {!selectedIntake || !intakeDraft ? (
                  <div className="h-full min-h-[320px] flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                    {t('intake_review.select_prompt')}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-lg font-bold text-slate-900 dark:text-white">{selectedIntake.studentFullName}</h4>
                          <span data-testid="intake-review-detail-status" className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {statusLabel(selectedIntake.status)}
                          </span>
                          {selectedIntake.consentAccepted && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                              <ShieldCheck size={11} />
                              {t('intake_review.consent_captured')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {t('intake_review.submitted')} {formatDate(selectedIntake.submittedAt)} · {selectedIntake.source}
                        </p>
                      </div>
                      {lastPreparedGraph && (
                        <div role="status" className="text-xs rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-3 py-2">
                          {t('intake_review.graph_prepared')}: {lastPreparedGraph}
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30 p-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
                        <Clock size={14} />
                        {t('intake_review.audit_history')}
                      </div>
                      {selectedStatusHistory.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {t('intake_review.no_audit_history')}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {selectedStatusHistory.map(entry => (
                            <div key={entry.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 text-sm">
                              <div>
                                <span className="font-semibold text-slate-800 dark:text-slate-100">{statusLabel(entry.status)}</span>
                                {entry.fromStatus && (
                                  <span className="text-slate-500 dark:text-slate-400"> · {statusLabel(entry.fromStatus)} {'->'} {statusLabel(entry.status)}</span>
                                )}
                                {entry.note && (
                                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{entry.note}</div>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 sm:text-end">
                                <div>{formatDate(entry.at)}</div>
                                <div>{entry.by || t('intake_review.system_actor')}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid lg:grid-cols-3 gap-3">
                      <label className="space-y-1">
                        <span className={labelClass}>{t('intake_review.applicant_name')}</span>
                        <input className={inputClass} value={intakeDraft.applicantName} onChange={e => updateDraft({ applicantName: e.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>{t('intake_review.applicant_email')}</span>
                        <input className={inputClass} value={intakeDraft.applicantEmail} onChange={e => updateDraft({ applicantEmail: e.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>{t('intake_review.applicant_phone')}</span>
                        <input className={inputClass} value={intakeDraft.applicantPhone} onChange={e => updateDraft({ applicantPhone: e.target.value })} />
                      </label>
                    </div>

                    <div className="grid lg:grid-cols-4 gap-3">
                      <label className="space-y-1 lg:col-span-2">
                        <span className={labelClass}>{t('intake_review.student_name')}</span>
                        <input className={inputClass} value={intakeDraft.studentFullName} onChange={e => updateDraft({ studentFullName: e.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>{t('intake_review.date_of_birth')}</span>
                        <input type="date" className={inputClass} value={intakeDraft.studentDateOfBirth} onChange={e => updateDraft({ studentDateOfBirth: e.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>{t('intake_review.instrument')}</span>
                        <input className={inputClass} value={intakeDraft.instrument} onChange={e => updateDraft({ instrument: e.target.value })} />
                      </label>
                    </div>

                    <div className="grid lg:grid-cols-3 gap-3">
                      <label className="space-y-1">
                        <span className={labelClass}>{t('intake_review.guardian_name')}</span>
                        <input className={inputClass} value={intakeDraft.primaryGuardianFullName} onChange={e => updateDraft({ primaryGuardianFullName: e.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>{t('intake_review.guardian_phone')}</span>
                        <input className={inputClass} value={intakeDraft.primaryGuardianPhone} onChange={e => updateDraft({ primaryGuardianPhone: e.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>{t('intake_review.guardian_email')}</span>
                        <input className={inputClass} value={intakeDraft.primaryGuardianEmail} onChange={e => updateDraft({ primaryGuardianEmail: e.target.value })} />
                      </label>
                    </div>

                    <div className="grid lg:grid-cols-3 gap-3">
                      <label className="space-y-1">
                        <span className={labelClass}>{t('intake_review.activity')}</span>
                        <select className={inputClass} value={intakeDraft.requestedActivityId} onChange={e => updateDraft({ requestedActivityId: e.target.value, l2Id: '' })}>
                          <option value="">{t('event.select_activity')}</option>
                          {activitiesV2.filter(activity => !activity.isArchived).map(activity => (
                            <option key={activity.id} value={activity.id}>{activity.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>{t('intake_review.section')}</span>
                        <select className={inputClass} value={intakeDraft.l2Id} onChange={e => updateDraft({ l2Id: e.target.value })}>
                          <option value="">{t('event.select_subcategory')}</option>
                          {l2OptionsForDraft.map(l2 => (
                            <option key={l2.id} value={l2.id}>{l2.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>{t('intake_review.enrollment_start')}</span>
                        <input type="date" className={inputClass} value={intakeDraft.enrollmentStartDate} onChange={e => updateDraft({ enrollmentStartDate: e.target.value })} />
                      </label>
                    </div>

                    <label className="space-y-1 block">
                      <span className={labelClass}>{t('intake_review.notes')}</span>
                      <textarea className={`${inputClass} min-h-[72px]`} value={intakeDraft.notes} onChange={e => updateDraft({ notes: e.target.value })} />
                    </label>

                    <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-200 mb-2">
                        <CopyCheck size={14} />
                        {t('intake_review.duplicate_suggestions')}
                      </div>
                      {selectedRow?.duplicateSuggestions.length ? (
                        <div className="space-y-2">
                          {selectedRow.duplicateSuggestions.map(suggestion => (
                            <label key={suggestion.studentId} className="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200">
                              <span>
                                <input
                                  type="radio"
                                  name="duplicateStudent"
                                  className="me-2"
                                  checked={intakeDraft.duplicateStudentId === suggestion.studentId}
                                  onChange={() => updateDraft({ duplicateStudentId: suggestion.studentId })}
                                />
                                {suggestion.studentName}
                              </span>
                              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{Math.round(suggestion.score * 100)}%</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('intake_review.no_duplicates')}</p>
                      )}
                    </div>

                    <label className="space-y-1 block">
                      <span className={labelClass}>{t('intake_review.decision_note')}</span>
                      <input className={inputClass} value={intakeDraft.rejectionReason} onChange={e => updateDraft({ rejectionReason: e.target.value })} />
                    </label>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleSaveIntakeCorrection}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Save size={14} />
                        {t('intake_review.save_corrections')}
                      </button>
                      <button
                        type="button"
                        onClick={handleRejectIntake}
                        disabled={!intakeDraft.rejectionReason.trim()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900/60 text-sm font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/20 disabled:opacity-40"
                      >
                        <Ban size={14} />
                        {t('intake_review.reject')}
                      </button>
                      <button
                        type="button"
                        onClick={handleDuplicateIntake}
                        disabled={!intakeDraft.duplicateStudentId && !selectedRow?.duplicateSuggestions[0]?.studentId}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-900/60 text-sm font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/20 disabled:opacity-40"
                      >
                        <CopyCheck size={14} />
                        {t('intake_review.mark_duplicate')}
                      </button>
                      <button
                        type="button"
                        onClick={handleApproveIntake}
                        disabled={!intakeDraft.requestedActivityId || !intakeDraft.l2Id || !intakeDraft.enrollmentStartDate || !selectedIntake.consentAccepted}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft text-sm font-medium disabled:opacity-40"
                      >
                        <Check size={14} />
                        {t('intake_review.approve')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Notifications header — resolved toggle + clear all conflicts */}
        <div className="flex items-center justify-end gap-4 mb-6">
          {conflictStats.total > 5 && (
            <button
              onClick={() => {
                if (window.confirm(`Clear all ${conflictStats.total} room conflict notifications? Active conflicts will reappear automatically; resolved ones will be permanently removed.`)) {
                  setInboxItems(prev => prev.filter(i => i.relatedEntityType !== 'ROOM_CONFLICT'));
                }
              }}
              className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition-colors"
              title="Wipe all room-conflict notifications. Active ones will be regenerated."
            >
              <Trash2 size={13} />
              Clear all conflicts ({conflictStats.total})
            </button>
          )}
          <button
            onClick={() => setShowResolvedNotifs(!showResolvedNotifs)}
            className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            {showResolvedNotifs ? <EyeOff size={13} /> : <Eye size={13} />}
            {showResolvedNotifs ? t('inbox.hide_resolved') || 'Hide resolved' : t('inbox.show_resolved') || 'Show resolved'}
          </button>
        </div>

        {/* Help Panel */}
        <div className="mb-4">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <HelpCircle size={13} />
            {t('inbox.help_title')}
            {showHelp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showHelp && (
            <div className="mt-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-xs text-slate-500 dark:text-slate-400 space-y-1.5 border border-slate-200 dark:border-slate-700">
              <p><strong className="text-slate-600 dark:text-slate-300">{t('inbox.help_room_conflicts')}</strong></p>
              <p><strong className="text-slate-600 dark:text-slate-300">{t('inbox.help_system_events')}</strong></p>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="space-y-3">
            {/* Conflict Progress Indicator */}
            {conflictStats.total > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-3 flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {t('inbox.conflict_progress') || 'Conflict resolution progress'}
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-white">
                      {conflictStats.resolved} / {conflictStats.total}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
                    <div
                      className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${conflictStats.total > 0 ? (conflictStats.resolved / conflictStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                {conflictStats.resolved === conflictStats.total && conflictStats.total > 0 && (
                  <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />
                )}
              </div>
            )}

            {notifications.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
                <Bell size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-500 dark:text-slate-400 font-medium">{t('inbox.no_notifications')}</p>
              </div>
            ) : (
              notifications.map(notif => {
                const isDone = notif.status === 'DONE';
                const isAutoResolved = !!notif.autoResolvedReason;
                const isFocused = focusedInboxItemIds.has(notif.id);
                return (
                  <div
                    key={notif.id}
                    data-testid={`admin-inbox-item-${notif.id}`}
                    data-focused={isFocused ? 'true' : 'false'}
                    className={`bg-white dark:bg-slate-900 rounded-xl border shadow-sm p-4 transition-all ${isFocused ? 'ring-2 ring-cyan-500/40 border-cyan-300 dark:border-cyan-700' : isDone ? 'border-slate-200 dark:border-slate-800 opacity-60' : 'border-slate-200 dark:border-slate-800'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isAutoResolved ? 'bg-green-100 dark:bg-green-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                        {isAutoResolved
                          ? <ShieldCheck size={16} className="text-green-600 dark:text-green-400" />
                          : <Bell size={16} className="text-blue-600 dark:text-blue-400" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className={`font-semibold text-sm ${isDone ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-white'}`}>{notif.title}</h4>
                          {isAutoResolved && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                              {t('inbox.resolved') || 'Resolved'}
                            </span>
                          )}
                          {isDone && !isAutoResolved && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                              {t('inbox.dismissed') || 'Dismissed'}
                            </span>
                          )}
                        </div>
                        <p className={`text-sm ${isDone ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'}`}>{notif.message}</p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                            <Clock size={11} />
                            {formatDate(notif.createdAt)}
                          </span>
                          {notif.relatedEntityType === 'ROOM_CONFLICT' && notif.relatedEntityIds && (() => {
                            const eventDate = resolveEventDate(notif.relatedEntityIds);
                            return eventDate ? (
                              <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                <AlertTriangle size={11} />
                                {t('inbox.conflict_on')} {eventDate}
                              </span>
                            ) : null;
                          })()}
                        </div>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {notif.relatedEntityType === 'ROOM_CONFLICT' && !isDone && notif.relatedEntityIds && (
                            <button
                              onClick={() => toggleExpand(notif.id)}
                              className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                            >
                              <AlertTriangle size={12} />
                              {expandedItems.has(notif.id)
                                ? (t('inbox.hide_resolution') || 'Hide resolution options')
                                : (t('inbox.resolve_conflict') || 'Resolve conflict')}
                              {expandedItems.has(notif.id) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          )}
                          {notif.relatedEntityType === 'ROOM_CONFLICT' && onNavigateToEvent && notif.relatedEntityIds && (
                            <button
                              onClick={() => onNavigateToEvent(notif.relatedEntityIds!)}
                              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                            >
                              <Calendar size={12} />
                              {t('inbox.view_in_calendar')}
                            </button>
                          )}
                          {notif.relatedEntityType === 'TEACHER' && onNavigateToStaff && notif.relatedEntityIds?.[0] && (
                            <button
                              onClick={() => onNavigateToStaff(notif.relatedEntityIds![0])}
                              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                            >
                              <Users size={12} />
                              {t('inbox.view_staff')}
                            </button>
                          )}
                          {notif.relatedEntityType === 'STUDENT' && notif.relatedEntityIds?.[0] && (
                            <button
                              onClick={() => setViewStudentId(notif.relatedEntityIds![0])}
                              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                            >
                              <GraduationCap size={12} />
                              {t('inbox.view_student')}
                            </button>
                          )}
                        </div>

                        {/* Inline Conflict Resolution Panel */}
                        {notif.relatedEntityType === 'ROOM_CONFLICT' && expandedItems.has(notif.id) && notif.relatedEntityIds && (() => {
                          const evA = events.find(e => e.id === notif.relatedEntityIds![0]);
                          const evB = events.find(e => e.id === notif.relatedEntityIds![1]);
                          if (!evA || !evB) return (
                            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-400">
                              {t('inbox.events_not_found') || 'One or both events no longer exist.'}
                            </div>
                          );
                          return (
                            <ConflictResolutionPanel
                              eventA={evA}
                              eventB={evB}
                              rooms={rooms}
                              teachers={teachers}
                              settings={settings}
                              onChangeRoom={handleChangeRoom}
                              onCancelEvent={handleCancelEvent}
                              onDismiss={() => handleMarkDone(notif.id)}
                              onReschedule={(ev) => setRescheduleEvent(ev)}
                            />
                          );
                        })()}
                      </div>
                      {!isDone && (
                        <button
                          onClick={() => handleMarkDone(notif.id)}
                          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          <XCircle size={13} />
                          {t('inbox.dismiss') || 'Dismiss'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              }))
            }
        </div>
          </>
        )}
      </div>

      {/* Teacher Detail Modal */}
      {viewTeacherId && (() => {
        const teacher = teachers.find(t => t.id === viewTeacherId);
        if (!teacher) return null;
        return (
          <Modal
            isOpen={true}
            onClose={() => setViewTeacherId(null)}
            title={teacher.fullName}
            maxWidth="max-w-lg"
            isDirty={false}
            footerContent={
              <div className="flex justify-end gap-2 w-full">
                <button onClick={() => setViewTeacherId(null)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm">
                  {t('btn.close') || 'Close'}
                </button>
                {onNavigateToStaff && (
                  <button onClick={() => { const id = viewTeacherId; setViewTeacherId(null); onNavigateToStaff(id); }}
                    className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg text-sm font-medium flex items-center gap-1.5">
                    <ExternalLink size={14} />
                    {t('inbox.go_to_full_profile')}
                  </button>
                )}
              </div>
            }
          >
            <div className="space-y-4">
              {/* Identity */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-lg">
                  {teacher.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{teacher.fullName}</h3>
                  {teacher.isArchived && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                      {t('teacher.archived') || 'Archived'}
                    </span>
                  )}
                </div>
              </div>
              {/* Contact */}
              {(teacher.email || teacher.phone) && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase text-slate-400 mb-1">{t('staff.section.contact')}</h4>
                  {teacher.email && <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><Mail size={14} className="text-slate-400" /> {teacher.email}</div>}
                  {teacher.phone && <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><Phone size={14} className="text-slate-400" /> {teacher.phone}</div>}
                </div>
              )}
              {/* Positions */}
              {teacher.positionAssignments && teacher.positionAssignments.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase text-slate-400 mb-1">{t('teacher.positions') || 'Positions'}</h4>
                  {teacher.positionAssignments.map((pa, i) => (
                    <div key={i} className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                      <span>{pa.positionName}</span>
                      <span className="text-xs text-slate-400">{pa.rateType}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Tags */}
              {teacher.tags && teacher.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {teacher.tags.map((tag, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </Modal>
        );
      })()}

      {/* Student Detail Modal */}
      {viewStudentId && (() => {
        const student = students.find(s => s.id === viewStudentId);
        if (!student) return null;
        return (
          <Modal
            isOpen={true}
            onClose={() => setViewStudentId(null)}
            title={student.fullName}
            maxWidth="max-w-lg"
            isDirty={false}
            footerContent={
              <div className="flex justify-end gap-2 w-full">
                <button onClick={() => setViewStudentId(null)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm">
                  {t('btn.close') || 'Close'}
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Identity */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold text-lg">
                  {student.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{student.fullName}</h3>
                  {student.dateOfBirth && <p className="text-xs text-slate-500 dark:text-slate-400">{student.dateOfBirth}</p>}
                </div>
              </div>
              {/* Contact */}
              {(student.email || student.phone) && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase text-slate-400 mb-1">{t('staff.section.contact')}</h4>
                  {student.email && <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><Mail size={14} className="text-slate-400" /> {student.email}</div>}
                  {student.phone && <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><Phone size={14} className="text-slate-400" /> {student.phone}</div>}
                </div>
              )}
              {/* Guardians */}
              {student.guardians && student.guardians.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase text-slate-400 mb-1">{t('student.guardians')}</h4>
                  {student.guardians.map((g, i) => (
                    <div key={i} className="text-sm text-slate-600 dark:text-slate-300">
                      {g.fullName} {g.relationship && <span className="text-xs text-slate-400">({g.relationship})</span>}
                      {g.phone && <span className="ms-2 text-xs text-slate-400">{g.phone}</span>}
                    </div>
                  ))}
                </div>
              )}
              {/* Notes */}
              {student.notes && student.notes.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase text-slate-400 mb-1">{t('staff.section.notes')}</h4>
                  {student.notes.slice(0, 3).map((note, i) => (
                    <p key={i} className="text-xs text-slate-600 dark:text-slate-300">{note.content}</p>
                  ))}
                </div>
              )}
            </div>
          </Modal>
        );
      })()}

      {/* Reschedule Event Modal */}
      {rescheduleEvent && (
        <Modal
          isOpen={true}
          onClose={() => setRescheduleEvent(null)}
          title={`${t('inbox.reschedule') || 'Reschedule'}: ${rescheduleEvent.name}`}
          maxWidth="max-w-4xl"
          isDirty={true}
          onSave={() => {
            rescheduleFormRef.current?.triggerSave();
            return false; // Don't auto-close — handleRescheduleSave closes it
          }}
        >
          <EventFormV2
            ref={rescheduleFormRef}
            activitiesV2={activitiesV2}
            l1Subcategories={l1Subs}
            l2Subcategories={l2Subs}
            staffMembers={staffMembersV2}
            teachingAssignments={teachingAssignmentsV2}
            orgRoles={orgRolesV2}
            rooms={rooms}
            settings={settings}
            editingEventId={rescheduleEvent.id}
            existingFormState={{
              name: rescheduleEvent.name,
              date: new Date(rescheduleEvent.start).toISOString().split('T')[0],
              startTime: (() => { const d = new Date(rescheduleEvent.start); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; })(),
              endTime: (() => { const d = new Date(rescheduleEvent.end); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; })(),
              roomId: rescheduleEvent.roomId || '',
              activityId: rescheduleEvent.activityId || '',
              isCanceled: rescheduleEvent.isCanceled,
              recurrenceRule: rescheduleEvent.recurrenceRule,
            }}
            existingParticipants={eventParticipantsV2.filter(p => p.eventId === rescheduleEvent.id)}
            onSave={handleRescheduleSave}
            t={t}
          />
        </Modal>
      )}
    </div>
  );
};
