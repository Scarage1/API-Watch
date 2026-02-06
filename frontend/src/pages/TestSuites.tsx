import { useState, useRef } from 'react';
import {
  FolderOpen,
  Plus,
  FileCode2,
  Play,
  Trash2,
  CheckCircle2,
  XCircle,
  Upload,
  X,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Settings2,
  Timer,
  Repeat,
  Layers,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useEnvironmentStore } from '../store/useEnvironmentStore';
import apiClient from '../lib/api';
import { cn } from '../lib/utils';
import type { TestSuite, RequestResult } from '../types';

interface SuiteRunResult {
  suiteName: string;
  results: RequestResult[];
  running: boolean;
  progress: number; // 0-100
  currentIteration: number;
  totalIterations: number;
  currentTest: number;
  totalTests: number;
}

export default function TestSuites() {
  const { testSuites, addTestSuite, removeTestSuite, addBatchToHistory, settings } = useAppStore();
  const { environments, activeEnv } = useEnvironmentStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [suiteRuns, setSuiteRuns] = useState<Record<string, SuiteRunResult>>({});
  const [expandedSuite, setExpandedSuite] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Runner options
  const [showRunnerOpts, setShowRunnerOpts] = useState<string | null>(null);
  const [iterations, setIterations] = useState<Record<string, number>>({});
  const [delay, setDelay] = useState<Record<string, number>>({});
  const [envOverride, setEnvOverride] = useState<Record<string, string>>({});
  const abortRef = useRef<Record<string, boolean>>({});

  const getIterations = (name: string) => iterations[name] || 1;
  const getDelay = (name: string) => delay[name] || 0;

  // Interpolate variables into a string
  const interpolate = (str: string, vars: Record<string, string>): string => {
    return str.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? `{{${key.trim()}}}`);
  };

  const runSuite = async (suite: TestSuite) => {
    setError(null);
    const iters = getIterations(suite.name);
    const delayMs = getDelay(suite.name);
    const totalTests = suite.tests.length * iters;
    abortRef.current[suite.name] = false;

    setSuiteRuns((prev) => ({
      ...prev,
      [suite.name]: {
        suiteName: suite.name,
        results: [],
        running: true,
        progress: 0,
        currentIteration: 1,
        totalIterations: iters,
        currentTest: 0,
        totalTests,
      },
    }));
    setExpandedResults(suite.name);

    // Resolve environment variables
    const envId = envOverride[suite.name];
    let vars: Record<string, string> = {};
    if (envId && envId !== '__none__') {
      const env = environments.find((e) => e.id === envId);
      if (env) vars = env.variables;
    } else if (activeEnv) {
      vars = activeEnv.variables;
    }

    const allResults: RequestResult[] = [];
    let completed = 0;

    try {
      for (let iter = 0; iter < iters; iter++) {
        if (abortRef.current[suite.name]) break;

        const payload = {
          name: suite.name,
          description: suite.description || '',
          base_url: interpolate(suite.base_url, vars),
          defaults: suite.defaults || { timeout_seconds: settings.defaultTimeout, retries: settings.maxRetries },
          auth: suite.auth || {},
          tests: suite.tests.map((t) => ({
            id: t.id,
            method: t.method,
            path: interpolate(t.path, vars),
            description: t.description || '',
            headers: Object.fromEntries(
              Object.entries(t.headers || {}).map(([k, v]) => [k, interpolate(String(v), vars)])
            ),
            params: Object.fromEntries(
              Object.entries(t.params || {}).map(([k, v]) => [k, interpolate(String(v), vars)])
            ),
            body: t.body ? interpolate(typeof t.body === 'string' ? t.body : JSON.stringify(t.body), vars) : null,
            timeout_seconds: t.timeout_seconds || settings.defaultTimeout,
          })),
        };

        const response = await apiClient.post('/api/execute-suite', payload);
        const results: RequestResult[] = response.data;
        allResults.push(...results);
        completed += results.length;

        setSuiteRuns((prev) => ({
          ...prev,
          [suite.name]: {
            ...prev[suite.name],
            results: [...allResults],
            progress: Math.round((completed / totalTests) * 100),
            currentIteration: iter + 1,
            currentTest: completed,
          },
        }));

        // Delay between iterations
        if (delayMs > 0 && iter < iters - 1 && !abortRef.current[suite.name]) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      setSuiteRuns((prev) => ({
        ...prev,
        [suite.name]: { ...prev[suite.name], running: false, progress: 100 },
      }));

      addBatchToHistory(allResults);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to execute suite';
      setError(msg);
      setSuiteRuns((prev) => ({
        ...prev,
        [suite.name]: { ...prev[suite.name], running: false, results: allResults },
      }));
    }
  };

  const stopSuite = (name: string) => {
    abortRef.current[name] = true;
  };

  const deleteSuite = (name: string) => {
    removeTestSuite(name);
    setSuiteRuns((prev) => {
      const copy = { ...prev };
      delete copy[name];
      return copy;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Test Suites</h1>
          <p className="section-subtitle">Manage and execute your API test suites</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          New Suite
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-xl text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Suite Cards */}
      {testSuites.length > 0 ? (
        <div className="space-y-4">
          {testSuites.map((suite) => {
            const run = suiteRuns[suite.name];
            const isExpanded = expandedSuite === suite.name;
            const showResults = expandedResults === suite.name && run;
            const passed = run ? run.results.filter((r) => r.success).length : 0;
            const failed = run ? run.results.filter((r) => !r.success).length : 0;

            return (
              <div key={suite.name} className="card !p-0 overflow-hidden">
                {/* Suite header */}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-brand-50 dark:bg-brand-900/10 ring-1 ring-brand-500/10">
                        <FileCode2 className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-surface-900 dark:text-white">
                          {suite.name}
                        </h3>
                        {suite.description && (
                          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                            {suite.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="badge-neutral">{suite.tests.length} tests</div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-surface-400 mb-4">
                    <span className="font-mono">{suite.base_url}</span>
                    {suite.auth?.type && (
                      <span className="badge-info !text-[10px]">{suite.auth.type}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => run?.running ? stopSuite(suite.name) : runSuite(suite)}
                      disabled={false}
                      className={cn('!py-1.5 !px-3 !text-xs', run?.running ? 'btn-secondary' : 'btn-primary')}
                    >
                      {run?.running ? (
                        <>
                          <X className="w-3 h-3" />
                          Stop
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3" />
                          Run
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowRunnerOpts(showRunnerOpts === suite.name ? null : suite.name)}
                      className={cn('btn-secondary !py-1.5 !px-3 !text-xs', showRunnerOpts === suite.name && 'ring-2 ring-brand-500/30')}
                    >
                      <Settings2 className="w-3 h-3" />
                      Options
                    </button>
                    <button
                      onClick={() => setExpandedSuite(isExpanded ? null : suite.name)}
                      className="btn-secondary !py-1.5 !px-3 !text-xs"
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      Tests
                    </button>
                    <button
                      onClick={() => deleteSuite(suite.name)}
                      className="btn-ghost !py-1.5 !px-3 !text-xs text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Runner Options */}
                  {showRunnerOpts === suite.name && (
                    <div className="mt-4 p-3 bg-surface-50 dark:bg-surface-900/50 rounded-xl space-y-3 animate-slide-up">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-[10px] font-medium text-surface-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                            <Repeat className="w-3 h-3" /> Iterations
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={getIterations(suite.name)}
                            onChange={(e) => setIterations({ ...iterations, [suite.name]: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="input text-xs !py-1.5"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-surface-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                            <Timer className="w-3 h-3" /> Delay (ms)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={30000}
                            step={100}
                            value={getDelay(suite.name)}
                            onChange={(e) => setDelay({ ...delay, [suite.name]: Math.max(0, parseInt(e.target.value) || 0) })}
                            className="input text-xs !py-1.5"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-surface-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                            <Layers className="w-3 h-3" /> Environment
                          </label>
                          <select
                            value={envOverride[suite.name] || ''}
                            onChange={(e) => setEnvOverride({ ...envOverride, [suite.name]: e.target.value })}
                            className="input text-xs !py-1.5"
                          >
                            <option value="">
                              {activeEnv ? `Active (${activeEnv.name})` : 'No environment'}
                            </option>
                            <option value="__none__">None</option>
                            {environments.map((env) => (
                              <option key={env.id} value={env.id}>{env.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                {run?.running && (
                  <div className="px-5 py-3 border-t border-surface-100 dark:border-surface-700/50 bg-surface-50/50 dark:bg-surface-900/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-medium text-surface-500">
                        Iteration {run.currentIteration}/{run.totalIterations} · Test {run.currentTest}/{run.totalTests}
                      </span>
                      <span className="text-[10px] font-semibold text-brand-600 dark:text-brand-400">
                        {run.progress}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-600 dark:bg-brand-500 rounded-full transition-all duration-300"
                        style={{ width: `${run.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Expanded tests list */}
                {isExpanded && (
                  <div className="border-t border-surface-100 dark:border-surface-700/50 bg-surface-50 dark:bg-surface-900/50">
                    <div className="divide-y divide-surface-100 dark:divide-surface-800/50">
                      {suite.tests.map((test) => (
                        <div key={test.id} className="px-5 py-3 flex items-center gap-3">
                          <span className={cn(
                            'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded w-14 text-center',
                            test.method === 'GET' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                            test.method === 'POST' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
                            test.method === 'PUT' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
                            test.method === 'DELETE' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                            'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400'
                          )}>
                            {test.method}
                          </span>
                          <span className="font-mono text-xs text-surface-600 dark:text-surface-300">{test.path}</span>
                          {test.description && (
                            <span className="text-xs text-surface-400 ml-auto">{test.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Run results */}
                {showResults && run.results.length > 0 && (
                  <div className="border-t border-surface-100 dark:border-surface-700/50">
                    <div className="px-5 py-3 bg-surface-50 dark:bg-surface-800/50 flex items-center justify-between">
                      <span className="text-xs font-semibold text-surface-700 dark:text-surface-300">
                        Results
                      </span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          ✓ {passed} passed
                        </span>
                        {failed > 0 && (
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            ✗ {failed} failed
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="divide-y divide-surface-100 dark:divide-surface-800/50">
                      {run.results.map((result, idx) => (
                        <div key={idx} className="px-5 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {result.success ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                            <span className={cn(
                              'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                              result.request_method === 'GET' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                              result.request_method === 'POST' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
                              'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400'
                            )}>
                              {result.request_method}
                            </span>
                            <span className="font-mono text-xs text-surface-600 dark:text-surface-300 truncate max-w-xs">
                              {result.request_url}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className={cn(
                              'font-semibold tabular-nums',
                              result.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                            )}>
                              {result.status_code || 'ERR'}
                            </span>
                            <span className="text-surface-400 tabular-nums">
                              {(result.response_time * 1000).toFixed(0)}ms
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card empty-state">
          <div className="w-14 h-14 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4">
            <FolderOpen className="w-6 h-6 text-surface-400" />
          </div>
          <h3 className="empty-state-title">Create your first suite</h3>
          <p className="empty-state-desc mb-5">
            Group your API tests into suites for organized batch testing and monitoring
          </p>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Create Test Suite
          </button>
        </div>
      )}

      {/* Create Suite Modal */}
      {showCreateModal && (
        <CreateSuiteModal
          onClose={() => setShowCreateModal(false)}
          onSave={(suite) => {
            addTestSuite(suite);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

/* ────────────────────────── Create Suite Modal ────────────────────────── */

function CreateSuiteModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (suite: TestSuite) => void;
}) {
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://jsonplaceholder.typicode.com');
  const [tests, setTests] = useState([
    { id: 'test-1', method: 'GET', path: '/posts/1', description: 'Get post 1' },
  ]);

  const addTest = () => {
    setTests([
      ...tests,
      { id: `test-${tests.length + 1}`, method: 'GET', path: '/', description: '' },
    ]);
  };

  const updateTest = (idx: number, field: string, value: string) => {
    setTests(tests.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  };

  const removeTest = (idx: number) => {
    if (tests.length > 1) {
      setTests(tests.filter((_, i) => i !== idx));
    }
  };

  const handleFormSave = () => {
    if (!name.trim() || !baseUrl.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      base_url: baseUrl.trim(),
      tests: tests.map((t) => ({
        id: t.id,
        method: t.method,
        path: t.path,
        description: t.description || undefined,
      })),
    });
  };

  const handleJsonImport = () => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.name || !parsed.base_url || !Array.isArray(parsed.tests)) {
        setJsonError('JSON must contain name, base_url, and tests array');
        return;
      }
      onSave(parsed as TestSuite);
    } catch {
      setJsonError('Invalid JSON format');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-surface-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 dark:border-surface-700/50">
          <h2 className="text-base font-semibold text-surface-900 dark:text-white">Create Test Suite</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700">
            <X className="w-4 h-4 text-surface-400" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="px-6 pt-4 flex gap-2">
          <button
            onClick={() => setMode('form')}
            className={cn('btn !py-1.5 !px-3 !text-xs', mode === 'form' ? 'bg-brand-600 text-white' : 'btn-secondary')}
          >
            <Plus className="w-3 h-3" />
            Build
          </button>
          <button
            onClick={() => setMode('json')}
            className={cn('btn !py-1.5 !px-3 !text-xs', mode === 'json' ? 'bg-brand-600 text-white' : 'btn-secondary')}
          >
            <Upload className="w-3 h-3" />
            Import JSON
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {mode === 'form' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-surface-500 mb-1 block">Suite Name *</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My API Tests"
                    className="input"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-surface-500 mb-1 block">Base URL *</label>
                  <input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.example.com"
                    className="input font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  className="input"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-surface-700 dark:text-surface-300 uppercase tracking-wide">
                    Test Cases
                  </label>
                  <button onClick={addTest} className="btn-ghost !py-1 !px-2 !text-xs text-brand-600">
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                </div>
                <div className="space-y-2">
                  {tests.map((test, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-surface-50 dark:bg-surface-900/50 p-2.5 rounded-xl">
                      <select
                        value={test.method}
                        onChange={(e) => updateTest(idx, 'method', e.target.value)}
                        className="input !w-24 !py-1.5 text-xs font-bold"
                      >
                        {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <input
                        value={test.path}
                        onChange={(e) => updateTest(idx, 'path', e.target.value)}
                        placeholder="/endpoint"
                        className="input flex-1 font-mono !py-1.5 text-xs"
                      />
                      <input
                        value={test.description}
                        onChange={(e) => updateTest(idx, 'description', e.target.value)}
                        placeholder="Description"
                        className="input flex-1 !py-1.5 text-xs"
                      />
                      <button onClick={() => removeTest(idx)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 text-surface-400 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div>
              <p className="text-xs text-surface-500 mb-2">
                Paste your test suite JSON below. Required fields: name, base_url, tests[].
              </p>
              <textarea
                value={jsonText}
                onChange={(e) => { setJsonText(e.target.value); setJsonError(null); }}
                placeholder={`{
  "name": "My Suite",
  "base_url": "https://api.example.com",
  "tests": [
    { "id": "test-1", "method": "GET", "path": "/users" }
  ]
}`}
                className="input font-mono text-xs !rounded-xl"
                rows={14}
              />
              {jsonError && (
                <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {jsonError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-100 dark:border-surface-700/50 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={mode === 'form' ? handleFormSave : handleJsonImport}
            disabled={mode === 'form' ? !name.trim() || !baseUrl.trim() : !jsonText.trim()}
            className="btn-primary"
          >
            {mode === 'form' ? 'Create Suite' : 'Import Suite'}
          </button>
        </div>
      </div>
    </div>
  );
}
