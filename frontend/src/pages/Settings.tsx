import { useState } from 'react';
import { Save, Globe, Shield, Bell, Palette, Check } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export default function Settings() {
  const { darkMode, toggleDarkMode, settings, updateSettings } = useAppStore();
  const [saved, setSaved] = useState(false);

  // Local form state synced from store
  const [timeout, setTimeout] = useState(settings.defaultTimeout);
  const [retries, setRetries] = useState(settings.maxRetries);
  const [autoSave, setAutoSave] = useState(settings.autoSaveHistory);
  const [alerts, setAlerts] = useState(settings.failureAlerts);
  const [token, setToken] = useState(settings.apiToken);

  const handleSave = () => {
    updateSettings({
      defaultTimeout: timeout,
      maxRetries: retries,
      autoSaveHistory: autoSave,
      failureAlerts: alerts,
      apiToken: token,
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const sections = [
    {
      title: 'General',
      icon: Globe,
      settings: [
        {
          label: 'Default Timeout',
          desc: 'Max wait time for API responses',
          input: (
            <input
              type="number"
              className="input !w-24 text-center text-sm"
              value={timeout}
              onChange={(e) => setTimeout(Math.max(1, Math.min(120, parseInt(e.target.value) || 1)))}
              min={1}
              max={120}
            />
          ),
          unit: 'seconds',
        },
        {
          label: 'Max Retries',
          desc: 'Number of retry attempts on failure',
          input: (
            <input
              type="number"
              className="input !w-24 text-center text-sm"
              value={retries}
              onChange={(e) => setRetries(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
              min={0}
              max={10}
            />
          ),
          unit: 'attempts',
        },
      ],
    },
    {
      title: 'Appearance',
      icon: Palette,
      settings: [
        {
          label: 'Dark Mode',
          desc: 'Switch between light and dark themes',
          input: (
            <button
              onClick={toggleDarkMode}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${darkMode ? 'bg-brand-600' : 'bg-surface-200 dark:bg-surface-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${darkMode ? 'translate-x-5' : ''}`} />
            </button>
          ),
        },
      ],
    },
    {
      title: 'Notifications',
      icon: Bell,
      settings: [
        {
          label: 'Auto-save history',
          desc: 'Automatically save all test executions',
          input: (
            <button
              onClick={() => setAutoSave(!autoSave)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${autoSave ? 'bg-brand-600' : 'bg-surface-200 dark:bg-surface-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${autoSave ? 'translate-x-5' : ''}`} />
            </button>
          ),
        },
        {
          label: 'Failure alerts',
          desc: 'Show alerts when tests fail',
          input: (
            <button
              onClick={() => setAlerts(!alerts)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${alerts ? 'bg-brand-600' : 'bg-surface-200 dark:bg-surface-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${alerts ? 'translate-x-5' : ''}`} />
            </button>
          ),
        },
      ],
    },
    {
      title: 'Security',
      icon: Shield,
      settings: [
        {
          label: 'API Token',
          desc: 'Authentication token for backend API',
          input: (
            <input
              type="password"
              className="input !w-48 text-sm font-mono"
              placeholder="••••••••"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          ),
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title">Settings</h1>
        <p className="section-subtitle">Configure your API-Watch preferences</p>
      </div>

      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.title} className="card">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="p-2 rounded-xl bg-surface-100 dark:bg-surface-800">
                <section.icon className="w-4 h-4 text-surface-500" />
              </div>
              <h3 className="text-sm font-semibold text-surface-900 dark:text-white">{section.title}</h3>
            </div>

            <div className="space-y-4">
              {section.settings.map((setting) => (
                <div
                  key={setting.label}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-surface-700 dark:text-surface-300">
                      {setting.label}
                    </p>
                    <p className="text-xs text-surface-400 dark:text-surface-500 mt-0.5">
                      {setting.desc}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {setting.input}
                    {'unit' in setting && setting.unit && (
                      <span className="text-xs text-surface-400">{setting.unit}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <button onClick={handleSave} className="btn-primary w-full sm:w-auto">
          {saved ? (
            <>
              <Check className="w-4 h-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}
