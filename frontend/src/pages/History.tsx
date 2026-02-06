import { Clock, Filter } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export default function History() {
  const { testHistory } = useAppStore();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Test History
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            View all your past API test executions
          </p>
        </div>
        <button className="btn-secondary flex items-center gap-2">
          <Filter className="w-5 h-5" />
          Filter
        </button>
      </div>

      {testHistory.length === 0 ? (
        <div className="card text-center py-12">
          <Clock className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No History Yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Your test execution history will appear here
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {testHistory.map((test, idx) => (
              <div
                key={idx}
                className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm text-gray-900 dark:text-white">
                      {test.request_method} {test.request_url}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {new Date(test.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-1 rounded text-sm font-medium ${
                        test.success
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                      }`}
                    >
                      {test.status_code || 'N/A'}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {(test.response_time * 1000).toFixed(0)}ms
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
