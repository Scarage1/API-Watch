import { Settings as SettingsIcon, Save } from 'lucide-react';

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Configure your API-Watch preferences
        </p>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          General Settings
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Default Timeout (seconds)
            </label>
            <input type="number" className="input" defaultValue={10} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Max Retries
            </label>
            <input type="number" className="input" defaultValue={3} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Auto-save history
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Automatically save all test executions
              </p>
            </div>
            <input type="checkbox" defaultChecked className="toggle" />
          </div>

          <button className="btn-primary flex items-center gap-2">
            <Save className="w-5 h-5" />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
