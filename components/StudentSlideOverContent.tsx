import React from 'react';
import { Edit2, Archive, RotateCcw, Plus, BookOpen, HelpCircle, Sparkles } from 'lucide-react';
import type { StudentV2, EnrollmentV2, ActivityV2, DocumentEntry } from '../types/v2';
import { ImportExportDropdown } from './ImportExportDropdown';
import { DocumentSection } from './DocumentSection';
import type { AppSettings } from '../types';

interface Props {
  student: StudentV2;
  enrollments: EnrollmentV2[];
  activities: ActivityV2[];
  settings: AppSettings;
  canWrite: boolean;
  t: (key: string) => string;
  getActName: (id: string) => string;
  getL2Name: (id: string) => string;
  onEdit: (student: StudentV2) => void;
  onArchive: (student: StudentV2) => void;
  onRestore: (student: StudentV2) => void;
  onNewEnrollment: () => void;
  onEditEnrollment: (enrollment: EnrollmentV2) => void;
  onArchiveEnrollment: (enrollment: EnrollmentV2) => void;
  onReinstateEnrollment: (enrollment: EnrollmentV2) => void;
  enrollmentExportData: any[];
  enrollmentDupKeys: Set<string>;
  csvActivityByName: Record<string, string>;
  csvL2ByName: Record<string, string>;
  csvStudentByName: Record<string, string>;
  onEnrollmentImportComplete: (rows: any[]) => void;
  orgId: string;
  onDocumentsUpdate: (documents: DocumentEntry[]) => void;
  uid: string;
  isEnrollmentWalkthroughDone: (uid: string) => boolean;
  enrollWalkStep: number | null;
  setEnrollWalkStep: (step: number | null) => void;
  markEnrollmentWalkthroughDone: (uid: string) => void;
  WalkthroughBanner: React.FC<{ step: number; total: number; message: string; onNext: () => void; onSkip: () => void }>;
}

export const StudentSlideOverContent: React.FC<Props> = ({
  student,
  enrollments,
  activities,
  settings,
  canWrite,
  t,
  getActName,
  getL2Name,
  onEdit,
  onArchive,
  onRestore,
  onNewEnrollment,
  onEditEnrollment,
  onArchiveEnrollment,
  onReinstateEnrollment,
  enrollmentExportData,
  enrollmentDupKeys,
  csvActivityByName,
  csvL2ByName,
  csvStudentByName,
  onEnrollmentImportComplete,
  orgId,
  onDocumentsUpdate,
  uid,
  isEnrollmentWalkthroughDone,
  enrollWalkStep,
  setEnrollWalkStep,
  markEnrollmentWalkthroughDone,
  WalkthroughBanner,
}) => {
  // Compute years of study from startDate
  const yearsOfStudy = student.startDate
    ? Math.max(0, Math.floor((Date.now() - new Date(student.startDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)))
    : null;

  const InfoRow: React.FC<{ label: string; value: string | null | undefined }> = ({ label, value }) => (
    <div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-900 dark:text-white">{value || '—'}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Actions */}
      {canWrite && (
        <div className="flex gap-2">
          <button onClick={() => onEdit(student)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
            <Edit2 size={12} /> {t('student.edit')}
          </button>
          {student.isArchived ? (
            <button onClick={() => onRestore(student)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800">
              <RotateCcw size={12} /> {t('student.restore')}
            </button>
          ) : (
            <button onClick={() => onArchive(student)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800">
              <Archive size={12} /> {t('student.archive')}
            </button>
          )}
        </div>
      )}

      {/* Profile section */}
      <div className="grid grid-cols-1 gap-3 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
        <InfoRow label={t('student.full_name')} value={student.fullName} />
        <InfoRow label={t('student.date_of_birth')} value={student.dateOfBirth} />
        <InfoRow label={t('student.grade')} value={student.grade} />
        <InfoRow label={t('student.v2.level')} value={student.level != null ? String(student.level) : null} />
        <InfoRow label={t('student.v2.start_date')} value={student.startDate} />
        {yearsOfStudy != null && (
          <InfoRow label={t('student.v2.years_of_study')} value={String(yearsOfStudy)} />
        )}
        <InfoRow label={t('student.v2.parent_name')} value={student.parentName} />
        <InfoRow label={t('student.v2.parent_phone')} value={student.parentPhone} />
        <InfoRow label={t('student.v2.phone2')} value={student.phone2} />
        <InfoRow label={t('student.v2.email')} value={student.email} />
        <InfoRow label={t('student.v2.address')} value={student.address} />
        {(student.tags?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('student.v2.tags')}</p>
            <div className="flex flex-wrap gap-1.5">
              {student.tags.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <hr className="border-slate-200 dark:border-slate-700" />

      {/* Enrollments section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('student.tab.enrollments')}</h3>
            {canWrite && !student.isArchived && (
              <button
                onClick={() => { setEnrollWalkStep(null); if (!isEnrollmentWalkthroughDone(uid)) { setEnrollWalkStep(1); } onNewEnrollment(); }}
                className="flex items-center gap-1 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-2.5 py-1 rounded-lg text-xs font-medium"
              >
                <Plus size={12} /> {t('student.v2.enrollment.add')}
              </button>
            )}
            <ImportExportDropdown
              entityType="ENROLLMENT"
              existingData={enrollmentExportData}
              existingDuplicateKeys={enrollmentDupKeys}
              dependencyMaps={{ activityByName: csvActivityByName, l2ByName: csvL2ByName, staffByEmail: {}, studentByName: csvStudentByName }}
              activityNames={activities.map(a => a.name)}
              settings={settings}
              canWrite={canWrite}
              onImportComplete={onEnrollmentImportComplete}
            />
          </div>
          {canWrite && !student.isArchived && (
            <button
              onClick={() => { setEnrollWalkStep(1); onNewEnrollment(); }}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400"
            >
              <HelpCircle size={12} /> {t('student.v2.guide_me')}
            </button>
          )}
        </div>

        {enrollments.length === 0 ? (
          <div className="text-center py-8 text-slate-400 dark:text-slate-500">
            <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t('student.v2.enrollment.empty')}</p>
          </div>
        ) : (
          enrollments.map(enrollment => (
            <div
              key={enrollment.id}
              className={`p-3 rounded-lg border ${
                enrollment.status === 'ARCHIVED'
                  ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate min-w-0">
                    {getActName(enrollment.activityId)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {getL2Name(enrollment.l2Id)} · {enrollment.startDate}
                    {enrollment.endDate ? ` → ${enrollment.endDate}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    enrollment.status === 'ACTIVE'
                      ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                      : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                  }`}>
                    {t(`student.v2.enrollment.${enrollment.status.toLowerCase()}`)}
                  </span>
                  {canWrite && (
                    <div className="flex gap-1">
                      <button onClick={() => onEditEnrollment(enrollment)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                        <Edit2 size={12} className="text-slate-400" />
                      </button>
                      {enrollment.status === 'ACTIVE' ? (
                        <button onClick={() => onArchiveEnrollment(enrollment)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                          <Archive size={12} className="text-amber-500" />
                        </button>
                      ) : (
                        <button onClick={() => onReinstateEnrollment(enrollment)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                          <RotateCcw size={12} className="text-green-500" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Documents */}
      <DocumentSection
        documents={student.documents ?? []}
        orgId={orgId}
        canWrite={canWrite}
        t={t}
        onUpdate={onDocumentsUpdate}
      />
    </div>
  );
};
