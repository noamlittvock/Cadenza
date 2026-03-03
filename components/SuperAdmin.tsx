import React, { useState, useEffect, useRef } from 'react';
import { collection, query, getDocs, doc, setDoc, deleteDoc, updateDoc, writeBatch, getDoc, where } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../utils/firebase';
import { useAuth } from '../context/AuthContext';
import { TRANSLATIONS } from '../constants';
import { AppSettings, CalendarEvent, Activity } from '../types';
import { Users, Building, AlertCircle, Plus, Trash2, ShieldCheck, Loader2, ImagePlus, Wrench, Edit2, Save, X, Globe } from 'lucide-react';
import { TranslationManager } from './TranslationManager';

interface Organization {
    id: string; // The slug
    name: string;
    createdAt: string;
    logoUrl?: string;
}

interface AccessRecord {
    id: string; // The record ID (email or email_orgId)
    email?: string;
    allowed: boolean;
    role: 'ADMIN' | 'VIEWER';
    orgId: string;
}

interface SuperAdminProps {
    onLoadTestData?: () => void;
    onWipeData?: () => void;
    settings: AppSettings;
    events?: CalendarEvent[];
    setEvents?: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
    activities?: Activity[];
}

export const SuperAdmin: React.FC<SuperAdminProps> = ({ onLoadTestData, onWipeData, settings, events = [], setEvents, activities = [] }) => {
    const { currentUser, isSuperAdmin } = useAuth();
    const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
    const [activeTab, setActiveTab] = useState<'ORGS' | 'USERS' | 'DEV_TOOLS' | 'TRANSLATIONS'>('ORGS');
    const [loading, setLoading] = useState(true);

    // Data State
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [accessRecords, setAccessRecords] = useState<AccessRecord[]>([]);

    // Migration State
    const [migrationReport, setMigrationReport] = useState<{
        total: number;
        alreadyMigrated: number;
        matched: { id: string; classification: string; activityId: string }[];
        unmatched: { id: string; classification: string }[];
    } | null>(null);
    const [migrationRunning, setMigrationRunning] = useState(false);

    // Form State
    const [newOrgSlug, setNewOrgSlug] = useState('');
    const [newOrgName, setNewOrgName] = useState('');

    const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
    const [editOrgName, setEditOrgName] = useState('');
    const [editOrgSlug, setEditOrgSlug] = useState('');

    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserOrgId, setNewUserOrgId] = useState('');
    const [newUserRole, setNewUserRole] = useState<'ADMIN' | 'VIEWER'>('VIEWER');

    const [isBulkMode, setIsBulkMode] = useState(false);
    const [bulkCsvData, setBulkCsvData] = useState('');
    const [filterOrgId, setFilterOrgId] = useState('');

    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [uploadingOrgId, setUploadingOrgId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedUploadOrgId, setSelectedUploadOrgId] = useState<string | null>(null);

    // Security check - only superadmin role
    if (!isSuperAdmin) {
        return (
            <div className="p-8 text-center text-red-500">
                <AlertCircle className="mx-auto mb-4" size={48} />
                <h2 className="text-2xl font-bold">{t('sa.access_denied')}</h2>
                <p>{t('sa.restricted')}</p>
            </div>
        );
    }

    // Fetch Data
    const loadData = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const orgsSnap = await getDocs(collection(db, 'organizations'));
            const orgsData = orgsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Organization));
            setOrganizations(orgsData);

            const accessSnap = await getDocs(collection(db, 'access_control'));
            const accessData = accessSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AccessRecord));
            setAccessRecords(accessData);
        } catch (err) {
            console.error("Error loading super admin data", err);
            setErrorMsg(t('sa.err_load_data'));
        }
        setLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    // Actions
    const handleCreateOrg = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newOrgSlug.trim() || !newOrgName.trim()) return;

        // Simple validation for slug (no spaces, lowercase)
        const safeSlug = newOrgSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

        try {
            await setDoc(doc(db, 'organizations', safeSlug), {
                name: newOrgName,
                createdAt: new Date().toISOString()
            });
            setNewOrgSlug('');
            setNewOrgName('');
            loadData(); // Reload to show new
        } catch (err) {
            setErrorMsg(t('sa.err_create_org'));
        }
    };

    const handleDeleteOrg = async (slug: string, name: string) => {
        if (!window.confirm(t('sa.confirm_delete_org').replace('{name}', name))) return;
        try {
            await deleteDoc(doc(db, 'organizations', slug));
            loadData();
        } catch (err) {
            setErrorMsg(t('sa.err_delete_org'));
        }
    };

    const handleEditOrgSave = async (oldSlug: string) => {
        if (!editOrgName.trim() || !editOrgSlug.trim()) return;
        const newSlug = editOrgSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

        if (oldSlug === newSlug) {
            try {
                await updateDoc(doc(db, 'organizations', oldSlug), { name: editOrgName });
                setEditingOrgId(null);
                loadData();
            } catch (err) {
                setErrorMsg(t('sa.err_update_org'));
            }
            return;
        }

        if (!window.confirm(t('sa.confirm_migrate').replace('{old}', oldSlug).replace('{new}', newSlug))) return;

        setLoading(true);
        try {
            const existingDest = await getDoc(doc(db, 'organizations', newSlug));
            if (existingDest.exists()) {
                setErrorMsg(t('sa.err_org_exists').replace('{slug}', newSlug));
                setLoading(false);
                return;
            }

            const migrationOps: { ref: any, type: 'set' | 'update' | 'delete', data?: any }[] = [];

            const oldOrgDoc = await getDoc(doc(db, 'organizations', oldSlug));
            if (oldOrgDoc.exists()) {
                migrationOps.push({ ref: doc(db, 'organizations', newSlug), type: 'set', data: { ...oldOrgDoc.data(), name: editOrgName } });
                migrationOps.push({ ref: doc(db, 'organizations', oldSlug), type: 'delete' });
            }

            const oldSettings = await getDoc(doc(db, 'app_settings', oldSlug));
            if (oldSettings.exists()) {
                migrationOps.push({ ref: doc(db, 'app_settings', newSlug), type: 'set', data: oldSettings.data() });
                migrationOps.push({ ref: doc(db, 'app_settings', oldSlug), type: 'delete' });
            }

            const oldLists = await getDoc(doc(db, 'app_lists', oldSlug));
            if (oldLists.exists()) {
                migrationOps.push({ ref: doc(db, 'app_lists', newSlug), type: 'set', data: oldLists.data() });
                migrationOps.push({ ref: doc(db, 'app_lists', oldSlug), type: 'delete' });
            }

            const accessQ = query(collection(db, 'access_control'), where("orgId", "==", oldSlug));
            const accessDocs = await getDocs(accessQ);
            accessDocs.forEach(d => {
                const data = d.data();
                const newId = `${data.email}_${newSlug}`;
                migrationOps.push({ ref: doc(db, 'access_control', newId), type: 'set', data: { ...data, orgId: newSlug } });
                migrationOps.push({ ref: d.ref, type: 'delete' });
            });

            const collectionsToMigrate = ['teachers', 'events', 'rooms', 'gantt_blocks'];
            for (const colName of collectionsToMigrate) {
                const colQ = query(collection(db, colName), where("orgId", "==", oldSlug));
                const colDocs = await getDocs(colQ);
                colDocs.forEach(d => {
                    migrationOps.push({ ref: d.ref, type: 'update', data: { orgId: newSlug } });
                });
            }

            // Batch writes (max 500 per batch)
            const chunkSize = 400;
            for (let i = 0; i < migrationOps.length; i += chunkSize) {
                const chunk = migrationOps.slice(i, i + chunkSize);
                const batch = writeBatch(db);
                chunk.forEach(op => {
                    if (op.type === 'set') batch.set(op.ref, op.data);
                    if (op.type === 'update') batch.update(op.ref, op.data);
                    if (op.type === 'delete') batch.delete(op.ref);
                });
                await batch.commit();
            }

            setEditingOrgId(null);
            loadData();
        } catch (err) {
            console.error(err);
            setErrorMsg(t('sa.err_migrate'));
            setLoading(false);
        }
    };

    const handleLogoUpload = async (file: File, orgId: string) => {
        if (!file.type.startsWith('image/')) {
            setErrorMsg(t('sa.err_upload_image'));
            return;
        }

        setUploadingOrgId(orgId);
        setErrorMsg(null);

        const storageRef = ref(storage, `organizations/${orgId}/logo`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on(
            'state_changed',
            null, // Could add progress bar here
            (error) => {
                console.error("Upload failed", error);
                setErrorMsg(t('sa.err_upload_logo'));
                setUploadingOrgId(null);
            },
            async () => {
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    await updateDoc(doc(db, 'organizations', orgId), {
                        logoUrl: downloadURL
                    });
                    loadData();
                } catch (err) {
                    setErrorMsg(t('sa.err_update_logo'));
                } finally {
                    setUploadingOrgId(null);
                }
            }
        );
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        const normalizedEmail = newUserEmail.toLowerCase().trim();
        const compositeId = `${normalizedEmail}_${newUserOrgId}`;

        try {
            await setDoc(doc(db, 'access_control', compositeId), {
                email: normalizedEmail,
                allowed: true,
                role: newUserRole,
                orgId: newUserOrgId,
                createdAt: new Date().toISOString()
            });
            setNewUserEmail('');
            loadData();
        } catch (err) {
            setErrorMsg(t('sa.err_assign_user'));
        }
    };

    const handleBulkAdd = async () => {
        if (!bulkCsvData.trim()) return;
        const lines = bulkCsvData.split('\n');
        setLoading(true);

        const promises = lines.map(line => {
            if (!line.trim()) return Promise.resolve();
            const parts = line.split(',').map(s => s.trim());
            const email = parts[0];
            const orgId = parts[1];
            const roleStr = parts[2];

            if (!email || !orgId) return Promise.resolve();
            const normalizedEmail = email.toLowerCase();
            const role = (roleStr?.toUpperCase() === 'ADMIN') ? 'ADMIN' : 'VIEWER';
            const compositeId = `${normalizedEmail}_${orgId}`;

            return setDoc(doc(db, 'access_control', compositeId), {
                email: normalizedEmail,
                allowed: true,
                role: role,
                orgId: orgId,
                createdAt: new Date().toISOString()
            });
        });

        try {
            await Promise.all(promises);
            setBulkCsvData('');
            setIsBulkMode(false);
            loadData();
        } catch (err) {
            setErrorMsg(t('sa.err_bulk_upload'));
            setLoading(false);
        }
    };

    const handleDeleteUser = async (recordId: string, email: string) => {
        if (!window.confirm(t('sa.confirm_revoke').replace('{email}', email))) return;
        try {
            await deleteDoc(doc(db, 'access_control', recordId));
            loadData();
        } catch (err) {
            setErrorMsg(t('sa.err_delete_user'));
        }
    };

    const handleUpdateRole = async (recordId: string, newRole: 'ADMIN' | 'VIEWER') => {
        try {
            await updateDoc(doc(db, 'access_control', recordId), { role: newRole });

            // Optimistically update local state
            setAccessRecords(prev => prev.map(r => r.id === recordId ? { ...r, role: newRole } : r));
        } catch (err) {
            setErrorMsg(t('sa.err_update_role'));
            loadData(); // Revert on failure
        }
    };

    const filteredRecords = filterOrgId
        ? accessRecords.filter(r => r.orgId === filterOrgId)
        : accessRecords;

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-y-auto">
            <div className="p-8 max-w-5xl mx-auto w-full">
                <div className="flex items-center space-x-4 rtl:space-x-reverse mb-8">
                    <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 text-red-600 rounded-xl flex items-center justify-center">
                        <ShieldCheck size={28} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{t('sa.console_title')}</h1>
                        <p className="text-slate-500">{t('sa.console_subtitle')}</p>
                    </div>
                </div>

                {errorMsg && (
                    <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-lg flex items-center">
                        <AlertCircle size={20} className="me-3" />
                        {errorMsg}
                    </div>
                )}

                {/* Tabs */}
                <div className="flex space-x-4 rtl:space-x-reverse mb-6 border-b border-slate-200 dark:border-slate-800">
                    <button
                        onClick={() => setActiveTab('ORGS')}
                        className={`pb-4 px-2 font-medium transition-colors border-b-2 ${activeTab === 'ORGS' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                            }`}
                    >
                        <div className="flex items-center space-x-2 rtl:space-x-reverse">
                            <Building size={18} />
                            <span>{t('sa.tab_orgs')}</span>
                        </div>
                    </button>
                    <button
                        onClick={() => setActiveTab('USERS')}
                        className={`pb-4 px-2 font-medium transition-colors border-b-2 ${activeTab === 'USERS' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                            }`}
                    >
                        <div className="flex items-center space-x-2 rtl:space-x-reverse">
                            <Users size={18} />
                            <span>{t('sa.tab_access')}</span>
                        </div>
                    </button>
                    <button
                        onClick={() => setActiveTab('DEV_TOOLS')}
                        className={`pb-4 px-2 font-medium transition-colors border-b-2 ${activeTab === 'DEV_TOOLS' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                            }`}
                    >
                        <div className="flex items-center space-x-2 rtl:space-x-reverse">
                            <Wrench size={18} />
                            <span>{t('sa.tab_dev')}</span>
                        </div>
                    </button>
                    <button
                        onClick={() => setActiveTab('TRANSLATIONS')}
                        className={`pb-4 px-2 font-medium transition-colors border-b-2 ${activeTab === 'TRANSLATIONS' ? 'border-cadenza-light text-cadenza-light' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                            }`}
                    >
                        <div className="flex items-center space-x-2 rtl:space-x-reverse">
                            <Globe size={18} />
                            <span>{t('sa.tab_translations') || 'Translations'}</span>
                        </div>
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20 text-slate-400">
                        <Loader2 className="animate-spin me-3" size={24} />
                        {t('sa.loading')}
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                        {activeTab === 'ORGS' && (
                            <div className="p-6">
                                <form onSubmit={handleCreateOrg} className="mb-8 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <h3 className="font-semibold mb-4 text-slate-800 dark:text-slate-200">{t('sa.register_org')}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">{t('sa.org_name')}</label>
                                            <input
                                                type="text"
                                                value={newOrgName}
                                                onChange={(e) => setNewOrgName(e.target.value)}
                                                placeholder={t('sa.org_name_placeholder')}
                                                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">{t('sa.url_slug')}</label>
                                            <input
                                                type="text"
                                                value={newOrgSlug}
                                                onChange={(e) => setNewOrgSlug(e.target.value)}
                                                placeholder={t('sa.url_slug_placeholder')}
                                                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div className="flex items-end">
                                            <button
                                                type="submit"
                                                disabled={!newOrgName || !newOrgSlug}
                                                className="w-full btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 shadow-cadenza-soft rounded-lg px-4 py-2 text-sm font-medium flex items-center justify-center transition-colors"
                                            >
                                                <Plus size={16} className="me-2" />
                                                {t('sa.create_tenant')}
                                            </button>
                                        </div>
                                    </div>
                                </form>

                                <h3 className="font-semibold mb-4 text-slate-800 dark:text-slate-200">{t('sa.active_orgs').replace('{count}', String(organizations.length))}</h3>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    ref={fileInputRef}
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files[0] && selectedUploadOrgId) {
                                            handleLogoUpload(e.target.files[0], selectedUploadOrgId);
                                        }
                                    }}
                                />
                                <div className="space-y-3">
                                    {organizations.map(org => {
                                        const isEditing = editingOrgId === org.id;

                                        return (
                                            <div key={org.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800 rounded-lg">
                                                <div className="flex items-center space-x-3 rtl:space-x-reverse w-full max-w-lg">
                                                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 text-blue-600 rounded-lg flex items-center justify-center font-bold overflow-hidden shrink-0">
                                                        {org.logoUrl ? (
                                                            <img src={org.logoUrl} alt={org.name} className="w-full h-full object-contain bg-white" />
                                                        ) : (
                                                            org.name.charAt(0)
                                                        )}
                                                    </div>
                                                    <div className="flex-1">
                                                        {isEditing ? (
                                                            <div className="flex flex-col space-y-2">
                                                                <input
                                                                    type="text"
                                                                    value={editOrgName}
                                                                    onChange={(e) => setEditOrgName(e.target.value)}
                                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                    placeholder={t('sa.org_name')}
                                                                />
                                                                <div className="flex items-center text-xs">
                                                                    <span className="text-slate-500 me-1">{t('sa.id_label')}</span>
                                                                    <input
                                                                        type="text"
                                                                        value={editOrgSlug}
                                                                        onChange={(e) => setEditOrgSlug(e.target.value)}
                                                                        className="bg-slate-200 dark:bg-slate-800 border-none rounded px-2 py-0.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                                        placeholder={t('sa.url_slug_placeholder')}
                                                                    />
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <p className="font-medium text-slate-900 dark:text-white">{org.name}</p>
                                                                <p className="text-xs text-slate-500">{t('super.id_label')} <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">{org.id}</code></p>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center space-x-2 rtl:space-x-reverse shrink-0 ms-4">
                                                    {!isEditing ? (
                                                        <>
                                                            <div className="text-sm text-slate-500 bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-full hidden md:block">
                                                                / {org.id}
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    setEditingOrgId(org.id);
                                                                    setEditOrgName(org.name);
                                                                    setEditOrgSlug(org.id);
                                                                }}
                                                                className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
                                                                title={t('sa.edit_org_title')}
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedUploadOrgId(org.id);
                                                                    fileInputRef.current?.click();
                                                                }}
                                                                className="p-2 text-slate-400 hover:text-blue-500 transition-colors relative"
                                                                title={t('sa.upload_logo')}
                                                                disabled={uploadingOrgId === org.id}
                                                            >
                                                                {uploadingOrgId === org.id ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteOrg(org.id, org.name)}
                                                                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                                                                title={t('sa.delete_org')}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => handleEditOrgSave(org.id)}
                                                                className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
                                                                title={t('sa.save_changes')}
                                                            >
                                                                <Save size={18} />
                                                            </button>
                                                            <button
                                                                onClick={() => setEditingOrgId(null)}
                                                                className="p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                                                                title={t('sa.cancel')}
                                                            >
                                                                <X size={18} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {organizations.length === 0 && (
                                        <div className="text-center py-8 text-slate-500">{t('sa.no_orgs')}</div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'USERS' && (
                            <div className="p-6">
                                <div className="mb-8 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-semibold text-slate-800 dark:text-slate-200">{t('sa.map_user')}</h3>
                                        <button
                                            onClick={() => setIsBulkMode(!isBulkMode)}
                                            className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline transition-all"
                                        >
                                            {isBulkMode ? t('super.switch_single') : t('super.switch_bulk')}
                                        </button>
                                    </div>

                                    {!isBulkMode ? (
                                        <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                            <div className="md:col-span-2">
                                                <label className="block text-xs text-slate-500 mb-1">{t('sa.user_email')}</label>
                                                <input
                                                    type="email"
                                                    value={newUserEmail}
                                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                                    placeholder={t('sa.user_email_placeholder')}
                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-500 mb-1">{t('sa.organization')}</label>
                                                <select
                                                    value={newUserOrgId}
                                                    onChange={(e) => setNewUserOrgId(e.target.value)}
                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                >
                                                    <option value="">{t('sa.select_org')}</option>
                                                    {organizations.map(org => (
                                                        <option key={org.id} value={org.id}>{org.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-500 mb-1">{t('sa.role_label')}</label>
                                                <select
                                                    value={newUserRole}
                                                    onChange={(e) => setNewUserRole(e.target.value as 'ADMIN' | 'VIEWER')}
                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                >
                                                    <option value="VIEWER">{t('super.role_viewer')}</option>
                                                    <option value="ADMIN">{t('super.role_admin')}</option>
                                                </select>
                                            </div>
                                            <div className="flex items-end">
                                                <button
                                                    type="submit"
                                                    disabled={!newUserEmail || !newUserOrgId}
                                                    className="w-full btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 shadow-cadenza-soft rounded-lg px-4 py-2 text-sm font-medium flex items-center justify-center transition-colors"
                                                >
                                                    <Plus size={16} className="me-2" />
                                                    {t('super.add_btn')}
                                                </button>
                                            </div>
                                        </form>
                                    ) : (
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-2">
                                                {t('sa.csv_instructions')} <code>{t('super.csv_format')}</code> {t('sa.csv_role_hint')}
                                            </label>
                                            <textarea
                                                value={bulkCsvData}
                                                onChange={(e) => setBulkCsvData(e.target.value)}
                                                placeholder={`test1@test.com, alpert, ADMIN\ntest2@test.com, gonenim, VIEWER`}
                                                className="w-full h-32 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono mb-4 custom-scrollbar"
                                            />
                                            <div className="flex justify-end">
                                                <button
                                                    onClick={handleBulkAdd}
                                                    disabled={!bulkCsvData.trim()}
                                                    className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 shadow-cadenza-soft rounded-lg px-6 py-2 text-sm font-medium transition-colors"
                                                >
                                                    {t('sa.process_bulk')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">{t('sa.global_roster').replace('{count}', String(filteredRecords.length))}</h3>
                                    <select
                                        value={filterOrgId}
                                        onChange={(e) => setFilterOrgId(e.target.value)}
                                        className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-xs"
                                    >
                                        <option value="">{t('sa.all_orgs')}</option>
                                        {organizations.map(org => (
                                            <option key={org.id} value={org.id}>{org.name} ({org.id})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-start text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                                                <th className="pb-3 font-medium">{t('sa.col_email')}</th>
                                                <th className="pb-3 font-medium">{t('sa.organization')}</th>
                                                <th className="pb-3 font-medium">{t('sa.role_label')}</th>
                                                <th className="pb-3 font-medium text-end">{t('sa.col_actions')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {filteredRecords.map(record => (
                                                <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                                    <td className="py-3 font-medium text-slate-900 dark:text-slate-300">{record.email || record.id}</td>
                                                    <td className="py-3 text-slate-600 dark:text-slate-400">
                                                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-xs">{record.orgId}</span>
                                                    </td>
                                                    <td className="py-3">
                                                        <select
                                                            value={record.role}
                                                            onChange={(e) => handleUpdateRole(record.id, e.target.value as 'ADMIN' | 'VIEWER')}
                                                            className={`px-2 py-1 rounded text-xs font-medium border-0 cursor-pointer focus:ring-2 focus:ring-blue-500 outline-none
                                                                ${record.role === 'ADMIN' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'}
                                                            `}
                                                        >
                                                            <option value="VIEWER" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-white">{t('sa.viewer')}</option>
                                                            <option value="ADMIN" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-white">{t('sa.admin')}</option>
                                                        </select>
                                                    </td>
                                                    <td className="py-3 text-end">
                                                        <button
                                                            onClick={() => handleDeleteUser(record.id, record.email || record.id)}
                                                            className="text-red-500 hover:text-red-700 p-1 transition-colors"
                                                            title={t('sa.revoke_access')}
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'DEV_TOOLS' && (
                            <div className="p-6">
                                <div className="border-s-4 border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-4 rounded-e-lg mb-6">
                                    <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                                        ⚠️ {t('super.tools_notice')}
                                    </p>
                                </div>

                                <div className="space-y-6">
                                    {/* Test Data Generation */}
                                    <div className="bg-amber-50 dark:bg-amber-900/20 p-5 rounded-lg border border-amber-200 dark:border-amber-700/50">
                                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                            <div>
                                                <h4 className="font-bold text-slate-900 dark:text-white">{t('sa.generate_test')}</h4>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                    {t('sa.test_data_desc')}
                                                </p>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <button
                                                    onClick={() => onWipeData?.()}
                                                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-bold transition-colors shadow-none border border-red-600"
                                                >
                                                    {t('super.wipe_data')}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm(t('super.confirm_snapshot'))) {
                                                            localStorage.setItem('appSnapshot', JSON.stringify({
                                                                teachers: localStorage.getItem('teachers'),
                                                                events: localStorage.getItem('events'),
                                                                rooms: localStorage.getItem('rooms'),
                                                                settings: localStorage.getItem('settings'),
                                                                lists: localStorage.getItem('lists')
                                                            }));
                                                            alert(t('sa.snapshot_created_short'));
                                                        }
                                                        if (window.confirm(t('super.confirm_generate'))) {
                                                            onLoadTestData?.();
                                                            window.alert(t('sa.test_generated'));
                                                        }
                                                    }}
                                                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-bold transition-colors shadow-none border border-amber-600"
                                                >
                                                    {t('sa.generate_btn')}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* State Snapshots & Testing Tools */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-slate-50 dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700">
                                            <h4 className="font-bold text-slate-900 dark:text-white mb-1">{t('sa.state_snapshot')}</h4>
                                            <p className="text-xs text-slate-500 mb-3">{t('sa.snapshot_desc')}</p>
                                            <div className="flex gap-2">
                                                <button onClick={() => {
                                                    localStorage.setItem('appSnapshot', JSON.stringify({
                                                        teachers: localStorage.getItem('teachers'),
                                                        events: localStorage.getItem('events'),
                                                        rooms: localStorage.getItem('rooms'),
                                                        settings: localStorage.getItem('settings'),
                                                        lists: localStorage.getItem('lists')
                                                    }));
                                                    alert(t('sa.snapshot_created'));
                                                }} className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors">{t('sa.create_snapshot')}</button>
                                                <button onClick={() => {
                                                    const snap = localStorage.getItem('appSnapshot');
                                                    if (snap && window.confirm(t('super.confirm_restore'))) {
                                                        const parsed = JSON.parse(snap);
                                                        if (parsed.teachers) localStorage.setItem('teachers', parsed.teachers);
                                                        if (parsed.events) localStorage.setItem('events', parsed.events);
                                                        if (parsed.rooms) localStorage.setItem('rooms', parsed.rooms);
                                                        if (parsed.lists) localStorage.setItem('lists', parsed.lists);
                                                        window.location.reload();
                                                    } else if (!snap) {
                                                        alert(t('sa.no_snapshot'));
                                                    }
                                                }} className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">{t('sa.restore')}</button>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700">
                                            <h4 className="font-bold text-slate-900 dark:text-white mb-1">{t('sa.testing_tools')}</h4>
                                            <p className="text-xs text-slate-500 mb-3">{t('sa.testing_desc')}</p>
                                            <div className="flex gap-2 flex-wrap">
                                                <button onClick={() => {
                                                    if (window.confirm(t('super.confirm_cal_test'))) {
                                                        localStorage.setItem('appSnapshot', JSON.stringify({
                                                            teachers: localStorage.getItem('teachers'),
                                                            events: localStorage.getItem('events'),
                                                            rooms: localStorage.getItem('rooms')
                                                        }));
                                                        onLoadTestData?.();
                                                    }
                                                }} className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors">{t('sa.run_calendar_test')}</button>
                                                <button onClick={() => {
                                                    if (window.confirm(t('super.confirm_teacher_test'))) {
                                                        localStorage.setItem('appSnapshot', JSON.stringify({
                                                            teachers: localStorage.getItem('teachers'),
                                                            events: localStorage.getItem('events'),
                                                            rooms: localStorage.getItem('rooms')
                                                        }));
                                                        onLoadTestData?.();
                                                    }
                                                }} className="px-3 py-1.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-bold rounded hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors">{t('sa.run_teacher_gen')}</button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ActivityId Migration */}
                                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-lg border border-indigo-200 dark:border-indigo-700/50">
                                        <h4 className="font-bold text-slate-900 dark:text-white mb-1">{t('sa.migration_title')}</h4>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                                            {t('sa.migration_desc')}
                                        </p>

                                        <div className="flex gap-2 mb-3">
                                            <button
                                                disabled={migrationRunning}
                                                onClick={() => {
                                                    const nameToId = new Map(activities.map(a => [a.name, a.id]));
                                                    const matched: { id: string; classification: string; activityId: string }[] = [];
                                                    const unmatched: { id: string; classification: string }[] = [];
                                                    let alreadyMigrated = 0;
                                                    events.forEach(evt => {
                                                        if (evt.activityId) { alreadyMigrated++; return; }
                                                        const cls = evt.classification;
                                                        if (!cls) return;
                                                        const aid = nameToId.get(cls);
                                                        if (aid) {
                                                            matched.push({ id: evt.id, classification: cls, activityId: aid });
                                                        } else {
                                                            unmatched.push({ id: evt.id, classification: cls });
                                                        }
                                                    });
                                                    setMigrationReport({ total: events.length, alreadyMigrated, matched, unmatched });
                                                }}
                                                className="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-bold rounded hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                                            >
                                                {t('sa.migration_scan')}
                                            </button>
                                            {migrationReport && migrationReport.matched.length > 0 && (
                                                <button
                                                    disabled={migrationRunning}
                                                    onClick={async () => {
                                                        if (!setEvents || !migrationReport) return;
                                                        if (!window.confirm(t('sa.migration_backfill_confirm').replace('{count}', String(migrationReport.matched.length)))) return;
                                                        setMigrationRunning(true);
                                                        try {
                                                            const batch = writeBatch(db);
                                                            migrationReport.matched.forEach(m => {
                                                                batch.update(doc(db, 'calendarEvents', m.id), { activityId: m.activityId });
                                                            });
                                                            await batch.commit();
                                                            // Update local state
                                                            const idMap = new Map(migrationReport.matched.map(m => [m.id, m.activityId]));
                                                            setEvents(prev => prev.map(evt => {
                                                                const aid = idMap.get(evt.id);
                                                                return aid ? { ...evt, activityId: aid } : evt;
                                                            }));
                                                            setMigrationReport(prev => prev ? { ...prev, matched: [], alreadyMigrated: prev.alreadyMigrated + prev.matched.length } : prev);
                                                            alert(t('sa.migration_backfill_success').replace('{count}', String(migrationReport.matched.length)));
                                                        } catch (err) {
                                                            console.error('Migration error:', err);
                                                            alert(t('sa.migration_backfill_error'));
                                                        } finally {
                                                            setMigrationRunning(false);
                                                        }
                                                    }}
                                                    className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
                                                >
                                                    {migrationRunning ? t('sa.migration_running') : t('sa.migration_backfill_btn').replace('{count}', String(migrationReport.matched.length))}
                                                </button>
                                            )}
                                        </div>

                                        {migrationReport && (
                                            <div className="text-xs space-y-1 bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700">
                                                <p><span className="font-medium">{t('sa.migration_total')}</span> {migrationReport.total}</p>
                                                <p><span className="font-medium text-emerald-600">{t('sa.migration_already')}</span> {migrationReport.alreadyMigrated}</p>
                                                <p><span className="font-medium text-blue-600">{t('sa.migration_matched')}</span> {migrationReport.matched.length}</p>
                                                <p><span className="font-medium text-amber-600">{t('sa.migration_unmatched')}</span> {migrationReport.unmatched.length}</p>
                                                {migrationReport.unmatched.length > 0 && (
                                                    <details className="mt-2">
                                                        <summary className="cursor-pointer text-amber-600 font-medium">{t('sa.migration_show_unmatched')}</summary>
                                                        <ul className="mt-1 ms-4 list-disc text-slate-500">
                                                            {[...new Set(migrationReport.unmatched.map(u => u.classification))].map(cls => (
                                                                <li key={cls}>{cls} ({migrationReport.unmatched.filter(u => u.classification === cls).length} events)</li>
                                                            ))}
                                                        </ul>
                                                    </details>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* System Info */}
                                    <div className="bg-slate-50 dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700">
                                        <h4 className="font-bold text-slate-900 dark:text-white mb-3">{t('sa.system_info')}</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                            <div>
                                                <span className="text-slate-500 block">{t('sa.super_admin_label')}</span>
                                                <span className="text-slate-900 dark:text-white font-mono">{currentUser?.email}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block">{t('sa.total_tenants')}</span>
                                                <span className="text-slate-900 dark:text-white font-bold text-lg">{organizations.length}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block">{t('sa.total_access')}</span>
                                                <span className="text-slate-900 dark:text-white font-bold text-lg">{accessRecords.length}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block">{t('sa.role_label')}</span>
                                                <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded font-bold">{t('sa.superadmin_badge')}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'TRANSLATIONS' && (
                    <div className="h-full pb-20 mt-4">
                        <TranslationManager settings={settings} />
                    </div>
                )}
            </div>
        </div>
    );
};
