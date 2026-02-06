import { FolderOpen, Plus, Play, Download } from 'lucide-react';

export default function TestSuites() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Test Suites
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Manage and execute your API test suites
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          New Suite
        </button>
      </div>

      <div className="card text-center py-12">
        <FolderOpen className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Test Suites Yet
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Create your first test suite to get started
        </p>
        <button className="btn-primary mx-auto">
          Create Test Suite
        </button>
      </div>
    </div>
  );
}
