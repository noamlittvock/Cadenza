import React, { useState } from 'react';
import { CalendarSubscription, SubscriptionFilters, Teacher, Room, Activity, AppSettings, ListsState } from '../types';
import { generateId, TRANSLATIONS } from '../constants';
import { Plus, Copy, Check, XCircle, Rss, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Props {
  subscriptions: CalendarSubscription[];
  setSubscriptions: React.Dispatch<React.SetStateAction<CalendarSubscription[]>>;
  teachers: Teacher[];
  rooms: Room[];
  activities: Activity[];
  lists: ListsState;
  settings: AppSettings;
  embedded?: boolean;
}

const generateToken = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${generateId()}-${generateId()}-${generateId()}`;
};

const buildFeedUrl = (token: string): string => {
  return `${window.location.origin}/api/ical/${token}`;
};

export const CalendarSubscriptionManager: React.FC<Props> = ({
  subscriptions,
  setSubscriptions,
  teachers,
  rooms,
  activities,
  lists,
  settings,
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const { currentUser } = useAuth();

  const [isCreating, setIsCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formFilters, setFormFilters] = useState<SubscriptionFilters>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activeTeachers = teachers.filter(t => !t.isArchived);
  const activeActivities = activities.filter(a => !a.isArchived);

  const handleCreate = () => {
    if (!formName.trim()) return;

    const newSub: CalendarSubscription = {
      id: generateId(),
      orgId: '',
      name: formName.trim(),
      token: generateToken(),
      filters: { ...formFilters },
      createdBy: currentUser?.email || currentUser?.name || 'admin',
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    setSubscriptions(prev => [...prev, newSub]);
    setFormName('');
    setFormFilters({});
    setIsCreating(false);
  };

  const handleRevoke = (id: string) => {
    if (!window.confirm(t('subscriptions.revoke_confirm'))) return;
    setSubscriptions(prev => prev.map(s => s.id === id ? { ...s, isActive: false } : s));
  };

  const handleCopyUrl = async (sub: CalendarSubscription) => {
    const url = buildFeedUrl(sub.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(sub.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedId(sub.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const toggleFilterArray = (
    key: keyof SubscriptionFilters,
    value: string,
  ) => {
    setFormFilters(prev => {
      const arr = (prev[key] as string[] | undefined) || [];
      const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
      return { ...prev, [key]: next.length > 0 ? next : undefined };
    });
  };

  const getFilterSummary = (filters: SubscriptionFilters): string => {
    const parts: string[] = [];
    if (filters.staffMemberIds?.length) {
      const names = filters.staffMemberIds
        .map(id => teachers.find(t => t.id === id)?.fullName)
        .filter(Boolean);
      parts.push(`${t('subscriptions.filters_staff')}: ${names.join(', ')}`);
    }
    if (filters.tags?.length) {
      parts.push(`${t('subscriptions.filters_tags')}: ${filters.tags.join(', ')}`);
    }
    if (filters.positionTitles?.length) {
      parts.push(`${t('subscriptions.filters_positions')}: ${filters.positionTitles.join(', ')}`);
    }
    if (filters.roomIds?.length) {
      const names = filters.roomIds
        .map(id => rooms.find(r => r.id === id)?.name)
        .filter(Boolean);
      parts.push(`${t('subscriptions.filters_rooms')}: ${names.join(', ')}`);
    }
    if (filters.activityIds?.length) {
      const names = filters.activityIds
        .map(id => activities.find(a => a.id === id)?.name)
        .filter(Boolean);
      parts.push(`${t('subscriptions.filters_activities')}: ${names.join(', ')}`);
    }
    return parts.length > 0 ? parts.join(' | ') : t('subscriptions.no_filters');
  };

  const hasFilters = (filters: SubscriptionFilters): boolean => {
    return !!(
      filters.staffMemberIds?.length ||
      filters.tags?.length ||
      filters.positionTitles?.length ||
      filters.roomIds?.length ||
      filters.activityIds?.length
    );
  };

  // Sort: active first, then by createdAt descending
  const sortedSubscriptions = [...subscriptions].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Rss size={24} className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {t('subscriptions.title')}
            </h2>
          </div>
          {!isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold"
            >
              <Plus size={16} />
              {t('subscriptions.create')}
            </button>
          )}
        </div>

        {/* Create Form */}
        {isCreating && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-6 shadow-sm">
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('subscriptions.name')}
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder={t('subscriptions.name_placeholder')}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* Filters */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {t('subscriptions.filters')}
                </label>
                <div className="space-y-3">
                  {/* Staff Members */}
                  {activeTeachers.length > 0 && (
                    <FilterSection
                      label={t('subscriptions.filters_staff')}
                      options={activeTeachers.map(t => ({ value: t.id, label: t.fullName }))}
                      selected={formFilters.staffMemberIds || []}
                      onToggle={v => toggleFilterArray('staffMemberIds', v)}
                    />
                  )}

                  {/* Tags */}
                  {lists.tags.length > 0 && (
                    <FilterSection
                      label={t('subscriptions.filters_tags')}
                      options={lists.tags.map(tag => ({ value: tag, label: tag }))}
                      selected={formFilters.tags || []}
                      onToggle={v => toggleFilterArray('tags', v)}
                    />
                  )}

                  {/* Position Titles */}
                  {lists.positions.length > 0 && (
                    <FilterSection
                      label={t('subscriptions.filters_positions')}
                      options={lists.positions.map(p => ({ value: p, label: p }))}
                      selected={formFilters.positionTitles || []}
                      onToggle={v => toggleFilterArray('positionTitles', v)}
                    />
                  )}

                  {/* Rooms */}
                  {rooms.length > 0 && (
                    <FilterSection
                      label={t('subscriptions.filters_rooms')}
                      options={rooms.map(r => ({ value: r.id, label: r.name }))}
                      selected={formFilters.roomIds || []}
                      onToggle={v => toggleFilterArray('roomIds', v)}
                    />
                  )}

                  {/* Activities */}
                  {activeActivities.length > 0 && (
                    <FilterSection
                      label={t('subscriptions.filters_activities')}
                      options={activeActivities.map(a => ({ value: a.id, label: a.name }))}
                      selected={formFilters.activityIds || []}
                      onToggle={v => toggleFilterArray('activityIds', v)}
                    />
                  )}
                </div>

                {!hasFilters(formFilters) && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 italic">
                    {t('subscriptions.no_filters')}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleCreate}
                  disabled={!formName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-semibold"
                >
                  {t('subscriptions.save')}
                </button>
                <button
                  onClick={() => { setIsCreating(false); setFormName(''); setFormFilters({}); }}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-sm font-semibold"
                >
                  {t('subscriptions.cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Subscription List */}
        {sortedSubscriptions.length === 0 ? (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            <Rss size={48} className="mx-auto mb-4 opacity-30" />
            <p>{t('subscriptions.empty')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedSubscriptions.map(sub => (
              <div
                key={sub.id}
                className={`bg-white dark:bg-slate-800 border rounded-xl p-4 shadow-sm transition-colors ${
                  sub.isActive
                    ? 'border-slate-200 dark:border-slate-700'
                    : 'border-slate-200 dark:border-slate-700 opacity-60'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Rss size={18} className={sub.isActive ? 'text-green-500' : 'text-slate-400'} />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-white truncate">{sub.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {getFilterSummary(sub.filters)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Status Badge */}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      sub.isActive
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {sub.isActive ? t('subscriptions.status_active') : t('subscriptions.status_revoked')}
                    </span>

                    {/* Expand/Collapse */}
                    <button
                      onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      {expandedId === sub.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedId === sub.id && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-3">
                    {/* Feed URL */}
                    {sub.isActive && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                          {t('subscriptions.feed_url_label')}
                        </label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-xs bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg truncate font-mono">
                            {buildFeedUrl(sub.token)}
                          </code>
                          <button
                            onClick={() => handleCopyUrl(sub)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-xs font-semibold flex-shrink-0"
                          >
                            {copiedId === sub.id ? <Check size={14} /> : <Copy size={14} />}
                            {copiedId === sub.id ? t('subscriptions.copied') : t('subscriptions.copy_url')}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        {t('subscriptions.created_at')}: {new Date(sub.createdAt).toLocaleDateString(settings.language)}
                      </span>
                      <span>
                        {t('subscriptions.created_by')}: {sub.createdBy}
                      </span>
                    </div>

                    {/* Revoke Button */}
                    {sub.isActive && (
                      <button
                        onClick={() => handleRevoke(sub.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-xs font-semibold"
                      >
                        <XCircle size={14} />
                        {t('subscriptions.revoke')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Filter Section Sub-component ---

interface FilterSectionProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}

const FilterSection: React.FC<FilterSectionProps> = ({ label, options, selected, onToggle }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
      >
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
          {selected.length > 0 && (
            <span className="ml-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
              ({selected.length})
            </span>
          )}
        </span>
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {isOpen && (
        <div className="px-3 py-2 flex flex-wrap gap-2 max-h-40 overflow-y-auto">
          {options.map(opt => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onToggle(opt.value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-600'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
