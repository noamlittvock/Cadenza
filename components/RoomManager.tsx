import React, { useState } from 'react';
import { Room, AppSettings } from '../types';
import { generateId } from '../constants';
import { Plus, Edit2, Trash2, Home, Menu } from 'lucide-react';

import { TRANSLATIONS } from '../constants';
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

  const handleOpenModal = (room?: Room) => {
    if (room) {
      setEditingId(room.id);
      setFormData(room);
    } else {
      setEditingId(null);
      setFormData({});
    }
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure? Scheduled events will flag warnings.')) {
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
              <p className="text-slate-500 dark:text-slate-400">Configure spaces and equipment itineraries.</p>
            </div>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center shadow-sm"
          >
            <Plus size={18} className="me-2" /> {t('room.add')}
          </button>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end mb-6">
          <button
            onClick={() => handleOpenModal()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center shadow-sm"
          >
            <Plus size={18} className="me-2" /> {t('room.add')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rooms.map(room => (
          <div key={room.id} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-3 rtl:space-x-reverse">
                <div className="bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-lg text-indigo-600 dark:text-indigo-300">
                  <Home size={20} />
                </div>
                <h3 className="font-bold text-lg text-slate-800 dark:text-white">{room.name}</h3>
              </div>
              <div className="flex space-x-2 rtl:space-x-reverse">
                <button onClick={() => handleOpenModal(room)} className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">
                  <Edit2 size={16} />
                </button>
                <button onClick={() => handleDelete(room.id)} className="text-slate-400 hover:text-red-600">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-semibold uppercase text-slate-400 mb-2">{t('room.itinerary')} & Equipment</h4>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {room.itinerary || t('room.no_details')}
              </p>
            </div>
          </div>
        ))}
        {rooms.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
            No rooms configured. Add one to get started.
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">{editingId ? t('room.edit') : t('room.add_new')}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('label.room_name')}</label>
                <input
                  required
                  type="text"
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Studio A"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('room.itinerary_desc')}</label>
                <textarea
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none h-32"
                  value={formData.itinerary || ''}
                  onChange={e => setFormData({ ...formData, itinerary: e.target.value })}
                  placeholder="Details about equipment, capacity, etc."
                />
              </div>
              <div className="flex justify-end space-x-3 rtl:space-x-reverse mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
