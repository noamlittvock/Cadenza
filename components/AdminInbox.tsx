import React, { useState, useMemo } from 'react';
import { AdminInboxItem, AppSettings, Teacher, Student } from '../types';
import { TRANSLATIONS } from '../constants';
import {
  Menu, Inbox, CheckCircle2, Bell, ClipboardList, ChevronDown, ChevronUp,
  Clock, Users, Eye, EyeOff
} from 'lucide-react';

interface Props {
  inboxItems: AdminInboxItem[];
  setInboxItems: React.Dispatch<React.SetStateAction<AdminInboxItem[]>>;
  teachers: Teacher[];
  students: Student[];
  settings: AppSettings;
  onMobileMenuOpen: () => void;
}

type InboxTab = 'tasks' | 'notifications';

export const AdminInbox: React.FC<Props> = ({
  inboxItems, setInboxItems, teachers, students, settings, onMobileMenuOpen
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const [activeTab, setActiveTab] = useState<InboxTab>('tasks');
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const tasks = useMemo(() => {
    const items = inboxItems.filter(i => i.type === 'TASK');
    if (!showCompleted) return items.filter(i => i.status === 'OPEN');
    return items.sort((a, b) => {
      if (a.status === 'OPEN' && b.status !== 'OPEN') return -1;
      if (a.status !== 'OPEN' && b.status === 'OPEN') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [inboxItems, showCompleted]);

  const notifications = useMemo(() =>
    inboxItems
      .filter(i => i.type === 'NOTIFICATION')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [inboxItems]
  );

  const openTaskCount = useMemo(() =>
    inboxItems.filter(i => i.type === 'TASK' && i.status === 'OPEN').length,
    [inboxItems]
  );

  const handleMarkDone = (id: string) => {
    setInboxItems(prev => prev.map(item =>
      item.id === id
        ? { ...item, status: 'DONE' as const, markedDoneAt: new Date().toISOString() }
        : item
    ));
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

  return (
    <div className="h-full overflow-y-auto p-8 pb-20 custom-scrollbar">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onMobileMenuOpen} className="p-2 -ms-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors lg:hidden">
            <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Inbox size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{t('inbox.title')}</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">{t('inbox.subtitle')}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab('tasks')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'tasks' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              <ClipboardList size={15} />
              {t('inbox.tab_tasks')}
              {openTaskCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {openTaskCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'notifications' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              <Bell size={15} />
              {t('inbox.tab_notifications')}
            </button>
          </div>

          {activeTab === 'tasks' && (
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="ms-auto flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              {showCompleted ? <EyeOff size={13} /> : <Eye size={13} />}
              {showCompleted ? t('inbox.hide_completed') : t('inbox.show_completed')}
            </button>
          )}
        </div>

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
                <CheckCircle2 size={40} className="mx-auto text-green-400 mb-3" />
                <p className="text-slate-500 dark:text-slate-400 font-medium">{t('inbox.no_tasks')}</p>
              </div>
            ) : (
              tasks.map(task => {
                const isDone = task.status === 'DONE';
                const isExpanded = expandedItems.has(task.id);
                const studentNames = resolveStudentNames(task.relatedEntityIds);

                return (
                  <div
                    key={task.id}
                    className={`bg-white dark:bg-slate-900 rounded-xl border shadow-sm transition-all ${isDone ? 'border-slate-200 dark:border-slate-800 opacity-60' : 'border-amber-200 dark:border-amber-800/50 border-s-4 border-s-amber-400'}`}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isDone ? 'bg-green-100 dark:bg-green-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                          {isDone ? <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" /> : <ClipboardList size={16} className="text-amber-600 dark:text-amber-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className={`font-semibold text-sm ${isDone ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-800 dark:text-white'}`}>
                              {task.title}
                            </h4>
                            {isDone && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                                {t('inbox.task_done')}
                              </span>
                            )}
                          </div>
                          <p className={`text-sm ${isDone ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'}`}>
                            {task.message}
                          </p>

                          {/* Expandable student list */}
                          {studentNames.length > 0 && (
                            <button
                              onClick={() => toggleExpand(task.id)}
                              className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                            >
                              <Users size={12} />
                              {studentNames.length} student(s)
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          )}
                          {isExpanded && studentNames.length > 0 && (
                            <ul className="mt-2 ps-4 space-y-1">
                              {studentNames.map((name, i) => (
                                <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  {name}
                                </li>
                              ))}
                            </ul>
                          )}

                          <div className="flex items-center gap-3 mt-3">
                            <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                              <Clock size={11} />
                              {formatDate(task.createdAt)}
                            </span>
                            {isDone && task.markedDoneAt && (
                              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                {t('inbox.marked_done_by')}: {formatDate(task.markedDoneAt)}
                              </span>
                            )}
                          </div>
                        </div>

                        {!isDone && (
                          <button
                            onClick={() => handleMarkDone(task.id)}
                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                          >
                            <CheckCircle2 size={13} />
                            {t('inbox.mark_done')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-3">
            {notifications.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
                <Bell size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-500 dark:text-slate-400 font-medium">{t('inbox.no_notifications')}</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <Bell size={16} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm text-slate-800 dark:text-white mb-1">{notif.title}</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{notif.message}</p>
                      <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                        <Clock size={11} />
                        {formatDate(notif.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
