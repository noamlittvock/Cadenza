import React from 'react';
import {
  Edit2, Archive, RotateCcw, Plus, GraduationCap, Briefcase, ChevronRight,
} from 'lucide-react';
import type {
  StaffMemberV2, TeachingAssignmentV2, OrgRoleV2, StaffRole, ActivityV2, DocumentEntry,
  AssignmentScope,
} from '../types/v2';
import type { AppSettings } from '../types';
import { ImportExportDropdown } from './ImportExportDropdown';
import { DocumentSection } from './DocumentSection';

// ─── Role badge ─────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<StaffRole, string> = {
  SUPER_ADMIN: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  ADMIN: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  STAFF: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
};

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  staff: StaffMemberV2;
  assignments: TeachingAssignmentV2[];
  orgRoles: OrgRoleV2[];
  activities: ActivityV2[];
  settings: AppSettings;
  orgId: string;
  canWrite: boolean;
  t: (key: string) => string;
  activityName: (id: string) => string;
  l2Name: (id: string) => string;
  scopeLabel: (scope: AssignmentScope, l1Id: string | null, l2Id: string | null) => string;
  onEdit: (staff: StaffMemberV2) => void;
  onArchive: (staffId: string) => void;
  onRestore: (staffId: string) => void;
  onNewAssignment: () => void;
  onEditAssignment: (a: TeachingAssignmentV2) => void;
  onToggleAssignmentArchive: (id: string, archive: boolean) => void;
  onNewOrgRole: () => void;
  onEditOrgRole: (r: OrgRoleV2) => void;
  onToggleOrgRoleArchive: (id: string, archive: boolean) => void;
  onDocumentsUpdate: (documents: DocumentEntry[]) => void;
  // CSV import/export
  assignmentExportData: any[];
  assignmentDupKeys: Set<string>;
  csvActivityByName: Record<string, string>;
  csvL2ByName: Record<string, string>;
  csvStaffByEmail: Record<string, string>;
  onAssignmentImportComplete: (rows: any[]) => void;
}

