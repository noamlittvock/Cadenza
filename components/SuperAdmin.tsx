import React, { useState, useEffect, useRef } from 'react';
import { collection, query, getDocs, doc, setDoc, deleteDoc, updateDoc, writeBatch, getDoc, where } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../utils/firebase';
import { useAuth } from '../context/AuthContext';
import { Users, Building, AlertCircle, Plus, Trash2, ShieldCheck, Loader2, ImagePlus, Wrench, Edit2, Save, X } from 'lucide-react';

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
}

export const SuperAdmin: React.FC<SuperAdminProps> = ({ onLoadTestData, onWipeData }) => {
    const { currentUser, isSuperAdmin } = useAuth();
    const [activeTab, setActiveTab] = useState<'ORGS' | 'USERS' | 'DEV_TOOLS'>('ORGS');
    const [loading, setLoading] = useState(true);

    // Data State
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [accessRecords, setAccessRecords] = useState<AccessRecord[]>([]);

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
                <h2 className="text-2xl font-bold">Access Denied</h2>
                <p>This area is restricted to the platform super-administrator.</p>
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
            setErrorMsg("Failed to load data. Make sure rules allow super admin reading.");
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
            setErrorMsg("Failed to create organization.");
        }
    };

    const handleDeleteOrg = async (slug: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete the entire organization "${name}"? This will not delete the data within it, but will remove it from the selector list.`)) return;
        try {
            await deleteDoc(doc(db, 'organizations', slug));
            loadData();
        } catch (err) {
            setErrorMsg("Failed to delete organization.");
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
                setErrorMsg("Failed to update organization name.");
            }
            return;
        }

        if (!window.confirm(`WARNING: Changing the tenant ID from "${oldSlug}" to "${newSlug}" will migrate all records across the platform. Continue?`)) return;

        setLoading(true);
        try {
            const existingDest = await getDoc(doc(db, 'organizations', newSlug));
            if (existingDest.exists()) {
                setErrorMsg(`Cannot change ID to ${newSlug} because that organization already exists.`);
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
            setErrorMsg("Failed to migrate organization data.");
            setLoading(false);
        }
    };

    const handleLogoUpload = async (file: File, orgId: string) => {
        if (!file.type.startsWith('image/')) {
            setErrorMsg("Please upload a valid image file.");
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
                setErrorMsg("Failed to upload logo.");
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
                    setErrorMsg("Failed to update organization with new logo.");
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
            setErrorMsg("Failed to assign user access.");
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
            setErrorMsg("Failed to process bulk upload.");
            setLoading(false);
        }
    };

    const handleDeleteUser = async (recordId: string, email: string) => {
        if (!window.confirm(`Are you sure you want to revoke access for ${email}?`)) return;
        try {
            await deleteDoc(doc(db, 'access_control', recordId));
            loadData();
        } catch (err) {
            setErrorMsg("Failed to delete user access.");
        }
    };

    const handleUpdateRole = async (recordId: string, newRole: 'ADMIN' | 'VIEWER') => {
        try {
            await updateDoc(doc(db, 'access_control', recordId), { role: newRole });

            // Optimistically update local state
            setAccessRecords(prev => prev.map(r => r.id === recordId ? { ...r, role: newRole } : r));
        } catch (err) {
            setErrorMsg("Failed to update user role.");
            loadData(); // Revert on failure
        }
    };

    const filteredRecords = filterOrgId
        ? accessRecords.filter(r => r.orgId === filterOrgId)
        : accessRecords;

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-y-auto">
            <div className="p-8 max-w-5xl mx-auto w-full">
                <div className="flex items-center space-x-4 mb-8">
                    <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 text-red-600 rounded-xl flex items-center justify-center">
                        <ShieldCheck size={28} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Super Admin Console</h1>
                        <p className="text-slate-500">Manage Tenants, Access Control & Developer Tools</p>
                    </div>
                </div>

                {errorMsg && (
                    <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-lg flex items-center">
                        <AlertCircle size={20} className="mr-3" />
                        {errorMsg}
                    </div>
                )}

                {/* Tabs */}
                <div className="flex space-x-4 mb-6 border-b border-slate-200 dark:border-slate-800">
                    <button
                        onClick={() => setActiveTab('ORGS')}
                        className={`pb-4 px-2 font-medium transition-colors border-b-2 ${activeTab === 'ORGS' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                            }`}
                    >
                        <div className="flex items-center space-x-2">
                            <Building size={18} />
                            <span>Organizations</span>
                        </div>
                    </button>
                    <button
                        onClick={() => setActiveTab('USERS')}
                        className={`pb-4 px-2 font-medium transition-colors border-b-2 ${activeTab === 'USERS' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                            }`}
                    >
                        <div className="flex items-center space-x-2">
                            <Users size={18} />
                            <span>Access Mappings</span>
                        </div>
                    </button>
                    <button
                        onClick={() => setActiveTab('DEV_TOOLS')}
                        className={`pb-4 px-2 font-medium transition-colors border-b-2 ${activeTab === 'DEV_TOOLS' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                            }`}
                    >
                        <div className="flex items-center space-x-2">
                            <Wrench size={18} />
                            <span>Developer Tools</span>
                        </div>
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20 text-slate-400">
                        <Loader2 className="animate-spin mr-3" size={24} />
                        Loading super admin data...
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                        {activeTab === 'ORGS' && (
                            <div className="p-6">
                                <form onSubmit={handleCreateOrg} className="mb-8 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <h3 className="font-semibold mb-4 text-slate-800 dark:text-slate-200">Register New Organization</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Organization Name</label>
                                            <input
                                                type="text"
                                                value={newOrgName}
                                                onChange={(e) => setNewOrgName(e.target.value)}
                                                placeholder="e.g. Alpert Music Center"
                                                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">URL Slug (ID)</label>
                                            <input
                                                type="text"
                                                value={newOrgSlug}
                                                onChange={(e) => setNewOrgSlug(e.target.value)}
                                                placeholder="e.g. alpert (no spaces)"
                                                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div className="flex items-end">
                                            <button
                                                type="submit"
                                                disabled={!newOrgName || !newOrgSlug}
                                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center justify-center transition-colors"
                                            >
                                                <Plus size={16} className="mr-2" />
                                                Create Tenant
                                            </button>
                                        </div>
                                    </div>
                                </form>

                                <h3 className="font-semibold mb-4 text-slate-800 dark:text-slate-200">Active Organizations ({organizations.length})</h3>
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
                                                <div className="flex items-center space-x-3 w-full max-w-lg">
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
                                                                    placeholder="Organization Name"
                                                                />
                                                                <div className="flex items-center text-xs">
                                                                    <span className="text-slate-500 mr-1">ID:</span>
                                                                    <input
                                                                        type="text"
                                                                        value={editOrgSlug}
                                                                        onChange={(e) => setEditOrgSlug(e.target.value)}
                                                                        className="bg-slate-200 dark:bg-slate-800 border-none rounded px-2 py-0.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                                        placeholder="url-slug"
                                                                    />
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <p className="font-medium text-slate-900 dark:text-white">{org.name}</p>
                                                                <p className="text-xs text-slate-500">ID: <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">{org.id}</code></p>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center space-x-2 shrink-0 ml-4">
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
                                                                title="Edit Organization"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedUploadOrgId(org.id);
                                                                    fileInputRef.current?.click();
                                                                }}
                                                                className="p-2 text-slate-400 hover:text-blue-500 transition-colors relative"
                                                                title="Upload Logo"
                                                                disabled={uploadingOrgId === org.id}
                                                            >
                                                                {uploadingOrgId === org.id ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteOrg(org.id, org.name)}
                                                                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                                                                title="Delete Organization"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => handleEditOrgSave(org.id)}
                                                                className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
                                                                title="Save Changes"
                                                            >
                                                                <Save size={18} />
                                                            </button>
                                                            <button
                                                                onClick={() => setEditingOrgId(null)}
                                                                className="p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                                                                title="Cancel"
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
                                        <div className="text-center py-8 text-slate-500">No organizations registered yet.</div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'USERS' && (
                            <div className="p-6">
                                <div className="mb-8 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-semibold text-slate-800 dark:text-slate-200">Map User to Organization</h3>
                                        <button
                                            onClick={() => setIsBulkMode(!isBulkMode)}
                                            className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline transition-all"
                                        >
                                            {isBulkMode ? "Switch to Single Entry" : "Switch to Bulk CSV Entry"}
                                        </button>
                                    </div>

                                    {!isBulkMode ? (
                                        <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                            <div className="md:col-span-2">
                                                <label className="block text-xs text-slate-500 mb-1">User Email (Gmail)</label>
                                                <input
                                                    type="email"
                                                    value={newUserEmail}
                                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                                    placeholder="user@gmail.com"
                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-500 mb-1">Organization</label>
                                                <select
                                                    value={newUserOrgId}
                                                    onChange={(e) => setNewUserOrgId(e.target.value)}
                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                >
                                                    <option value="">Select Org...</option>
                                                    {organizations.map(org => (
                                                        <option key={org.id} value={org.id}>{org.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-500 mb-1">Role</label>
                                                <select
                                                    value={newUserRole}
                                                    onChange={(e) => setNewUserRole(e.target.value as 'ADMIN' | 'VIEWER')}
                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                >
                                                    <option value="VIEWER">Viewer</option>
                                                    <option value="ADMIN">Admin</option>
                                                </select>
                                            </div>
                                            <div className="flex items-end">
                                                <button
                                                    type="submit"
                                                    disabled={!newUserEmail || !newUserOrgId}
                                                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center justify-center transition-colors"
                                                >
                                                    <Plus size={16} className="mr-2" />
                                                    Add
                                                </button>
                                            </div>
                                        </form>
                                    ) : (
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-2">
                                                Paste CSV data. Format: <code>email, organization_slug, role</code> (Role defaults to VIEWER if omitted, use ADMIN for admins)
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
                                                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-6 py-2 text-sm font-medium transition-colors"
                                                >
                                                    Process Bulk Import
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">Global Access Roster ({filteredRecords.length})</h3>
                                    <select
                                        value={filterOrgId}
                                        onChange={(e) => setFilterOrgId(e.target.value)}
                                        className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-xs"
                                    >
                                        <option value="">All Organizations</option>
                                        {organizations.map(org => (
                                            <option key={org.id} value={org.id}>{org.name} ({org.id})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                                                <th className="pb-3 font-medium">Email</th>
                                                <th className="pb-3 font-medium">Organization</th>
                                                <th className="pb-3 font-medium">Role</th>
                                                <th className="pb-3 font-medium text-right">Actions</th>
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
                                                            <option value="VIEWER" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-white">VIEWER</option>
                                                            <option value="ADMIN" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-white">ADMIN</option>
                                                        </select>
                                                    </td>
                                                    <td className="py-3 text-right">
                                                        <button
                                                            onClick={() => handleDeleteUser(record.id, record.email || record.id)}
                                                            className="text-red-500 hover:text-red-700 p-1 transition-colors"
                                                            title="Revoke Access"
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
                                <div className="border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-4 rounded-r-lg mb-6">
                                    <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                                        ⚠️ These tools are exclusively available to the Super Admin. No tenant admin can access them.
                                    </p>
                                </div>

                                <div className="space-y-6">
                                    {/* Test Data Generation */}
                                    <div className="bg-amber-50 dark:bg-amber-900/20 p-5 rounded-lg border border-amber-200 dark:border-amber-700/50">
                                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                            <div>
                                                <h4 className="font-bold text-slate-900 dark:text-white">Generate Test Data</h4>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                    Populate the current workspace with realistic test teachers, events, rooms, and Gantt blocks for evaluation purposes.
                                                </p>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <button
                                                    onClick={() => onWipeData?.()}
                                                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-bold transition-colors shadow-none border border-red-600"
                                                >
                                                    Wipe Data
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm("Would you like to take a Snapshot of current state before generating test data?")) {
                                                            localStorage.setItem('appSnapshot', JSON.stringify({
                                                                teachers: localStorage.getItem('teachers'),
                                                                events: localStorage.getItem('events'),
                                                                rooms: localStorage.getItem('rooms'),
                                                                settings: localStorage.getItem('settings'),
                                                                lists: localStorage.getItem('lists')
                                                            }));
                                                            alert("Snapshot created!");
                                                        }
                                                        if (window.confirm("Generate test data? This will overwrite current data in this workspace.")) {
                                                            onLoadTestData?.();
                                                            window.alert("Test data generated successfully!");
                                                        }
                                                    }}
                                                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-bold transition-colors shadow-none border border-amber-600"
                                                >
                                                    Generate Test Data
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* State Snapshots & Testing Tools */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-slate-50 dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700">
                                            <h4 className="font-bold text-slate-900 dark:text-white mb-1">State Snapshot</h4>
                                            <p className="text-xs text-slate-500 mb-3">Save current app data to browser storage or restore from a previous snapshot.</p>
                                            <div className="flex gap-2">
                                                <button onClick={() => {
                                                    localStorage.setItem('appSnapshot', JSON.stringify({
                                                        teachers: localStorage.getItem('teachers'),
                                                        events: localStorage.getItem('events'),
                                                        rooms: localStorage.getItem('rooms'),
                                                        settings: localStorage.getItem('settings'),
                                                        lists: localStorage.getItem('lists')
                                                    }));
                                                    alert("Snapshot created successfully!");
                                                }} className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors">Create Snapshot</button>
                                                <button onClick={() => {
                                                    const snap = localStorage.getItem('appSnapshot');
                                                    if (snap && window.confirm("Restore snapshot? Current changes will be overwritten!")) {
                                                        const parsed = JSON.parse(snap);
                                                        if (parsed.teachers) localStorage.setItem('teachers', parsed.teachers);
                                                        if (parsed.events) localStorage.setItem('events', parsed.events);
                                                        if (parsed.rooms) localStorage.setItem('rooms', parsed.rooms);
                                                        if (parsed.lists) localStorage.setItem('lists', parsed.lists);
                                                        window.location.reload();
                                                    } else if (!snap) {
                                                        alert("No snapshot found.");
                                                    }
                                                }} className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">Restore</button>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700">
                                            <h4 className="font-bold text-slate-900 dark:text-white mb-1">Testing Tools</h4>
                                            <p className="text-xs text-slate-500 mb-3">Actions specific for evaluating Layer 1 logic.</p>
                                            <div className="flex gap-2 flex-wrap">
                                                <button onClick={() => {
                                                    if (window.confirm("Run Calendar Test Generator? Current state will be cleared. (Snapshot taken automatically)")) {
                                                        localStorage.setItem('appSnapshot', JSON.stringify({
                                                            teachers: localStorage.getItem('teachers'),
                                                            events: localStorage.getItem('events'),
                                                            rooms: localStorage.getItem('rooms')
                                                        }));
                                                        onLoadTestData?.();
                                                    }
                                                }} className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors">Run Calendar Test Gen</button>
                                                <button onClick={() => {
                                                    if (window.confirm("Run Teacher Test Generator? Current teachers will be replaced. (Snapshot taken automatically)")) {
                                                        localStorage.setItem('appSnapshot', JSON.stringify({
                                                            teachers: localStorage.getItem('teachers'),
                                                            events: localStorage.getItem('events'),
                                                            rooms: localStorage.getItem('rooms')
                                                        }));
                                                        onLoadTestData?.();
                                                    }
                                                }} className="px-3 py-1.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-bold rounded hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors">Run Teacher Gen</button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* System Info */}
                                    <div className="bg-slate-50 dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700">
                                        <h4 className="font-bold text-slate-900 dark:text-white mb-3">System Information</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                            <div>
                                                <span className="text-slate-500 block">Super Admin</span>
                                                <span className="text-slate-900 dark:text-white font-mono">{currentUser?.email}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block">Total Tenants</span>
                                                <span className="text-slate-900 dark:text-white font-bold text-lg">{organizations.length}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block">Total Access Records</span>
                                                <span className="text-slate-900 dark:text-white font-bold text-lg">{accessRecords.length}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block">Role</span>
                                                <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded font-bold">SUPERADMIN</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
