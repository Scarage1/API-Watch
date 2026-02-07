/**
 * GraphQL Client page.
 * Query editor, variables panel, introspection schema explorer, saved queries.
 */
import { useCallback, useState } from 'react';
import {
  Play, Loader2, Save, Trash2, BookOpen, RefreshCw,
  ChevronDown, ChevronRight, Copy, Check, Braces, Globe, Bookmark,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useGraphQLStore } from '../store/useGraphQLStore';
import type { GQLSchemaType } from '../store/useGraphQLStore';
import { toast } from '../store/useToastStore';

const INTROSPECTION_QUERY = `{
  __schema {
    types {
      name
      kind
      description
      fields {
        name
        description
        type { name kind ofType { name kind ofType { name kind } } }
      }
    }
  }
}`;

function flattenType(typeObj: any): string {
  if (!typeObj) return 'Unknown';
  if (typeObj.name) return typeObj.name;
  if (typeObj.kind === 'NON_NULL') return `${flattenType(typeObj.ofType)}!`;
  if (typeObj.kind === 'LIST') return `[${flattenType(typeObj.ofType)}]`;
  return typeObj.kind || 'Unknown';
}

export default function GraphQLClient() {
  const {
    endpoint, query, variables, headers, response, loading, error, responseTime,
    schema, schemaLoading, savedQueries,
    setEndpoint, setQuery, setVariables, setHeaders, setResponse,
    setLoading, setError, setResponseTime, setSchema, setSchemaLoading,
    saveQuery, deleteQuery, loadQuery,
  } = useGraphQLStore();

  const [activeTab, setActiveTab] = useState<'response' | 'schema'>('response');
  const [showVariables, setShowVariables] = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [schemaFilter, setSchemaFilter] = useState('');

  const executeQuery = useCallback(async () => {
    if (!endpoint.trim() || !query.trim()) {
      toast.warning('Missing fields', 'Enter an endpoint and query');
      return;
    }

    setLoading(true);
    setError(null);
    setResponse('');
    setResponseTime(null);

    const start = performance.now();

    try {
      let parsedVars = {};
      if (variables.trim() && variables.trim() !== '{}') {
        try { parsedVars = JSON.parse(variables); } catch { toast.error('Invalid variables', 'Variables must be valid JSON'); setLoading(false); return; }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables: parsedVars }),
      });

      const elapsed = performance.now() - start;
      const data = await res.json();

      setResponse(JSON.stringify(data, null, 2));
      setResponseTime(elapsed);

      if (data.errors) {
        setError(`GraphQL errors: ${data.errors.map((e: any) => e.message).join(', ')}`);
      }
    } catch (err) {
      const elapsed = performance.now() - start;
      setResponseTime(elapsed);
      const msg = err instanceof Error ? err.message : 'Request failed';
      setError(msg);
      setResponse(JSON.stringify({ error: msg }, null, 2));
      toast.error('Request failed', msg);
    } finally {
      setLoading(false);
    }
  }, [endpoint, query, variables, headers, setLoading, setError, setResponse, setResponseTime]);

  const introspect = useCallback(async () => {
    if (!endpoint.trim()) {
      toast.warning('No endpoint', 'Enter a GraphQL endpoint first');
      return;
    }

    setSchemaLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: INTROSPECTION_QUERY }),
      });
      const data = await res.json();
      const types: GQLSchemaType[] = (data?.data?.__schema?.types ?? [])
        .filter((t: any) => !t.name.startsWith('__'))
        .map((t: any) => ({
          name: t.name,
          kind: t.kind,
          description: t.description,
          fields: t.fields?.map((f: any) => ({
            name: f.name,
            type: flattenType(f.type),
            description: f.description,
          })),
        }));

      setSchema(types);
      setActiveTab('schema');
      toast.success('Schema loaded', `${types.length} types discovered`);
    } catch (err) {
      toast.error('Introspection failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSchemaLoading(false);
    }
  }, [endpoint, headers, setSchema, setSchemaLoading]);

  const handleSave = () => {
    if (!saveName.trim()) { toast.warning('Name required', 'Enter a query name'); return; }
    saveQuery({ id: crypto.randomUUID(), name: saveName, endpoint, query, variables, headers });
    setSaveName('');
    toast.success('Saved', saveName);
  };

  const copyResponse = () => {
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleType = (name: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const filteredSchema = schemaFilter
    ? schema.filter((t) => t.name.toLowerCase().includes(schemaFilter.toLowerCase()))
    : schema;

  const kindColors: Record<string, string> = {
    OBJECT: 'text-blue-600 dark:text-blue-400',
    INPUT_OBJECT: 'text-purple-600 dark:text-purple-400',
    ENUM: 'text-amber-600 dark:text-amber-400',
    SCALAR: 'text-emerald-600 dark:text-emerald-400',
    INTERFACE: 'text-teal-600 dark:text-teal-400',
    UNION: 'text-pink-600 dark:text-pink-400',
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900 dark:text-white flex items-center gap-2">
            <Braces className="w-5 h-5 text-pink-600" />
            GraphQL Client
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
            Query GraphQL APIs with introspection and schema explorer
          </p>
        </div>
      </div>

      {/* Endpoint bar */}
      <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-4">
        <div className="flex gap-2">
          <div className="flex items-center gap-2 px-3 py-2.5 bg-pink-600 text-white rounded-xl text-xs font-bold">
            POST
          </div>
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://api.example.com/graphql"
            className="flex-1 px-4 py-2.5 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && executeQuery()}
          />
          <button
            onClick={executeQuery}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Execute
          </button>
          <button
            onClick={introspect}
            disabled={schemaLoading}
            className="flex items-center gap-2 px-3 py-2.5 bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 rounded-xl text-sm font-medium hover:bg-surface-200 dark:hover:bg-surface-700 disabled:opacity-60 transition-colors"
            title="Introspect schema"
          >
            {schemaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Schema
          </button>
        </div>

        {/* Toggles */}
        <div className="flex gap-4 mt-2">
          <button onClick={() => setShowVariables(!showVariables)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
            <ChevronDown className={cn('w-3 h-3 transition-transform', showVariables && 'rotate-180')} /> Variables
          </button>
          <button onClick={() => setShowHeaders(!showHeaders)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
            <ChevronDown className={cn('w-3 h-3 transition-transform', showHeaders && 'rotate-180')} /> Headers
          </button>
          <button onClick={() => setShowSaved(!showSaved)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
            <Bookmark className="w-3 h-3" /> Saved ({savedQueries.length})
          </button>
        </div>

        {showVariables && (
          <textarea
            value={variables}
            onChange={(e) => setVariables(e.target.value)}
            placeholder='{"key": "value"}'
            rows={4}
            className="w-full mt-2 px-3 py-2 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-xs font-mono resize-none outline-none"
          />
        )}

        {showHeaders && (
          <div className="mt-2 space-y-1.5">
            {Object.entries(headers).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <input value={key} readOnly className="flex-1 px-2.5 py-1.5 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-xs font-mono outline-none" />
                <input
                  value={value}
                  onChange={(e) => setHeaders({ ...headers, [key]: e.target.value })}
                  className="flex-1 px-2.5 py-1.5 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-xs font-mono outline-none"
                />
              </div>
            ))}
            <button
              onClick={() => setHeaders({ ...headers, '': '' })}
              className="text-[11px] text-brand-600 hover:underline"
            >
              + Add header
            </button>
          </div>
        )}

        {showSaved && (
          <div className="mt-2 border-t border-surface-100 dark:border-surface-800 pt-2 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Query name"
                className="flex-1 px-2.5 py-1.5 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-xs outline-none"
              />
              <button onClick={handleSave} className="flex items-center gap-1 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700">
                <Save className="w-3 h-3" /> Save
              </button>
            </div>
            {savedQueries.map((q) => (
              <div key={q.id} className="flex items-center justify-between px-3 py-2 bg-surface-50 dark:bg-surface-800 rounded-lg">
                <button onClick={() => { loadQuery(q.id); toast.info('Loaded', q.name); }} className="text-xs font-medium text-surface-700 dark:text-surface-300 hover:text-brand-600 text-left truncate">
                  {q.name}
                </button>
                <button onClick={() => deleteQuery(q.id)} className="text-surface-400 hover:text-red-500 flex-shrink-0">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor + Response */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Query editor */}
        <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 flex flex-col">
          <div className="px-4 py-2.5 border-b border-surface-100 dark:border-surface-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300">Query</h3>
            <span className="text-[10px] text-surface-400">⌘+Enter to execute</span>
          </div>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-h-[350px] px-4 py-3 bg-transparent text-sm font-mono text-surface-800 dark:text-surface-200 resize-none outline-none"
            placeholder="{ users { id name } }"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                executeQuery();
              }
              // Tab support
              if (e.key === 'Tab') {
                e.preventDefault();
                const ta = e.currentTarget;
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                setQuery(query.substring(0, start) + '  ' + query.substring(end));
                requestAnimationFrame(() => {
                  ta.selectionStart = ta.selectionEnd = start + 2;
                });
              }
            }}
            spellCheck={false}
          />
        </div>

        {/* Response / Schema */}
        <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 flex flex-col">
          {/* Tabs */}
          <div className="px-4 py-2.5 border-b border-surface-100 dark:border-surface-800 flex items-center justify-between">
            <div className="flex gap-1">
              {(['response', 'schema'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                    activeTab === tab ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300' : 'text-surface-500 hover:text-surface-700'
                  )}
                >
                  {tab === 'response' ? 'Response' : `Schema (${schema.length})`}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {responseTime !== null && (
                <span className="text-[11px] text-surface-400">{responseTime.toFixed(0)} ms</span>
              )}
              {response && (
                <button onClick={copyResponse} className="p-1 text-surface-400 hover:text-brand-600" title="Copy response">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>

          {activeTab === 'response' ? (
            <div className="flex-1 min-h-[350px] overflow-auto">
              {error && (
                <div className="mx-4 mt-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg">{error}</div>
              )}
              {loading ? (
                <div className="flex items-center justify-center h-full text-surface-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : response ? (
                <pre className="px-4 py-3 text-xs font-mono text-surface-800 dark:text-surface-200 whitespace-pre-wrap break-all">{response}</pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-surface-400">
                  <Globe className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">Execute a query to see results</p>
                </div>
              )}
            </div>
          ) : (
            /* Schema explorer */
            <div className="flex-1 min-h-[350px] overflow-auto p-3">
              <input
                type="text"
                value={schemaFilter}
                onChange={(e) => setSchemaFilter(e.target.value)}
                placeholder="Filter types…"
                className="w-full mb-3 px-3 py-1.5 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-xs outline-none"
              />
              {filteredSchema.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-surface-400">
                  <BookOpen className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-xs">{schema.length === 0 ? 'Click "Schema" to introspect' : 'No matching types'}</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredSchema.map((type) => (
                    <div key={type.name}>
                      <button
                        onClick={() => type.fields && toggleType(type.name)}
                        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
                      >
                        {type.fields ? (
                          expandedTypes.has(type.name) ? <ChevronDown className="w-3 h-3 text-surface-400" /> : <ChevronRight className="w-3 h-3 text-surface-400" />
                        ) : (
                          <span className="w-3" />
                        )}
                        <span className={cn('font-semibold', kindColors[type.kind] || 'text-surface-600')}>{type.name}</span>
                        <span className="text-[10px] text-surface-400 font-mono">{type.kind}</span>
                      </button>
                      {expandedTypes.has(type.name) && type.fields && (
                        <div className="ml-7 border-l-2 border-surface-100 dark:border-surface-800 pl-3 mb-1 space-y-0.5">
                          {type.fields.map((f) => (
                            <div key={f.name} className="flex items-center gap-2 py-0.5 text-[11px]">
                              <span className="text-surface-700 dark:text-surface-300 font-medium">{f.name}</span>
                              <span className="text-surface-400">:</span>
                              <span className="text-pink-600 dark:text-pink-400 font-mono">{f.type}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
