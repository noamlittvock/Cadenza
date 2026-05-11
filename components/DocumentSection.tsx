import React, { useState, useRef } from 'react';
import { FileText, Plus, Download, Trash2, X } from 'lucide-react';
import type { DocumentEntry } from '../types/v2';
import { generateId } from '../constants';
import { uploadDocument, deleteDocument } from '../utils/storageUtils';
import { Modal } from './Modal';

const DOC_TYPES = ['DIPLOMA', 'CERTIFICATE', 'ID', 'OTHER'] as const;

interface Props {
  documents: DocumentEntry[];
  orgId: string;
  canWrite: boolean;
  t: (key: string) => string;
  onUpdate: (documents: DocumentEntry[]) => void;
}

const docTypeBadgeClass = (type: string) => {
  switch (type) {
    case 'DIPLOMA': return 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
    case 'CERTIFICATE': return 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    case 'ID': return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    default: return 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700';
  }
};

export const DocumentSection: React.FC<Props> = ({
  documents,
  orgId,
  canWrite,
  t,
  onUpdate,
}) => {
  const safeDocuments = documents ?? [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<string>('OTHER');
  const [formDate, setFormDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setFormName('');
    setFormType('OTHER');
    setFormDate('');
    setFormNotes('');
    setSelectedFile(null);
    setUploading(false);
    setUploadError('');
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setUploading(true);
    setUploadError('');

    let fileUrl: string | null = null;
    let filePath: string | null = null;

    if (selectedFile) {
      try {
        const result = await uploadDocument(orgId, selectedFile);
        fileUrl = result.url;
        filePath = result.path;
      } catch (err) {
        console.error('[DocumentSection] upload failed', err);
        setUploadError(t('common.document.upload_failed') || 'File upload failed. Document saved without file.');
      }
    }

    const entry: DocumentEntry = {
      id: generateId(),
      name: formName.trim(),
      type: formType,
      date: formDate || new Date().toISOString().slice(0, 10),
      notes: formNotes.trim() || null,
      fileUrl,
      filePath,
    };
    onUpdate([...safeDocuments, entry]);
    setIsModalOpen(false);
    resetForm();
  };

  const handleDelete = async (doc: DocumentEntry) => {
    if (!window.confirm(t('common.document.delete_confirm'))) return;
    if (doc.filePath) {
      try {
        await deleteDocument(doc.filePath);
      } catch (err) {
        console.error('[DocumentSection] delete failed', err);
      }
    }
    onUpdate(safeDocuments.filter(d => d.id !== doc.id));
  };

  return (
    <>
      <hr className="border-slate-200 dark:border-slate-700" />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            <FileText size={14} className="inline mr-1 rtl:mr-0 rtl:ml-1 -mt-0.5" />
            {t('common.documents')}
          </h3>
          {canWrite && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-2.5 py-1 rounded-lg text-xs font-medium"
            >
              <Plus size={12} /> {t('common.document.add')}
            </button>
          )}
        </div>

        {safeDocuments.length === 0 ? (
          <div className="text-center py-6 text-slate-400 dark:text-slate-500">
            <FileText size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t('common.document.empty')}</p>
          </div>
        ) : (
          safeDocuments.map(doc => (
            <div key={doc.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{doc.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${docTypeBadgeClass(doc.type)}`}>
                      {t(`common.document.type.${doc.type.toLowerCase()}`)}
                    </span>
                    <span className="text-xs text-slate-400">{doc.date}</span>
                  </div>
                  {doc.notes && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{doc.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {doc.fileUrl && (
                    <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                      <Download size={14} className="text-blue-500" />
                    </a>
                  )}
                  {canWrite && (
                    <button onClick={() => handleDelete(doc)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Document Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm(); }}
        title={t('common.document.add')}
        isDirty={!!formName}
        footerContent={
          <div className="flex justify-end w-full">
            <button
              onClick={handleSave}
              disabled={uploading || !formName.trim()}
              className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? `${t('common.document.upload')}...` : (t('common.save') || 'Save')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {uploadError && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-400 text-sm">{uploadError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('common.document.name')}</label>
            <input
              type="text"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder={t('common.document.name')}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('common.document.type')}</label>
            <select
              value={formType}
              onChange={e => setFormType(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
            >
              {DOC_TYPES.map(dt => (
                <option key={dt} value={dt}>{t(`common.document.type.${dt.toLowerCase()}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('common.document.date')}</label>
            <input
              type="date"
              value={formDate}
              onChange={e => setFormDate(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('common.document.notes')}</label>
            <textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              placeholder={t('common.document.notes')}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 min-h-[60px]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('common.document.upload')}</label>
            <input
              ref={fileInputRef}
              type="file"
              onChange={e => { if (e.target.files?.[0]) setSelectedFile(e.target.files[0]); }}
              className="w-full text-sm text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-300 hover:file:bg-blue-100"
            />
            {selectedFile && (
              <p className="text-xs text-slate-500 mt-1">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</p>
            )}
          </div>
          {uploading && (
            <p className="text-sm text-blue-600 dark:text-blue-400 animate-pulse">{t('common.document.upload')}...</p>
          )}
        </div>
      </Modal>
    </>
  );
};
