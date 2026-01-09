import React from 'react';
import { AppSettings } from '../types';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const Settings: React.FC<Props> = ({ settings, setSettings }) => {
  
  const handleChange = (key: keyof AppSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">System Settings</h2>
        <p className="text-slate-500 dark:text-slate-400">Configure global application preferences.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 space-y-8">
        
        {/* Localization */}
        <section>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            Localization
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Default Language
              </label>
              <select 
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                value={settings.language}
                onChange={(e) => handleChange('language', e.target.value)}
              >
                <option value="en-US">English (United States)</option>
                <option value="en-GB">English (United Kingdom)</option>
                <option value="es-ES">Spanish</option>
                <option value="fr-FR">French</option>
                <option value="de-DE">German</option>
                <option value="he-IL">Hebrew</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Time Zone
              </label>
              <select 
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                value={settings.timeZone}
                onChange={(e) => handleChange('timeZone', e.target.value)}
              >
                 {/* Simplified List of Common Timezones */}
                 <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>System Default ({Intl.DateTimeFormat().resolvedOptions().timeZone})</option>
                 <option value="UTC">UTC</option>
                 <option value="America/New_York">Eastern Time (US & Canada)</option>
                 <option value="America/Chicago">Central Time (US & Canada)</option>
                 <option value="America/Denver">Mountain Time (US & Canada)</option>
                 <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
                 <option value="Europe/London">London</option>
                 <option value="Europe/Paris">Paris</option>
                 <option value="Asia/Tokyo">Tokyo</option>
              </select>
            </div>
          </div>
        </section>

        {/* Date & Time */}
        <section>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            Date & Time
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Date Format
              </label>
              <select 
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                value={settings.dateFormat}
                onChange={(e) => handleChange('dateFormat', e.target.value)}
              >
                <option value="MM/DD/YYYY">MM/DD/YYYY (04/16/2026)</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY (16/04/2026)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (2026-04-16)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Time Format
              </label>
              <select 
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                value={settings.timeFormat}
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
            Calendar Defaults
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Default Event Duration (minutes)
              </label>
              <input 
                type="number"
                min="15"
                step="15"
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                value={settings.defaultEventDuration}
                onChange={(e) => handleChange('defaultEventDuration', parseInt(e.target.value) || 60)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Week Number Display
              </label>
              <select 
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                value={settings.weekNumberDisplay}
                onChange={(e) => handleChange('weekNumberDisplay', e.target.value)}
              >
                <option value="none">None</option>
                <option value="week-number">Week Number (1-52)</option>
                <option value="week-of">"Week of [Date]"</option>
              </select>
            </div>
          </div>
        </section>

        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-sm text-blue-700 dark:text-blue-300">
           Note: Settings are saved automatically to your local browser storage.
        </div>

      </div>
    </div>
  );
};
