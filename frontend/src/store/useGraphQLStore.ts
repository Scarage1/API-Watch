/**
 * GraphQL store — query state, saved queries, schema cache.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface GQLSavedQuery {
  id: string;
  name: string;
  endpoint: string;
  query: string;
  variables: string;
  headers: Record<string, string>;
}

export interface GQLSchemaType {
  name: string;
  kind: string;
  description?: string;
  fields?: { name: string; type: string; description?: string }[];
}

interface GraphQLState {
  endpoint: string;
  query: string;
  variables: string;
  headers: Record<string, string>;
  response: string;
  loading: boolean;
  error: string | null;
  responseTime: number | null;

  // Schema introspection
  schema: GQLSchemaType[];
  schemaLoading: boolean;

  // Saved queries
  savedQueries: GQLSavedQuery[];

  // Actions
  setEndpoint: (endpoint: string) => void;
  setQuery: (query: string) => void;
  setVariables: (variables: string) => void;
  setHeaders: (headers: Record<string, string>) => void;
  setResponse: (response: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setResponseTime: (time: number | null) => void;
  setSchema: (schema: GQLSchemaType[]) => void;
  setSchemaLoading: (loading: boolean) => void;
  saveQuery: (query: GQLSavedQuery) => void;
  deleteQuery: (id: string) => void;
  loadQuery: (id: string) => void;
}

export const useGraphQLStore = create<GraphQLState>()(
  persist(
    (set, get) => ({
      endpoint: 'https://countries.trevorblades.com/graphql',
      query: `# Write your GraphQL query here
{
  countries {
    code
    name
    capital
  }
}`,
      variables: '{}',
      headers: { 'Content-Type': 'application/json' },
      response: '',
      loading: false,
      error: null,
      responseTime: null,
      schema: [],
      schemaLoading: false,
      savedQueries: [],

      setEndpoint: (endpoint) => set({ endpoint }),
      setQuery: (query) => set({ query }),
      setVariables: (variables) => set({ variables }),
      setHeaders: (headers) => set({ headers }),
      setResponse: (response) => set({ response }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      setResponseTime: (time) => set({ responseTime: time }),
      setSchema: (schema) => set({ schema }),
      setSchemaLoading: (loading) => set({ schemaLoading: loading }),

      saveQuery: (q) =>
        set((state) => ({
          savedQueries: [...state.savedQueries.filter((s) => s.id !== q.id), q],
        })),

      deleteQuery: (id) =>
        set((state) => ({
          savedQueries: state.savedQueries.filter((s) => s.id !== id),
        })),

      loadQuery: (id) => {
        const q = get().savedQueries.find((s) => s.id === id);
        if (q) {
          set({
            endpoint: q.endpoint,
            query: q.query,
            variables: q.variables,
            headers: q.headers,
          });
        }
      },
    }),
    {
      name: 'api-watch-graphql',
      partialize: (state) => ({
        endpoint: state.endpoint,
        savedQueries: state.savedQueries,
      }),
    }
  )
);
