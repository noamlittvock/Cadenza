import React, { useState, useMemo, useRef, useCallback } from 'react';
import { AdminInboxItem, AppSettings, Teacher, Student, CalendarEvent, Room } from '../types';
import { TRANSLATIONS } from '../constants';
import { Modal } from './Modal';
import { ConflictResolutionPanel } from './ConflictResolutionPanel';
import { EventFormV2, EventFormState, EventFormV2Handle } from './EventFormV2';
import { useSupabaseSync } from '../utils/useSupabaseSync';
import { buildUpdatedCalendarEvent, applyEventUpdate } from '../utils/saveEventV2';
import {
  ActivityV2, L1Subcategory, L2Subcategory, StaffMemberV2,
  TeachingAssignmentV2, OrgRoleV2,
  EventParticipant, V2_COLLECTIONS,
} from '../types/v2';
import {
  Menu, Inbox, CheckCircle2, Bell, ChevronDown, ChevronUp,
  Clock, Users, Eye, EyeOff, Calendar, HelpCircle, AlertTriangle, GraduationCap,
  ExternalLink, Mail, Phone, XCircle, ShieldCheck, Trash2
} from 'lucide-react';

interface Props {
  inboxItems: AdminInboxItem[];
  setInboxItems: React.Dispatch<React.SetStateAction<AdminInboxItem[]>>;
  teachers: Teacher[];
  students: Student[];
  events: CalendarEvent[];
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  rooms: Room[];
  settings: AppSettings;
  onMobileMenuOpen: () => void;
  onNavigateToEvent?: (eventIds: string[]) => void;
  onNavigateToStaff?: (staffId: string) => void;
}

export const AdminInbox: React.FC<Props> = ({
  inboxItems, setInboxItems, teachers, students, events, setEvents, rooms, settings, onMobileMenuOpen, onNavigateToEvent, onNavigateToStaff
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const [showResolvedNotifs, setShowResolvedNotifs] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [viewStudentId, setViewStudentId] = useState<string | null>(null);

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
                return (
                  <div
                    key={notif.id}
                    className={`bg-white dark:bg-slate-900 rounded-xl border shadow-sm p-4 transition-all ${isDone ? 'border-slate-200 dark:border-slate-800 opacity-60' : 'border-slate-200 dark:border-slate-800'}`}
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
