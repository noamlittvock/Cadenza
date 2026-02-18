import React, { useState } from 'react';
import { GanttBlock, CalendarEvent, AppSettings } from '../types';
import { generateId, COLORS, TRANSLATIONS, formatDate } from '../constants';
import { AlertOctagon, Plus, Trash2, AlertTriangle, CalendarRange, Edit2 } from 'lucide-react';

interface Props {
  blocks: GanttBlock[];
  setBlocks: React.Dispatch<React.SetStateAction<GanttBlock[]>>;
  events: CalendarEvent[];
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  settings: AppSettings;
}

export const GanttManager: React.FC<Props> = ({ blocks, setBlocks, events, setEvents, settings }) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const isRtl = settings.language === 'he-IL';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<GanttBlock>>({
    color: COLORS[0],
    isBlackout: false
  });

  // Blackout Logic: Apply to events in range (HIDE events)
  const applyBlackout = (block: GanttBlock) => {
    const start = new Date(block.startDate).getTime();
    const end = new Date(block.endDate).getTime();

    setEvents(prev => prev.map(evt => {
      const evtStart = new Date(evt.start).getTime();
      const evtEnd = new Date(evt.end).getTime();

      // Check overlap
      const overlap = (evtStart < end) && (evtEnd > start);

      if (overlap && !evt.isHidden) {
        return { ...evt, isHidden: true, canceledByBlackoutId: block.id };
      }
      return evt;
    }));
  };

  // Blackout Logic: Restore events (UNHIDE)
  const restoreBlackout = (blockId: string) => {
    setEvents(prev => prev.map(evt => {
      if (evt.canceledByBlackoutId === blockId) {
        return { ...evt, isHidden: false, canceledByBlackoutId: undefined };
      }
      return evt;
    }));
  };

  const handleOpenModal = (block?: GanttBlock) => {
    if (block) {
      setEditingId(block.id);
      setFormData({ ...block });
    } else {
      setEditingId(null);
      setFormData({ color: COLORS[0], isBlackout: false });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.startDate || !formData.endDate) return;

    // Logic for Update
    if (editingId) {
      const oldBlock = blocks.find(b => b.id === editingId);
      if (oldBlock?.isBlackout) {
        restoreBlackout(editingId);
      }

      const updatedBlock: GanttBlock = {
        ...formData as GanttBlock,
        id: editingId
      };

      setBlocks(prev => prev.map(b => b.id === editingId ? updatedBlock : b));

      if (updatedBlock.isBlackout) {
        setTimeout(() => applyBlackout(updatedBlock), 50);
      }
    }
    // Logic for Create
    else {
      const block: GanttBlock = {
        id: generateId(),
        title: formData.title!,
        startDate: formData.startDate!,
        endDate: formData.endDate!,
        color: formData.color || COLORS[0],
        isBlackout: formData.isBlackout || false
      };
      setBlocks(prev => [...prev, block]);
      if (block.isBlackout) {
        applyBlackout(block);
      }
    }

    setIsModalOpen(false);
  };

  const handleDelete = (block: GanttBlock) => {
    if (window.confirm('Delete this block? If it is a blackout, events will be restored.')) {
      setBlocks(prev => prev.filter(b => b.id !== block.id));
      if (block.isBlackout) {
        restoreBlackout(block.id);
      }
    }
  };

  return (
    <div className="p-4">
      <div className="flex flex-col mb-4">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center mb-1">
          <AlertOctagon size={20} className="mr-2 text-blue-500" />
          {t('nav.gantt')}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">
          {t('nav.gantt.subtitle') || "Manage semesters & blackouts."}
        </p>
      </div>

      <button
        onClick={() => handleOpenModal()}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center shadow-sm mb-6 transition-colors"
      >
        <Plus size={16} className="mr-2" /> {t('btn.add')}
      </button>

      <div className="space-y-3">
        {blocks.map(block => (
          <div key={block.id} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col group relative">
            <div className="flex items-start justify-between">
              <button
                onClick={() => handleDelete(block)}
                className="text-slate-400 hover:text-red-500 transition-colors mr-2 flex-shrink-0"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>

              <div
                onClick={() => handleOpenModal(block)}
                className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity flex-1"
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: block.color }}
                />
                <h3 className="font-bold text-sm text-slate-800 dark:text-white truncate max-w-[180px]">
                  {block.title}
                </h3>
                <Edit2 size={10} className="opacity-0 group-hover:opacity-100 text-slate-400" />
              </div>
            </div>

            <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 mt-2 ml-4">
              <span>{formatDate(new Date(block.startDate), settings.dateFormat)}</span>
              <span className="mx-1">→</span>
              <span>{formatDate(new Date(block.endDate), settings.dateFormat)}</span>
            </div>

            {block.isBlackout && (
              <div className="mt-2 ml-4">
                <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px] px-2 py-0.5 rounded-full inline-flex items-center">
                  <AlertOctagon size={10} className="mr-1" /> Blackout
                </span>
              </div>
            )}
          </div>
        ))}
        {blocks.length === 0 && (
          <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/30 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 text-xs">
            No periods defined.
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">{editingId ? 'Edit Period' : 'Add Gantt / Blackout Period'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.title || ''}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Winter Break"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date</label>
                  <input
                    type="date"
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.startDate ? new Date(formData.startDate).toISOString().split('T')[0] : ''}
                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End Date</label>
                  <input
                    type="date"
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.endDate ? new Date(formData.endDate).toISOString().split('T')[0] : ''}
                    onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Display Color</label>
                <div className="flex space-x-2">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setFormData({ ...formData, color: c })}
                      className={`w-8 h-8 rounded-full border-2 ${formData.color === c ? 'border-slate-800 dark:border-white' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-5 h-5 text-red-600 rounded focus:ring-red-500 border-slate-300 dark:border-slate-600"
                    checked={formData.isBlackout}
                    onChange={e => setFormData({ ...formData, isBlackout: e.target.checked })}
                  />
                  <div>
                    <span className="block font-medium text-slate-900 dark:text-white">Apply Blackout</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">Automatically <strong>HIDE</strong> all events in this range from calendar and reports.</span>
                  </div>
                </label>
                {formData.isBlackout && (
                  <div className="flex items-start mt-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 p-2 rounded">
                    <AlertTriangle size={14} className="mr-1 mt-0.5 flex-shrink-0" />
                    Caution: Existing events in this range will be hidden.
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg"
                >
                  {editingId ? 'Save Changes' : (formData.isBlackout ? 'Create & Apply' : 'Create')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
