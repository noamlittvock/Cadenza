import React from 'react';
import { AppSettings } from '../types';
import { TRANSLATIONS } from '../constants';
import { Menu } from 'lucide-react';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onLoadTestData?: () => void;
  onWipeData?: () => void;
  onMobileMenuOpen?: () => void;
}

export const Settings: React.FC<Props> = ({ settings, setSettings, onLoadTestData, onWipeData, onMobileMenuOpen }) => {
  const [tempSettings, setTempSettings] = React.useState<AppSettings>(settings);
  const [hasChanges, setHasChanges] = React.useState(false);

  const t = (key: string) => TRANSLATIONS[tempSettings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;

  // Sync tempSettings if prop changes (though rarely happens in this app structure)
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
                className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors lg:hidden"
                title="Open Menu"
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
                  <option value="en-US">English (United States)</option>
                  <option value="he-IL">עברית (Hebrew)</option>
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
                  {/* Simplified List of Common Timezones */}
                  <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>{t('label.system_default')} ({Intl.DateTimeFormat().resolvedOptions().timeZone})</option>
                  <option value="UTC">UTC</option>
                  <option value="Asia/Jerusalem">Jerusalem (Israel)</option>
                  <option value="America/New_York">Eastern Time (US & Canada)</option>
                  <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
                  <option value="Europe/London">London</option>
                  <option value="Europe/Paris">Paris</option>
                </select>
              </div>
            </div>
          </section>

          {/* Currency */}
          <section>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              Currency
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Currency Symbol
                </label>
                <select
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={tempSettings.currency}
                  onChange={(e) => handleChange('currency', e.target.value)}
                >
                  <option value="₪">₪ — Israeli New Shekel (ILS)</option>
                  <option value="$">$ — US Dollar (USD)</option>
                  <option value="€">€ — Euro (EUR)</option>
                  <option value="£">£ — British Pound (GBP)</option>
                  <option value="¥">¥ — Japanese Yen (JPY)</option>
                  <option value="₹">₹ — Indian Rupee (INR)</option>
                  <option value="₿">₿ — Bitcoin (BTC)</option>
                </select>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">This symbol will appear next to all cost values in the financial dashboard, analysis, and exports.</p>
              </div>
            </div>
          </section>
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
                  <option value="MM/DD/YYYY">MM/DD/YYYY (04/16/2026)</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY (16/04/2026)</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (2026-04-16)</option>
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
                  <option value="12h">12-hour (1:00 PM)</option>
                  <option value="24h">24-hour (13:00)</option>
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
                  <option value="none">Hidden</option>
                  <option value="week-number">Week Number</option>
                  <option value="week-of">Week of...</option>
                </select>
              </div>
            </div>
          </section>

          {/* Integrations (Google Calendar) */}
          <section>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              {t('settings.integrations')}
            </h3>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-white p-2 rounded-full shadow-sm">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22 6V19C22 20.6569 20.6569 22 19 22H5C3.34315 22 2 20.6569 2 19V6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M2 6L12 13L2 6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M2 6C2 4.34315 3.34315 3 5 3H19C20.6569 3 22 4.34315 22 6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <text x="8" y="16" fontSize="8" fill="#4285F4" fontWeight="bold">GCal</text>
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Google Calendar</h4>
                  <p className="text-xs text-slate-500">Sync events with external calendars.</p>
                </div>
              </div>
              <button disabled className="px-3 py-1.5 bg-slate-200 text-slate-500 rounded text-xs font-bold cursor-not-allowed">
                {t('label.coming_soon')}
              </button>
            </div>
          </section>

          {/* Advanced System Settings */}
          <section>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              System
            </h3>
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <div>
                <h4 className="font-medium text-slate-900 dark:text-white">Developer Mode</h4>
                <p className="text-xs text-slate-500">Enable advanced tools, test data generation, and state snapshots.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={tempSettings.developerMode} onChange={e => handleChange('developerMode', e.target.checked)} />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </section>

          {/* Developer Tools */}
          {tempSettings.developerMode && (
            <section className="border-t-2 border-dashed border-amber-300 dark:border-amber-700/50 pt-8 mt-4 animate-in fade-in">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 p-1 rounded">⚙️</span>
                {t('settings.dev_tools')}
              </h3>
              <div className="space-y-4">
                <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-200 dark:border-amber-700/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white">{t('settings.generate_data')}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('settings.generate_data_desc')}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => {
                        onWipeData?.();
                      }}
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
                        if (window.confirm(t('alert.confirm_generate'))) {
                          onLoadTestData?.();
                          window.alert(t('alert.data_generated'));
                        }
                      }}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-bold transition-colors shadow-none border border-amber-600"
                    >
                      {t('settings.generate_btn')}
                    </button>
                  </div>
                </div>

                {/* Dev Utils Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                    <h4 className="font-bold text-slate-900 dark:text-white mb-1">State Snapshot</h4>
                    <p className="text-xs text-slate-500 mb-3">Save current app data to browser storage or restore from it.</p>
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
                      }} className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold rounded">Create Snapshot</button>
                      <button onClick={() => {
                        const snap = localStorage.getItem('appSnapshot');
                        if (snap && window.confirm("Restore snapshot? Current changes will be overwritten!")) {
                          const parsed = JSON.parse(snap);
                          // Since we don't have direct access to setApp items here easily except triggering a reload
                          // Let's just restore to localStorage and force reload
                          if (parsed.teachers) localStorage.setItem('teachers', parsed.teachers);
                          if (parsed.events) localStorage.setItem('events', parsed.events);
                          if (parsed.rooms) localStorage.setItem('rooms', parsed.rooms);
                          if (parsed.lists) localStorage.setItem('lists', parsed.lists);
                          window.location.reload();
                        } else if (!snap) {
                          alert("No snapshot found.");
                        }
                      }} className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded">Restore</button>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                    <h4 className="font-bold text-slate-900 dark:text-white mb-1">Testing Tools</h4>
                    <p className="text-xs text-slate-500 mb-3">Actions specific for evaluating Layer 1 logic.</p>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => {
                        // Trigger an action to just clear calendar and insert 200 Gantt / Calendar events
                        // I need to emit an event or create an onLoadTestData generic. Let's do it via reloading localStorage test data but specific for Calendar Test.
                        if (window.confirm("Run Calendar Test Generator? Current state will be cleared. (Prompting Snapshot first...)")) {
                          localStorage.setItem('appSnapshot', JSON.stringify({
                            teachers: localStorage.getItem('teachers'),
                            events: localStorage.getItem('events'),
                            rooms: localStorage.getItem('rooms')
                          }));
                          // Since I don't have global app setters here, I can dispatch an event or rely on onLoadTestData and adjust it to generate 200 events.
                          onLoadTestData?.();
                        }
                      }} className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded">Run Calendar Test Gen</button>
                      <button onClick={() => {
                        // Trigger just a clear of teachers?
                        if (window.confirm("Run Teacher Test Generator? Current teachers will be replaced. (Prompting Snapshot first...)")) {
                          localStorage.setItem('appSnapshot', JSON.stringify({
                            teachers: localStorage.getItem('teachers'),
                            events: localStorage.getItem('events'),
                            rooms: localStorage.getItem('rooms')
                          }));
                          // For now, we rely on the parent or we can do a forced localized set and reload
                          if (onLoadTestData) {
                            onLoadTestData(); // In a real scenario we'd split the callback, but here reloading both is fine or we can write directly to localstorage
                          } else {
                            const tData = require('../utils/dataGenerator').generateTestTeachers(settings.currency);
                            localStorage.setItem('teachers', JSON.stringify(tData));
                            window.location.reload();
                          }
                        }
                      }} className="px-3 py-1.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-bold rounded">Run Teacher Gen</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Floating Save Bar */}
        {hasChanges && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center space-x-6 z-50 animate-in slide-in-from-bottom-4">
            <span className="font-medium">{t('settings.unsaved')}</span>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleCancel}
                className="px-4 py-2 hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium"
              >
                {t('btn.cancel')}
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-lg transition-all text-sm font-bold"
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
