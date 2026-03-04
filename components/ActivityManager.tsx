import React, { useState } from 'react';
import { Activity, Subcategory, ActivityType, AppSettings } from '../types';
import { generateId, TRANSLATIONS } from '../constants';
import { Plus, Edit2, Archive, RotateCcw, Layers, Eye, EyeOff, Menu, LayoutGrid, List } from 'lucide-react';
import { Modal } from './Modal';

interface Props {
  activities: Activity[];
  setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
  settings: AppSettings;
  onMobileMenuOpen?: () => void;
  embedded?: boolean;
}

export const ActivityManager: React.FC<Props> = ({ activities, setActivities, settings, onMobileMenuOpen, embedded = false }) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Activity>>({});
  const [initialFormData, setInitialFormData] = useState<Partial<Activity>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [subcategoryInput, setSubcategoryInput] = useState('');

  const handleOpenModal = (activity?: Activity) => {
    if (activity) {
      setEditingId(activity.id);
      const data = { ...activity, subcategories: [...activity.subcategories] };
      setFormData(data);
      setInitialFormData(JSON.parse(JSON.stringify(data)));
    } else {
      setEditingId(null);
      const data: Partial<Activity> = {
        name: '',
        type: 'INSTRUCTIONAL' as ActivityType,
        subcategories: [],
      };
      setFormData(data);
      setInitialFormData(JSON.parse(JSON.stringify(data)));
    }
    setSubcategoryInput('');
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) return;

    const now = new Date().toISOString();

    if (editingId) {
      setActivities(prev => prev.map(a => a.id === editingId ? {
        ...a,
        name: formData.name!.trim(),
        type: formData.type || 'INSTRUCTIONAL',
        subcategories: formData.subcategories || [],
        updatedAt: now,
      } as Activity : a));
    } else {
      const newActivity: Activity = {
        id: generateId(),
        orgId: '',
        name: formData.name!.trim(),
        type: formData.type || 'INSTRUCTIONAL',
        subcategories: formData.subcategories || [],
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      };
      setActivities(prev => [...prev, newActivity]);
    }
    setIsModalOpen(false);
  };

  const handleArchive = (id: string) => {
    if (window.confirm(t('activities.confirm_archive'))) {
      const now = new Date().toISOString();
      setActivities(prev => prev.map(a => a.id === id ? { ...a, isArchived: true, updatedAt: now } : a));
    }
  };

  const handleRestore = (id: string) => {
    const now = new Date().toISOString();
    setActivities(prev => prev.map(a => a.id === id ? { ...a, isArchived: false, updatedAt: now } : a));
  };

  const addSubcategory = () => {
    const name = subcategoryInput.trim();
    if (!name) return;

    const exists = (formData.subcategories || []).some(
      s => s.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      alert(t('activities.duplicate_subcategory'));
      return;
    }

    if (!window.confirm(t('activities.confirm_add_subcategory').replace('{name}', name))) {
      return;
    }

    const newSub: Subcategory = {
      id: generateId(),
      name,
      isArchived: false,
    };
    setFormData(prev => ({
      ...prev,
      subcategories: [...(prev.subcategories || []), newSub],
    }));
    setSubcategoryInput('');
  };

  const archiveSubcategory = (subId: string) => {
    if (window.confirm(t('activities.confirm_archive_sub'))) {
      setFormData(prev => ({
        ...prev,
        subcategories: (prev.subcategories || []).map(s =>
          s.id === subId ? { ...s, isArchived: true } : s
        ),
      }));
    }
  };

  const restoreSubcategory = (subId: string) => {
    setFormData(prev => ({
      ...prev,
      subcategories: (prev.subcategories || []).map(s =>
        s.id === subId ? { ...s, isArchived: false } : s
      ),
    }));
  };

  const visibleActivities = activities.filter(a => showArchived || !a.isArchived);

  return (
    <div className={`${embedded ? 'h-full overflow-auto' : ''} p-8 max-w-6xl mx-auto`}>
      {!embedded && (
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            {onMobileMenuOpen && (
              <button
                onClick={onMobileMenuOpen}
                className="p-2 -ms-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors lg:hidden"
              >
                <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
              </button>
            )}
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{t('activities.title')}</h2>
              <p className="text-slate-500 dark:text-slate-400">{t('activities.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${showArchived
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
            >
              {showArchived ? <EyeOff size={16} /> : <Eye size={16} />}
              {t('activities.show_archived')}
            </button>
            <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <button onClick={() => setViewMode('grid')} className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title={t('view.grid')}>
                <LayoutGrid size={16} />
              </button>
              <button onClick={() => setViewMode('list')} className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title={t('view.list')}>
                <List size={16} />
              </button>
            </div>
            <button
              onClick={() => handleOpenModal()}
              className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-4 py-2 rounded-lg flex items-center"
            >
              <Plus size={18} className="me-2" /> {t('activities.add')}
            </button>
          </div>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end gap-3 mb-6">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${showArchived
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
              : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
          >
            {showArchived ? <EyeOff size={16} /> : <Eye size={16} />}
            {t('activities.show_archived')}
          </button>
          <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('grid')} className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title={t('view.grid')}>
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setViewMode('list')} className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title={t('view.list')}>
              <List size={16} />
            </button>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-4 py-2 rounded-lg flex items-center"
          >
            <Plus size={18} className="me-2" /> {t('activities.add')}
          </button>
        </div>
      )}

      {visibleActivities.length === 0 ? (
        <div className="py-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          {t('activities.empty_state')}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleActivities.map(activity => {
            const activeSubs = activity.subcategories.filter(s => !s.isArchived);
            const archivedSubs = activity.subcategories.filter(s => s.isArchived);

            return (
              <div
                key={activity.id}
                className={`bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col hover:shadow-md transition-shadow ${activity.isArchived ? 'opacity-60' : ''}`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-3 rtl:space-x-reverse">
                    <div className={`p-2 rounded-lg ${activity.type === 'INSTRUCTIONAL'
                      ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300'
                      : 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300'
                      }`}>
                      <Layers size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 dark:text-white">{activity.name}</h3>
                      <span className={`text-xs font-semibold uppercase tracking-wider ${activity.type === 'INSTRUCTIONAL'
                        ? 'text-blue-500 dark:text-blue-400'
                        : 'text-amber-500 dark:text-amber-400'
                        }`}>
                        {t(`activities.type_${activity.type.toLowerCase()}`)}
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-2 rtl:space-x-reverse">
                    {!activity.isArchived && (
                      <button onClick={() => handleOpenModal(activity)} className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">
                        <Edit2 size={16} />
                      </button>
                    )}
                    {activity.isArchived ? (
                      <button onClick={() => handleRestore(activity.id)} className="text-slate-400 hover:text-green-600 dark:hover:text-green-400" title={t('activities.restore')}>
                        <RotateCcw size={16} />
                      </button>
                    ) : (
                      <button onClick={() => handleArchive(activity.id)} className="text-slate-400 hover:text-amber-600 dark:hover:text-amber-400" title={t('activities.archive')}>
                        <Archive size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {activity.isArchived && (
                  <span className="inline-flex items-center self-start px-2 py-0.5 mb-2 rounded text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                    {t('activities.archived_badge')}
                  </span>
                )}

                <div className="flex-1">
                  <h4 className="text-xs font-semibold uppercase text-slate-400 mb-2">
                    {t('activities.subcategories')} ({activeSubs.length})
                  </h4>
                  {activeSubs.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {activeSubs.map(sub => (
                        <span key={sub.id} className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700">
                          {sub.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 italic">{t('activities.no_subcategories')}</p>
                  )}
                  {showArchived && archivedSubs.length > 0 && (
                    <div className="mt-2">
                      <h4 className="text-xs font-semibold uppercase text-amber-400 mb-1">
                        {t('activities.archived_badge')}
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {archivedSubs.map(sub => (
                          <span key={sub.id} className="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-lg text-xs font-medium border border-amber-200 dark:border-amber-800 line-through opacity-60">
                            {sub.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <th className="text-start px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">{t('activities.name')}</th>
                <th className="text-start px-4 py-2 font-semibold text-slate-600 dark:text-slate-300 hidden md:table-cell">{t('activities.type')}</th>
                <th className="text-start px-4 py-2 font-semibold text-slate-600 dark:text-slate-300 hidden lg:table-cell">{t('activities.subcategories')}</th>
                <th className="text-end px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">{t('btn.edit')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleActivities.map(activity => {
                const activeSubs = activity.subcategories.filter(s => !s.isArchived);
                return (
                  <tr key={activity.id} className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${activity.isArchived ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${activity.type === 'INSTRUCTIONAL'
                          ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300'
                          : 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300'
                          }`}>
                          <Layers size={16} />
                        </div>
                        <div>
                          <span className="font-medium text-slate-900 dark:text-white">{activity.name}</span>
                          {activity.isArchived && <span className="ms-2 text-xs text-amber-600 dark:text-amber-400">{t('activities.archived_badge')}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`text-xs font-semibold uppercase ${activity.type === 'INSTRUCTIONAL' ? 'text-blue-500 dark:text-blue-400' : 'text-amber-500 dark:text-amber-400'}`}>
                        {t(`activities.type_${activity.type.toLowerCase()}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden lg:table-cell">
                      <span className="text-xs">{activeSubs.length} {t('activities.subcategories').toLowerCase()}</span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center justify-end gap-1">
                        {!activity.isArchived && (
                          <button onClick={() => handleOpenModal(activity)} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title={t('btn.edit')}>
                            <Edit2 size={14} />
                          </button>
                        )}
                        {activity.isArchived ? (
                          <button onClick={() => handleRestore(activity.id)} className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors" title={t('activities.restore')}>
                            <RotateCcw size={14} />
                          </button>
                        ) : (
                          <button onClick={() => handleArchive(activity.id)} className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors" title={t('activities.archive')}>
                            <Archive size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? t('activities.edit') : t('activities.add_new')}
        isDirty={JSON.stringify(formData) !== JSON.stringify(initialFormData)}
        onSave={(e?: React.FormEvent) => handleSubmit(e || {} as React.FormEvent)}
        t={t}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Activity Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('activities.name')}
            </label>
            <input
              required
              type="text"
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.name || ''}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('activities.name_placeholder')}
            />
          </div>

          {/* Activity Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('activities.type')}
            </label>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              {(['INSTRUCTIONAL', 'OPERATIONAL'] as ActivityType[]).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData({ ...formData, type })}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${formData.type === type
                    ? type === 'INSTRUCTIONAL'
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-amber-500 text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                >
                  {t(`activities.type_${type.toLowerCase()}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Subcategories */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('activities.subcategories')}
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={subcategoryInput}
                onChange={e => setSubcategoryInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSubcategory())}
                placeholder={t('activities.add_subcategory_placeholder')}
                className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={addSubcategory}
                disabled={!subcategoryInput.trim()}
                className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 shadow-cadenza-soft px-3 py-2 rounded-lg"
              >
                <Plus size={20} />
              </button>
            </div>

            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pe-1 custom-scrollbar">
              {(formData.subcategories || []).filter(s => !s.isArchived).map(sub => (
                <div key={sub.id} className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-700 group">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{sub.name}</span>
                  <button
                    type="button"
                    onClick={() => archiveSubcategory(sub.id)}
                    className="text-slate-400 hover:text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={t('activities.archive')}
                  >
                    <Archive size={14} />
                  </button>
                </div>
              ))}
              {(formData.subcategories || []).filter(s => s.isArchived).length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <h5 className="text-xs font-semibold uppercase text-amber-500 mb-1.5">{t('activities.archived_badge')}</h5>
                  {(formData.subcategories || []).filter(s => s.isArchived).map(sub => (
                    <div key={sub.id} className="flex justify-between items-center bg-amber-50 dark:bg-amber-900/10 px-3 py-2 rounded-lg border border-amber-100 dark:border-amber-900/30 mb-1.5 group opacity-60">
                      <span className="text-sm font-medium text-amber-700 dark:text-amber-400 line-through">{sub.name}</span>
                      <button
                        type="button"
                        onClick={() => restoreSubcategory(sub.id)}
                        className="text-amber-400 hover:text-green-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title={t('activities.restore')}
                      >
                        <RotateCcw size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {(formData.subcategories || []).length === 0 && (
                <p className="text-sm text-slate-400 italic py-2 text-center">{t('activities.no_subcategories')}</p>
              )}
            </div>
          </div>

          {/* Form actions */}
          <div className="flex justify-end space-x-3 rtl:space-x-reverse mt-6">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              {t('btn.cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg"
            >
              {t('btn.save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
