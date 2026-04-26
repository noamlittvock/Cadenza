import React from 'react';
import { AppSettings, CalendarEvent } from '../types';
import { TRANSLATIONS } from '../constants';
import { Menu, Loader2, Lock, UserCheck, Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchUserCalendars, GoogleCalendarItem, fetchEventsFromGoogle, ImportedGoogleEvent } from '../utils/googleCalendarSync';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onMobileMenuOpen?: () => void;
  onImportGoogleEvents?: (imported: ImportedGoogleEvent[]) => void;
}

export const Settings: React.FC<Props> = ({ settings, setSettings, onMobileMenuOpen, onImportGoogleEvents }) => {
  const [tempSettings, setTempSettings] = React.useState<AppSettings>(settings);
  const [hasChanges, setHasChanges] = React.useState(false);

  const t = (key: string) => TRANSLATIONS[tempSettings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const { googleAccessToken, currentUser, isAdmin, login } = useAuth();

  const [googleCalendars, setGoogleCalendars] = React.useState<GoogleCalendarItem[]>([]);
  const [isFetchingCals, setIsFetchingCals] = React.useState(false);
  const [calError, setCalError] = React.useState<string | null>(null);

  // Determine if the current user owns the connected GCal account
  const connectedByEmail = tempSettings.googleCalendarConnectedBy;
  const isCalendarOwner = currentUser?.email?.toLowerCase() === connectedByEmail?.toLowerCase();
  const canManageCalendar = isAdmin && (!connectedByEmail || isCalendarOwner);

  React.useEffect(() => {
    // Only fetch calendars if: sync is enabled AND the logged-in user is the calendar owner
    if (googleAccessToken && tempSettings.googleCalendarSyncEnabled && isCalendarOwner) {
      setIsFetchingCals(true);
      fetchUserCalendars(googleAccessToken)
        .then(cals => {
          setGoogleCalendars(cals);
          setCalError(null);
          // Auto-select primary if none selected
          if (!tempSettings.googleCalendarId && cals.length > 0) {
            const primary = cals.find(c => c.primary) || cals[0];
            handleChange('googleCalendarId', primary.id);
          }
        })
        .catch(err => setCalError(err.message))
        .finally(() => setIsFetchingCals(false));
    }
  }, [googleAccessToken, tempSettings.googleCalendarSyncEnabled, isCalendarOwner]);

  const handleConnectGoogle = async () => {
    if (!googleAccessToken) {
      await login();
    }
    // Lock this calendar connection to the current user's email
    handleChange('googleCalendarConnectedBy', currentUser?.email || '');
    handleChange('googleCalendarSyncEnabled', true);
  };

  const handleDisconnectGoogle = () => {
    handleChange('googleCalendarSyncEnabled', false);
    handleChange('googleCalendarId', undefined);
    handleChange('googleCalendarConnectedBy', undefined);
  };

  // Google Calendar Import state
  const [isImporting, setIsImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<{ count: number; message: string } | null>(null);

  const handleImportFromGoogle = async () => {
    if (!googleAccessToken || !tempSettings.googleCalendarId || !onImportGoogleEvents) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      // Import events for ±60 days from today
      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();
      const imported = await fetchEventsFromGoogle(googleAccessToken, tempSettings.googleCalendarId, timeMin, timeMax);
      if (imported.length === 0) {
        setImportResult({ count: 0, message: t('settings.import_no_events') });
      } else {
        onImportGoogleEvents(imported);
        setImportResult({ count: imported.length, message: t('settings.import_success').replace('{count}', String(imported.length)) });
      }
    } catch (err: any) {
      setImportResult({ count: 0, message: err.message || 'Import failed' });
    } finally {
      setIsImporting(false);
      setTimeout(() => setImportResult(null), 5000);
    }
  };

  // Sync tempSettings if prop changes
  React.useEffect(() => {
    setTempSettings(settings);
    setHasChanges(false);
  }, [settings]);

  const handleChange = (key: keyof AppSettings, value: any) => {
    setTempSettings(prev => {
      const next = { ...prev, [key]: value };
      setHasChanges(JSON.stringify(next) !== JSON.stringify(settings));
      return next;
    });
  };

  const handleSave = () => {
    setSettings(tempSettings);
    setHasChanges(false);
  };

  const handleCancel = () => {
    setTempSettings(settings);
    setHasChanges(false);
  };

  return (
    <div className="h-full overflow-y-auto w-full custom-scrollbar">
      <div className="p-8 max-w-3xl mx-auto pb-24">
        <div className="mb-8 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {onMobileMenuOpen && (
              <button
                onClick={onMobileMenuOpen}
                className="p-2 -ms-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors lg:hidden"
                title={t('settings.open_menu')}
              >
                <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
              </button>
            )}
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{t('nav.settings')}</h2>
              <p className="text-slate-500 dark:text-slate-400">{t('settings.general')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 space-y-8">

          {/* Localization */}
          <section>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              {t('nav.section.localization')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('label.default_lang')}
                </label>
                <select
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={tempSettings.language}
                  onChange={(e) => handleChange('language', e.target.value)}
                >
                  <option value="en-US">{t('settings.english_us')}</option>
                  <option value="he-IL">{t('settings.hebrew_lang')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('label.timezone')}
                </label>
                <select
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={tempSettings.timeZone}
                  onChange={(e) => handleChange('timeZone', e.target.value)}
                >
                  <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>{t('label.system_default')} ({Intl.DateTimeFormat().resolvedOptions().timeZone})</option>
                  <option value="UTC">{t('settings.tz_utc')}</option>
                  <option value="Asia/Jerusalem">{t('settings.tz_jerusalem')}</option>
                  <option value="America/New_York">{t('settings.tz_eastern')}</option>
                  <option value="America/Los_Angeles">{t('settings.tz_pacific')}</option>
                  <option value="Europe/London">{t('settings.tz_london')}</option>
                  <option value="Europe/Paris">{t('settings.tz_paris')}</option>
                </select>
              </div>
            </div>
          </section>

          {/* Date & Time */}
          <section>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              {t('nav.section.date_time')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('label.date_format')}
                </label>
                <select
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={tempSettings.dateFormat}
                  onChange={(e) => handleChange('dateFormat', e.target.value)}
                >
                  <option value="MM/DD/YYYY">{t('settings.date_mmddyyyy')}</option>
                  <option value="DD/MM/YYYY">{t('settings.date_ddmmyyyy')}</option>
                  <option value="YYYY-MM-DD">{t('settings.date_iso')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('label.time_format')}
                </label>
                <select
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={tempSettings.timeFormat}
                  onChange={(e) => handleChange('timeFormat', e.target.value)}
                >
                  <option value="12h">{t('settings.time_12h')}</option>
                  <option value="24h">{t('settings.time_24h')}</option>
                </select>
              </div>
            </div>
          </section>

          {/* Calendar Defaults */}
          <section>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              {t('label.calendar_defaults')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('label.default_duration')}
                </label>
                <input
                  type="number"
                  min="15"
                  step="15"
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={tempSettings.defaultEventDuration}
                  onChange={(e) => handleChange('defaultEventDuration', parseInt(e.target.value) || 60)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('label.week_numbers')}
                </label>
                <select
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={tempSettings.weekNumberDisplay}
                  onChange={(e) => handleChange('weekNumberDisplay', e.target.value)}
                >
                  <option value="none">{t('settings.hidden')}</option>
                  <option value="week-number">{t('settings.week_number')}</option>
                  <option value="week-of">{t('settings.week_of')}</option>
                </select>
              </div>
            </div>
          </section>

          {/* School Year */}
          <section>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              {t('settings.academic_calendar')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('settings.school_year_start')}
                </label>
                <input
                  type="date"
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={tempSettings.schoolYearStartDate || ''}
                  onChange={(e) => handleChange('schoolYearStartDate', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('settings.school_year_end')}
                </label>
                <input
                  type="date"
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={tempSettings.schoolYearEndDate || ''}
                  onChange={(e) => handleChange('schoolYearEndDate', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('settings.school_year_label')}
                </label>
                <input
                  type="text"
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={tempSettings.schoolYearLabel || ''}
                  onChange={(e) => handleChange('schoolYearLabel', e.target.value)}
                  placeholder="2024-2025"
                />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t('settings.school_year_label_desc')}</p>
              </div>
            </div>
          </section>

          {/* Integrations (Google Calendar) */}
          <section>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              {t('settings.integrations')}
            </h3>
            <div className={`bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border transition-colors ${tempSettings.googleCalendarSyncEnabled ? 'border-blue-500 shadow-sm' : 'border-slate-200 dark:border-slate-700'}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4 rtl:space-x-reverse">
                  <div className="bg-white p-2 rounded-full shadow-sm shrink-0">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22 6V19C22 20.6569 20.6569 22 19 22H5C3.34315 22 2 20.6569 2 19V6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M2 6L12 13L2 6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M2 6C2 4.34315 3.34315 3 5 3H19C20.6569 3 22 4.34315 22 6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <text x="8" y="16" fontSize="8" fill="#4285F4" fontWeight="bold">{t('settings.gcal_label')}</text>
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white hover:text-blue-600 transition-colors">{t('settings.gcal_title')}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{t('settings.gcal_desc')}</p>
                    {!tempSettings.googleCalendarSyncEnabled && (
                      <p className="text-xs text-blue-500 dark:text-blue-400 mt-1 font-medium flex items-center gap-1">
                        <Download size={12} />
                        {t('settings.google_import_hint') || 'Connect to import your existing Google Calendar events'}
                      </p>
                    )}
                  </div>
                </div>

                {!tempSettings.googleCalendarSyncEnabled ? (
                  isAdmin ? (
                    <button
                      onClick={handleConnectGoogle}
                      className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-xl text-xs font-bold  transition-colors whitespace-nowrap active:scale-95"
                    >
                      {t('settings.connect_account')}
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Lock size={14} />
                      <span>{t('settings.admin_only')}</span>
                    </div>
                  )
                ) : (
                  canManageCalendar ? (
                    <button
                      onClick={handleDisconnectGoogle}
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white text-slate-700 rounded-xl text-xs font-bold transition-colors whitespace-nowrap"
                    >
                      {t('settings.disconnect')}
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Lock size={14} />
                      <span>{t('settings.managed_by_tenant')}</span>
                    </div>
                  )
                )}
              </div>

              {/* Connected Account Badge */}
              {tempSettings.googleCalendarSyncEnabled && connectedByEmail && (
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <UserCheck size={14} className="text-green-500" />
                  <span className="text-slate-600 dark:text-slate-400">
                    {t('settings.connected_via')} <span className="font-semibold text-slate-800 dark:text-slate-200">{connectedByEmail}</span>
                  </span>
                  {!isCalendarOwner && (
                    <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
                      {t('settings.diff_account')}
                    </span>
                  )}
                </div>
              )}

              {/* Connected Settings Expanded view — only visible to the calendar owner */}
              {tempSettings.googleCalendarSyncEnabled && isCalendarOwner && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 ps-14">
                  {!googleAccessToken ? (
                    <div className="flex items-center gap-3 text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-700/50">
                      <span>{t('settings.token_expired')}</span>
                      <button onClick={handleConnectGoogle} className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium shadow-sm text-xs">{t('settings.gcal_reconnect')}</button>
                    </div>
                  ) : isFetchingCals ? (
                    <div className="flex items-center text-sm text-slate-500 dark:text-slate-400 gap-2">
                      <Loader2 size={16} className="animate-spin" /> {t('settings.fetching_calendars')}
                    </div>
                  ) : calError ? (
                    <div className="text-sm text-red-500">{t('settings.cal_error').replace('{error}', calError)}</div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {t('settings.select_target_cal')}
                      </label>
                      <select
                        className="w-full max-w-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                        value={tempSettings.googleCalendarId || ""}
                        onChange={(e) => handleChange('googleCalendarId', e.target.value)}
                      >
                        <option value="" disabled>{t('settings.choose_calendar')}</option>
                        {googleCalendars.map(cal => (
                          <option key={cal.id} value={cal.id}>{cal.summary} {cal.primary ? t('settings.cal_primary') : ''}</option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-500 mt-2">{t('settings.gcal_auto_note')}</p>

                      {/* Import from Google */}
                      {tempSettings.googleCalendarId && onImportGoogleEvents && (
                        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={handleImportFromGoogle}
                              disabled={isImporting}
                              className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50"
                            >
                              {isImporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                              {t('settings.import_from_google')}
                            </button>
                            {importResult && (
                              <span className={`text-xs font-medium ${importResult.count > 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {importResult.message}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1.5">{t('settings.import_desc')}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Non-owner but connected — show read-only info */}
              {tempSettings.googleCalendarSyncEnabled && !isCalendarOwner && connectedByEmail && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 ps-14">
                  <div className="flex items-center gap-3 text-sm text-slate-500 bg-slate-100 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <Lock size={16} className="text-slate-400 shrink-0" />
                    <div>
                      <p className="font-medium text-slate-700 dark:text-slate-300">Calendar sync is managed by {connectedByEmail}</p>
                      <p className="text-xs mt-0.5">Events will only sync to Google Calendar when the designated admin ({connectedByEmail}) is logged in. Only that account can modify the calendar configuration.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Floating Save Bar */}
        {hasChanges && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center space-x-6 rtl:space-x-reverse z-50 animate-in slide-in-from-bottom-4">
            <span className="font-medium">{t('settings.unsaved')}</span>
            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <button
                onClick={handleCancel}
                className="px-4 py-2 hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium"
              >
                {t('btn.cancel')}
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg shadow-lg transition-all text-sm font-bold"
              >
                {t('btn.save')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
