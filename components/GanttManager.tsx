import React, { useState } from 'react';
import { GanttBlock, CalendarEvent, AppSettings } from '../types';
import { generateId, COLORS, TRANSLATIONS, formatDate } from '../constants';
import { AlertOctagon, Plus, Trash2, AlertTriangle, CalendarRange, Edit2 } from 'lucide-react';
import { DatePicker } from './DatePicker';
import { Modal } from './Modal';

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
  const [initialFormData, setInitialFormData] = useState<Partial<GanttBlock>>({
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
      setInitialFormData({ ...block });
    } else {
      setEditingId(null);
      const newBlockData = { color: COLORS[0], isBlackout: false };
      setFormData(newBlockData);
      setInitialFormData(newBlockData);
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
    if (window.confirm(t('gantt.confirm_delete_block'))) {
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
          <AlertOctagon size={20} className="me-2 text-blue-500" />
          {t('nav.gantt')}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">
          {t('nav.gantt.subtitle')}
        </p>
      </div>

      <button
        onClick={() => handleOpenModal()}
        className="w-full btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-4 py-2 rounded-lg flex items-center justify-center  mb-6 transition-colors"
      >
        <Plus size={16} className="me-2" /> {t('btn.add')}
      </button>

      <div className="space-y-3">
        {blocks.map(block => (
          <div key={block.id} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col group relative">
            <div className="flex items-start justify-between">
              <button
                onClick={() => handleDelete(block)}
                className="text-slate-400 hover:text-red-500 transition-colors me-2 flex-shrink-0"
                title={t('gantt.delete')}
              >
                <Trash2 size={14} />
              </button>

              <div
                onClick={() => handleOpenModal(block)}
                className="flex items-center space-x-2 rtl:space-x-reverse cursor-pointer hover:opacity-80 transition-opacity flex-1"
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

            <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 mt-2 ms-4">
              <span>{formatDate(new Date(block.startDate), settings.dateFormat)}</span>
              <span className="mx-1">→</span>
              <span>{formatDate(new Date(block.endDate), settings.dateFormat)}</span>
            </div>

            {block.isBlackout && (
              <div className="mt-2 ms-4">
                <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px] px-2 py-0.5 rounded-full inline-flex items-center">
                  <AlertOctagon size={10} className="me-1" /> {t('gantt.blackout_label')}
                </span>
              </div>
            )}
          </div>
        ))}
        {blocks.length === 0 && (
          <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/30 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 text-xs">
            {t('gantt.no_periods')}
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? t('gantt.edit_period') : t('gantt.add_period')}
        isDirty={JSON.stringify(formData) !== JSON.stringify(initialFormData)}
        onSave={handleSubmit}
        t={t}
        maxWidth="max-w-md"
        footerContent={
          <div className="flex justify-end space-x-3 rtl:space-x-reverse w-full">
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              {t('btn.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg"
            >
              {editingId ? t('gantt.save_changes') : (formData.isBlackout ? t('gantt.create_apply') : t('btn.create'))}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('gantt.label_title')}</label>
            <input
              type="text"
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.title || ''}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder={t('gantt.name_placeholder')}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('gantt.start_date')}</label>
              <DatePicker
                type="date"
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.startDate ? new Date(formData.startDate).toISOString().split('T')[0] : ''}
                onChange={e => {
                  const newStart = e.target.value;
                  setFormData(prev => {
                    const next = { ...prev, startDate: newStart };
                    if (!prev.endDate || (new Date(newStart) > new Date(prev.endDate))) {
                      next.endDate = newStart;
                    }
                    return next;
                  });
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('gantt.end_date')}</label>
              <DatePicker
                type="date"
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.endDate ? new Date(formData.endDate).toISOString().split('T')[0] : ''}
                onChange={e => {
                  const newEnd = e.target.value;
                  setFormData(prev => {
                    const next = { ...prev, endDate: newEnd };
                    if (prev.startDate && (new Date(newEnd) < new Date(prev.startDate))) {
                      next.startDate = newEnd;
                    }
                    return next;
                  });
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('gantt.display_color')}</label>
            <div className="flex space-x-2 rtl:space-x-reverse">
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
            <label className="flex items-center space-x-3 rtl:space-x-reverse cursor-pointer">
              <input
                type="checkbox"
                className="w-5 h-5 text-red-600 rounded focus:ring-red-500 border-slate-300 dark:border-slate-600"
                checked={formData.isBlackout}
                onChange={e => setFormData({ ...formData, isBlackout: e.target.checked })}
              />
              <div>
                <span className="block font-medium text-slate-900 dark:text-white">{t('gantt.apply_blackout')}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{t('gantt.blackout_desc')}</span>
              </div>
            </label>
            {formData.isBlackout && (
              <div className="flex items-start mt-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 p-2 rounded">
                <AlertTriangle size={14} className="me-1 mt-0.5 flex-shrink-0" />
                {t('gantt.blackout_warning')}
              </div>
            )}
          </div>

        </div>
      </Modal>
    </div>
  );
};
