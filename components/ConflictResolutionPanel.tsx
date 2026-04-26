import React, { useState } from 'react';
import { CalendarEvent, Room, Teacher, AppSettings } from '../types';
import { ArrowRightLeft, Ban, Clock, MapPin, User, ChevronDown, AlertTriangle } from 'lucide-react';
import { TRANSLATIONS } from '../constants';

interface ConflictResolutionPanelProps {
  eventA: CalendarEvent;
  eventB: CalendarEvent;
  rooms: Room[];
  teachers: Teacher[];
  settings: AppSettings;
  onChangeRoom: (eventId: string, newRoomId: string) => void;
  onCancelEvent: (eventId: string) => void;
  onDismiss: () => void;
  onReschedule: (event: CalendarEvent) => void;
}

type RecurrenceScope = 'THIS' | 'ALL';

interface RecurrencePrompt {
  action: 'changeRoom' | 'cancel';
  eventId: string;
  newRoomId?: string;
}

export const ConflictResolutionPanel: React.FC<ConflictResolutionPanelProps> = ({
  eventA, eventB, rooms, teachers, settings, onChangeRoom, onCancelEvent, onDismiss, onReschedule
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const [recurrencePrompt, setRecurrencePrompt] = useState<RecurrencePrompt | null>(null);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    if (settings.timeFormat === '24h') {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const isRecurring = (ev: CalendarEvent) => !!ev.recurrenceRule || !!ev.recurrenceId;

  const handleChangeRoom = (eventId: string, newRoomId: string) => {
    const ev = eventId === eventA.id ? eventA : eventB;
    if (isRecurring(ev)) {
      setRecurrencePrompt({ action: 'changeRoom', eventId, newRoomId });
    } else {
      onChangeRoom(eventId, newRoomId);
    }
  };

  const handleCancel = (eventId: string) => {
    const ev = eventId === eventA.id ? eventA : eventB;
    if (isRecurring(ev)) {
      setRecurrencePrompt({ action: 'cancel', eventId });
    } else {
      onCancelEvent(eventId);
    }
  };

  const confirmRecurrence = (scope: RecurrenceScope) => {
    if (!recurrencePrompt) return;
    if (scope === 'THIS') {
      // For "this occurrence only", the parent handles creating an exception
      if (recurrencePrompt.action === 'changeRoom' && recurrencePrompt.newRoomId) {
        onChangeRoom(recurrencePrompt.eventId, recurrencePrompt.newRoomId);
      } else if (recurrencePrompt.action === 'cancel') {
        onCancelEvent(recurrencePrompt.eventId);
      }
    } else {
      // "All events in series" — apply to the parent/root event
      const ev = recurrencePrompt.eventId === eventA.id ? eventA : eventB;
      const rootId = ev.recurrenceId || ev.id;
      if (recurrencePrompt.action === 'changeRoom' && recurrencePrompt.newRoomId) {
        onChangeRoom(rootId, recurrencePrompt.newRoomId);
      } else if (recurrencePrompt.action === 'cancel') {
        onCancelEvent(rootId);
      }
    }
    setRecurrencePrompt(null);
  };

  const renderEventCard = (ev: CalendarEvent) => {
    const teacher = teachers.find(t => t.id === ev.teacherId);
    const room = rooms.find(r => r.id === ev.roomId);
    const activeRooms = rooms.filter(r => !r.isArchived);

    return (
      <div className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <h5 className="font-semibold text-sm text-slate-800 dark:text-white truncate">{ev.name}</h5>
          {isRecurring(ev) && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex-shrink-0">
              {t('inbox.recurring') || 'Recurring'}
            </span>
          )}
        </div>

        {teacher && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <User size={11} />
            {teacher.fullName}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Clock size={11} />
          {formatTime(ev.start)} – {formatTime(ev.end)}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <MapPin size={11} />
          {room?.name || t('inbox.no_room') || 'No room'}
        </div>

        {/* Change Room dropdown */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
          <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase">
            {t('inbox.change_room') || 'Change Room'}
          </label>
          <div className="relative">
            <select
              value={ev.roomId || ''}
              onChange={(e) => handleChangeRoom(ev.id, e.target.value)}
              className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pr-8 text-slate-700 dark:text-slate-300 appearance-none cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
            >
              {activeRooms.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleCancel(ev.id)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            >
              <Ban size={12} />
              {t('inbox.cancel_event') || 'Cancel Event'}
            </button>
            <button
              onClick={() => onReschedule(ev)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              <ArrowRightLeft size={12} />
              {t('inbox.reschedule') || 'Reschedule'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
      <div className="flex flex-col sm:flex-row gap-3">
        {renderEventCard(eventA)}
        <div className="hidden sm:flex items-center">
          <AlertTriangle size={16} className="text-amber-500" />
        </div>
        {renderEventCard(eventB)}
      </div>

      {/* Recurrence scope prompt */}
      {recurrencePrompt && (
        <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
            {t('inbox.recurrence_prompt') || 'This is a recurring event. Apply to:'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => confirmRecurrence('THIS')}
              className="flex-1 px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors text-amber-800 dark:text-amber-300"
            >
              {t('inbox.this_occurrence') || 'This occurrence only'}
            </button>
            <button
              onClick={() => confirmRecurrence('ALL')}
              className="flex-1 px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors text-amber-800 dark:text-amber-300"
            >
              {t('inbox.all_in_series') || 'All events in series'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
