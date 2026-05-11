import React, { useCallback, useMemo, useState } from 'react';
import { Room, AppSettings } from '../types';
import { generateId } from '../constants';
import { Plus, Edit2, Trash2, Home, Menu, LayoutGrid, List, Archive, RotateCcw, ArrowUp, ArrowDown, Table2, ChevronRight } from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import { Modal } from './Modal';
import { useListStyle } from '../utils/useListStyle';
import { useSortState } from '../utils/useSortState';
import { ImportExportDropdown } from './ImportExportDropdown';
interface Props {
  rooms: Room[];
  setRooms: React.Dispatch<React.SetStateAction<Room[]>>;
  settings?: AppSettings;
  onMobileMenuOpen?: () => void;
  embedded?: boolean;
}

export const RoomManager: React.FC<Props> = ({ rooms, setRooms, settings, onMobileMenuOpen, embedded = false }) => {
  const t = (key: string) => (settings && TRANSLATIONS[settings.language]?.[key]) || TRANSLATIONS['en-US'][key] || key;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Room>>({});
  const [initialFormData, setInitialFormData] = useState<Partial<Room>>({});
  const [viewMode, setViewMode] = useListStyle(['table', 'grid', 'list']);
  const [showArchived, setShowArchived] = useState(false);
  const { sortKey, sortDirection, toggleSort } = useSortState<'name' | 'itinerary'>('name');

  const handleOpenModal = (room?: Room) => {
    if (room) {
      setEditingId(room.id);
      setFormData(room);
      setInitialFormData(room);
    } else {
      setEditingId(null);
      setFormData({});
      setInitialFormData({});
    }
    setIsModalOpen(true);
  };

  const handleArchive = (id: string) => {
    if (window.confirm(t('room.confirm_archive'))) {
      setRooms(prev => prev.map(r => r.id === id ? { ...r, isArchived: true } : r));
    }
  };

  const handleRestore = (id: string) => {
    setRooms(prev => prev.map(r => r.id === id ? { ...r, isArchived: false } : r));
  };

  const handlePermanentDelete = (id: string) => {
    if (window.confirm(t('room.confirm_permanent_delete'))) {
      setRooms(prev => prev.filter(r => r.id !== id));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    if (editingId) {
      setRooms(prev => prev.map(r => r.id === editingId ? { ...r, ...formData } as Room : r));
    } else {
      setRooms(prev => [...prev, {
        id: generateId(),
        name: formData.name!,
        itinerary: formData.itinerary || ''
      }]);
    }
    setIsModalOpen(false);
  };

  const filteredRooms = useMemo(() => {
    const base = rooms.filter(r => {
      if (!showArchived && r.isArchived) return false;
      if (showArchived && !r.isArchived) return false;
      return true;
    });
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      const av = (sortKey === 'name' ? a.name : (a.itinerary || '')).toLocaleLowerCase();
      const bv = (sortKey === 'name' ? b.name : (b.itinerary || '')).toLocaleLowerCase();
      return av.localeCompare(bv) * dir;
    });
  }, [rooms, showArchived, sortKey, sortDirection]);

  const csvExistingData = useMemo<Record<string, string>[]>(
    () => rooms.map(r => ({ name: r.name, itinerary: r.itinerary || '' })),
    [rooms],
  );
  const csvDuplicateKeys = useMemo(
    () => new Set(rooms.map(r => r.name.trim().toLowerCase())),
    [rooms],
  );

  const handleRoomImportComplete = useCallback((rows: Record<string, string>[]) => {
    const existing = new Map<string, Room>(rooms.map(r => [r.name.trim().toLowerCase(), r]));
    const additions: Room[] = [];
    const updates = new Map<string, Partial<Room>>();
    rows.forEach(row => {
      const name = (row['name'] || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      const itinerary = row['itinerary'] || '';
      if (existing.has(key)) {
        updates.set(existing.get(key)!.id, { name, itinerary });
      } else {
        additions.push({ id: generateId(), name, itinerary });
      }
    });
    setRooms(prev => [
      ...prev.map(r => updates.has(r.id) ? { ...r, ...updates.get(r.id)! } : r),
      ...additions,
    ]);
  }, [rooms, setRooms]);

  return (
    <div className={`${embedded ? 'h-full overflow-auto' : ''} p-8 max-w-6xl mx-auto`}>
      {!embedded && (
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            {onMobileMenuOpen && (
              <button
                onClick={onMobileMenuOpen}
                className="p-2 -ms-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors lg:hidden"
                title={t('tooltip.open_menu')}
              >
                <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
              </button>
            )}
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{t('room.title')}</h2>
              <p className="text-slate-500 dark:text-slate-400">{t('room.subtitle')}</p>
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
              <Archive size={16} />
              {t('room.show_archived')}
            </button>
            <button
              onClick={() => toggleSort('name')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title={t('sort.alphabetical') || 'Sort A–Z'}
            >
              {sortKey === 'name' && sortDirection === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
              <span className="text-xs font-medium">{sortDirection === 'asc' ? 'A→Z' : 'Z→A'}</span>
            </button>
            <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <button onClick={() => setViewMode('grid')} className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title={t('view.grid')}>
                <LayoutGrid size={16} />
              </button>
              <button onClick={() => setViewMode('list')} className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title={t('view.list')}>
                <List size={16} />
              </button>
              <button onClick={() => setViewMode('table')} className={`hidden md:block p-2 transition-colors ${viewMode === 'table' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title={t('view.table')}>
                <Table2 size={16} />
              </button>
            </div>
            {settings && (
              <ImportExportDropdown
                entityType="ROOM"
                existingData={csvExistingData}
                existingDuplicateKeys={csvDuplicateKeys}
                dependencyMaps={{ activityByName: {}, l2ByName: {}, staffByEmail: {}, studentByName: {} }}
                settings={settings}
                canWrite={true}
                onImportComplete={handleRoomImportComplete}
              />
            )}
            <button
              onClick={() => handleOpenModal()}
              className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-4 py-2 rounded-lg flex items-center "
            >
              <Plus size={18} className="me-2" /> {t('room.add')}
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
            <Archive size={16} />
            {t('room.show_archived')}
          </button>
          <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('grid')} className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title={t('view.grid')}>
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setViewMode('list')} className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title={t('view.list')}>
              <List size={16} />
            </button>
            <button onClick={() => setViewMode('table')} className={`hidden md:block p-2 transition-colors ${viewMode === 'table' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title={t('view.table')}>
              <Table2 size={16} />
            </button>
          </div>
          {settings && (
            <ImportExportDropdown
              entityType="ROOM"
              existingData={csvExistingData}
              existingDuplicateKeys={csvDuplicateKeys}
              dependencyMaps={{ activityByName: {}, l2ByName: {}, staffByEmail: {}, studentByName: {} }}
              settings={settings}
              canWrite={true}
              onImportComplete={handleRoomImportComplete}
            />
          )}
          <button
            onClick={() => handleOpenModal()}
            className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-4 py-2 rounded-lg flex items-center "
          >
            <Plus size={18} className="me-2" /> {t('room.add')}
          </button>
        </div>
      )}

      {filteredRooms.length === 0 ? (
        <div className="py-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          {t('room.empty_state')}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRooms.map(room => (
            <div key={room.id} className={`bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col hover:shadow-md transition-shadow ${room.isArchived ? 'opacity-60' : ''}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <div className="bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-lg text-indigo-600 dark:text-indigo-300">
                    <Home size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-slate-800 dark:text-white">{room.name}</h3>
                    {room.isArchived && <span className="text-xs text-amber-600 dark:text-amber-400">{t('room.archived_badge')}</span>}
                  </div>
                </div>
                <div className="flex space-x-2 rtl:space-x-reverse">
                  {!room.isArchived && (
                    <button onClick={() => handleOpenModal(room)} className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400" title={t('btn.edit')}>
                      <Edit2 size={16} />
                    </button>
                  )}
                  {room.isArchived ? (
                    <>
                      <button onClick={() => handleRestore(room.id)} className="text-slate-400 hover:text-green-600 dark:hover:text-green-400" title={t('room.restore')}>
                        <RotateCcw size={16} />
                      </button>
                      <button onClick={() => handlePermanentDelete(room.id)} className="text-slate-400 hover:text-red-600 dark:hover:text-red-400" title={t('room.permanent_delete')}>
                        <Trash2 size={16} />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => handleArchive(room.id)} className="text-slate-400 hover:text-amber-600 dark:hover:text-amber-400" title={t('room.archive')}>
                      <Archive size={16} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-semibold uppercase text-slate-400 mb-2">{t('room.itinerary_equipment')}</h4>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {room.itinerary || t('room.no_details')}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-1">
          {filteredRooms.map(room => (
            <button key={room.id} onClick={() => handleOpenModal(room)}
              className={`w-full text-start flex items-center gap-4 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors ${room.isArchived ? 'opacity-60' : ''}`}>
              <div className="bg-indigo-100 dark:bg-indigo-900/50 p-1.5 rounded-lg text-indigo-600 dark:text-indigo-300 shrink-0">
                <Home size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-slate-800 dark:text-slate-200">{room.name}</span>
                {room.itinerary && <span className="text-sm text-slate-500 dark:text-slate-400 ms-2 truncate">{room.itinerary}</span>}
              </div>
              {room.isArchived && (
                <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded">
                  {t('room.archived_badge')}
                </span>
              )}
              <ChevronRight size={16} className="text-slate-400 shrink-0" />
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 shadow-sm py-2 px-3 text-start text-slate-500 dark:text-slate-400 font-medium">
                  <button onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                    {t('label.room_name')}
                    {sortKey === 'name' && (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 shadow-sm py-2 px-3 text-start text-slate-500 dark:text-slate-400 font-medium hidden md:table-cell">
                  <button onClick={() => toggleSort('itinerary')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                    {t('room.itinerary_equipment')}
                    {sortKey === 'itinerary' && (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 shadow-sm py-2 px-3 text-end text-slate-500 dark:text-slate-400 font-medium">{t('btn.edit')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRooms.map(room => (
                <tr key={room.id} onClick={() => handleOpenModal(room)}
                  className={`border-b border-slate-100 dark:border-slate-800 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors ${room.isArchived ? 'opacity-60' : ''}`}>
                  <td className="py-2 px-3 text-start font-medium text-slate-800 dark:text-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="bg-indigo-100 dark:bg-indigo-900/50 p-1.5 rounded-lg text-indigo-600 dark:text-indigo-300">
                        <Home size={16} />
                      </div>
                      <span>{room.name}</span>
                      {room.isArchived && <span className="ms-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">{t('room.archived_badge')}</span>}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-start text-slate-600 dark:text-slate-400 hidden md:table-cell">
                    <span className="line-clamp-1">{room.itinerary || '—'}</span>
                  </td>
                  <td className="py-2 px-3 text-end" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {!room.isArchived && (
                        <button onClick={() => handleOpenModal(room)} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title={t('btn.edit')}>
                          <Edit2 size={14} />
                        </button>
                      )}
                      {room.isArchived ? (
                        <>
                          <button onClick={() => handleRestore(room.id)} className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors" title={t('room.restore')}>
                            <RotateCcw size={14} />
                          </button>
                          <button onClick={() => handlePermanentDelete(room.id)} className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title={t('room.permanent_delete')}>
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : (
                        <button onClick={() => handleArchive(room.id)} className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors" title={t('room.archive')}>
                          <Archive size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? t('room.edit') : t('room.add_new')}
        isDirty={JSON.stringify(formData) !== JSON.stringify(initialFormData)}
        onSave={(e?: React.FormEvent) => handleSubmit(e || {} as React.FormEvent)}
        t={t}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('label.room_name')}</label>
            <input
              required
              type="text"
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.name || ''}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('room.name_placeholder')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('room.itinerary_desc')}</label>
            <textarea
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none h-32"
              value={formData.itinerary || ''}
              onChange={e => setFormData({ ...formData, itinerary: e.target.value })}
              placeholder={t('room.details_placeholder')}
            />
          </div>
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
