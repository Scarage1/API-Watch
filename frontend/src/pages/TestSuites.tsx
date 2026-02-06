import { FolderOpen, Plus, FileCode2, Play } from 'lucide-react';

export default function TestSuites() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Test Suites</h1>
          <p className="section-subtitle">Manage and execute your API test suites</p>
        </div>
        <button className="btn-primary">
          <Plus className="w-4 h-4" />
          New Suite
        </button>
      </div>

      {/* Sample Suite Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-hover group">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-brand-50 dark:bg-brand-900/10 ring-1 ring-brand-500/10">
              <FileCode2 className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            </div>
            <div className="badge-neutral">0 tests</div>
          </div>
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white mb-1">
            Sample Suite
          </h3>
          <p className="text-xs text-surface-500 dark:text-surface-400 mb-4">
            Import a YAML test suite to get started with batch testing
          </p>
          <div className="flex items-center gap-2">
            <button className="btn-primary !py-1.5 !px-3 !text-xs">
              <Play className="w-3 h-3" />
              Run
            </button>
            <button className="btn-secondary !py-1.5 !px-3 !text-xs">Edit</button>
          </div>
        </div>
      </div>

      {/* Empty state */}
      <div className="card empty-state">
        <div className="w-14 h-14 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4">
          <FolderOpen className="w-6 h-6 text-surface-400" />
        </div>
        <h3 className="empty-state-title">Create your first suite</h3>
        <p className="empty-state-desc mb-5">
          Group your API tests into suites for organized batch testing and monitoring
        </p>
        <button className="btn-primary">
          <Plus className="w-4 h-4" />
          Create Test Suite
        </button>
      </div>
    </div>
  );
}