export const StaffSlideOverContent: React.FC<Props> = ({
  staff,
  assignments,
  orgRoles,
  activities,
  settings,
  orgId,
  canWrite,
  t,
  activityName,
  l2Name,
  scopeLabel,
  onEdit,
  onArchive,
  onRestore,
  onNewAssignment,
  onEditAssignment,
  onToggleAssignmentArchive,
  onNewOrgRole,
  onEditOrgRole,
  onToggleOrgRoleArchive,
  onDocumentsUpdate,
  assignmentExportData,
  assignmentDupKeys,
  csvActivityByName,
  csvL2ByName,
  csvStaffByEmail,
  onAssignmentImportComplete,
}) => {
  // Compute years active from startDate
  const yearsActive = (staff.startDate ?? null)
    ? Math.max(0, Math.floor((Date.now() - new Date(staff.startDate!).getTime()) / (365.25 * 24 * 60 * 60 * 1000)))
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
          <button onClick={() => onEdit(staff)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
            <Edit2 size={12} /> {t('staff.edit')}
          </button>
          {staff.isArchived ? (
            <button onClick={() => onRestore(staff.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800">
              <RotateCcw size={12} /> {t('staff.restore')}
            </button>
          ) : (
            <button onClick={() => onArchive(staff.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800">
              <Archive size={12} /> {t('staff.archive')}
            </button>
          )}
        </div>
      )}

      {/* Profile */}
      <div className="grid grid-cols-1 gap-3 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
        <InfoRow label={t('staff.full_name')} value={staff.fullName} />
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('staff.role')}</p>
          <div className="mt-0.5">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[staff.role]}`}>
              {t(`staff.role.${staff.role.toLowerCase()}`)}
            </span>
          </div>
        </div>
        <InfoRow label={t('staff.email')} value={staff.email} />
        <InfoRow label={t('staff.phone')} value={staff.phone} />
        <InfoRow label={t('staff.v2.start_date_work')} value={staff.startDate ?? null} />
        {yearsActive != null && (
          <InfoRow label={t('staff.v2.years_active')} value={String(yearsActive)} />
        )}
      </div>

      {/* Teaching Assignments */}
      <hr className="border-slate-200 dark:border-slate-700" />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              <GraduationCap size={14} className="inline mr-1 rtl:mr-0 rtl:ml-1 -mt-0.5" />
              {t('staff.tab.teaching_assignments')}
            </h3>
            {canWrite && !staff.isArchived && (
              <button onClick={onNewAssignment}
                className="flex items-center gap-1 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-2.5 py-1 rounded-lg text-xs font-medium">
                <Plus size={12} /> {t('staff.v2.add_teaching_assignment')}
              </button>
            )}
            <ImportExportDropdown
              entityType="TEACHING_ASSIGNMENT"
              existingData={assignmentExportData}
              existingDuplicateKeys={assignmentDupKeys}
              dependencyMaps={{ activityByName: csvActivityByName, l2ByName: csvL2ByName, staffByEmail: csvStaffByEmail, studentByName: {} }}
              activityNames={activities.map(a => a.name)}
              settings={settings}
              canWrite={canWrite}
              onImportComplete={onAssignmentImportComplete}
            />
          </div>
        </div>

        {assignments.length === 0 ? (
          <p className="text-slate-400 dark:text-slate-500 text-sm py-4 text-center">{t('staff.v2.assignment_empty')}</p>
        ) : (
          assignments.map(a => (
            <div key={a.id} className={`p-3 rounded-lg border ${a.isArchived ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'}`}>
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {activityName(a.activityId)}
                    </p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      a.scope === 'ACTIVITY' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' :
                      a.scope === 'L1' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {scopeLabel(a.scope, a.l1Id, a.l2Id)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {a.startDate}{a.endDate ? ` → ${a.endDate}` : ''}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => onEditAssignment(a)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                      <Edit2 size={12} className="text-slate-400" />
                    </button>
                    {a.isArchived ? (
                      <button onClick={() => onToggleAssignmentArchive(a.id, false)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                        <RotateCcw size={12} className="text-green-500" />
                      </button>
                    ) : (
                      <button onClick={() => onToggleAssignmentArchive(a.id, true)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                        <Archive size={12} className="text-amber-500" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Org Roles */}
      <hr className="border-slate-200 dark:border-slate-700" />
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            <Briefcase size={14} className="inline mr-1 rtl:mr-0 rtl:ml-1 -mt-0.5" />
            {t('staff.tab.org_roles')}
          </h3>
          {canWrite && !staff.isArchived && (
            <button onClick={onNewOrgRole}
              className="flex items-center gap-1 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-2.5 py-1 rounded-lg text-xs font-medium">
              <Plus size={12} /> {t('staff.v2.add_org_role')}
            </button>
          )}
        </div>

        {orgRoles.length === 0 ? (
          <p className="text-slate-400 dark:text-slate-500 text-sm py-4 text-center">{t('staff.v2.org_role_empty')}</p>
        ) : (
          orgRoles.map(r => (
            <div key={r.id} className={`p-3 rounded-lg border ${r.isArchived ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'}`}>
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{r.roleTitle}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {r.startDate}{r.endDate ? ` → ${r.endDate}` : ''}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => onEditOrgRole(r)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                      <Edit2 size={12} className="text-slate-400" />
                    </button>
                    {r.isArchived ? (
                      <button onClick={() => onToggleOrgRoleArchive(r.id, false)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                        <RotateCcw size={12} className="text-green-500" />
                      </button>
                    ) : (
                      <button onClick={() => onToggleOrgRoleArchive(r.id, true)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                        <Archive size={12} className="text-amber-500" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Documents */}
      <DocumentSection
        documents={staff.documents ?? []}
        orgId={orgId}
        canWrite={canWrite}
        t={t}
        onUpdate={onDocumentsUpdate}
      />
    </div>
  );
};
