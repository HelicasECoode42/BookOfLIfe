import { MemoryStore } from '../memory/MemoryStore.js';

export function createLifebookTools({
  readState,
  callInternalTool,
  appendCandidate,
  manageClarification = null,
  memoryStore = null
}) {
  const store = memoryStore || new MemoryStore({
    readState,
    writeState: appendCandidate
      ? async (nextState) => {
          const currentCandidates = Array.isArray(nextState.memoryCandidates) ? nextState.memoryCandidates : [];
          const candidate = currentCandidates[0] || {};
          await appendCandidate(candidate, {});
        }
      : null
  });

  return [
    {
      name: 'get_memory_state',
      description: 'Read current memory counts, active event context and recent pending candidates.',
      risk: 'read',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const state = await readState();
        return {
          counts: {
            memories: Array.isArray(state.memories) ? state.memories.length : 0,
            memoryCandidates: Array.isArray(state.memoryCandidates) ? state.memoryCandidates.length : 0,
            confirmedFacts: Array.isArray(state.confirmedFacts) ? state.confirmedFacts.length : 0,
            dailyLogs: Array.isArray(state.dailyLogs) ? state.dailyLogs.length : 0,
            photos: Array.isArray(state.photos) ? state.photos.length : 0
          },
          activeEventContext: state.activeEventContext || null,
          recentCandidates: (Array.isArray(state.memoryCandidates) ? state.memoryCandidates : []).slice(0, 5)
        };
      }
    },
    {
      name: 'search_memory',
      description: 'Search local memories, facts, candidates, daily logs and photos by keyword.',
      risk: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' }
        },
        required: ['query']
      },
      execute: async ({ query = '', limit = 5 } = {}) => {
        return store.search(query, { limit });
      }
    },
    {
      name: 'plan_reply',
      description: 'Call the existing reply-plan decision endpoint logic.',
      risk: 'reasoning',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          retrieval: { type: 'object' },
          history: { type: 'array' }
        },
        required: ['text']
      },
      execute: async (input, context) => callInternalTool('reply-plan', {
        text: input.text || context.message,
        retrieval: input.retrieval || context.retrieval || {},
        history: Array.isArray(input.history) ? input.history : context.history
      })
    },
    {
      name: 'filter_memory_signal',
      description: 'Call the existing memory-filter logic to judge whether a turn should become a candidate.',
      risk: 'reasoning',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          retrieval: { type: 'object' },
          history: { type: 'array' },
          replyPlan: { type: 'object' }
        },
        required: ['text']
      },
      execute: async (input, context) => callInternalTool('memory-filter', {
        text: input.text || context.message,
        retrieval: input.retrieval || context.retrieval || {},
        history: Array.isArray(input.history) ? input.history : context.history,
        replyPlan: input.replyPlan || context.replyPlan || {}
      })
    },
    {
      name: 'draft_memory_page',
      description: 'Call the existing memory-draft logic to create a saveable draft.',
      risk: 'draft',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          source: { type: 'string' },
          context: { type: 'object' }
        },
        required: ['text']
      },
      execute: async (input) => callInternalTool('memory-draft', {
        text: input.text,
        source: input.source || 'agent',
        context: input.context || null
      })
    },
    {
      name: 'structure_memory',
      description: 'Call the existing memory-structure logic to extract people, time, locations and actions.',
      risk: 'draft',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          title: { type: 'string' },
          mood: { type: 'string' },
          source: { type: 'string' }
        },
        required: ['text']
      },
      execute: async (input) => callInternalTool('memory-structure', {
        text: input.text,
        title: input.title || '',
        mood: input.mood || '',
        source: input.source || 'agent'
      })
    },
    {
      name: 'get_timeline',
      description: 'Query the timeline for a person and optional time range (e.g. "2020-01" to "2023-12"). Returns dated items within the range, fuzzy items annotated with no_exact_date, and potentialConflicts.',
      risk: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          person: { type: 'string' },
          limit: { type: 'number' },
          timeRange: { type: 'object' }
        }
      },
      execute: async ({ person = '', limit = 20, timeRange = null } = {}) => {
        const tr = timeRange && typeof timeRange === 'object' ? timeRange : null;
        if (memoryStore) return memoryStore.queryTimeline({ person, limit, timeRange: tr });
        const state = await readState();
        const ms = new MemoryStore({ readState: async () => state });
        return ms.queryTimeline({ person, limit, timeRange: tr });
      }
    },
    {
      name: 'append_candidate_memory',
      description: 'Append a pending memory candidate. This does not confirm a long-term fact.',
      risk: 'write_candidate',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'object' }
        },
        required: ['candidate']
      },
      execute: async ({ candidate = {} } = {}, context) => {
        if (memoryStore) return memoryStore.appendCandidate(candidate, context);
        return appendCandidate(candidate, context);
      }
    },
    {
      name: 'manage_clarification',
      description: 'Create or resolve a conversational clarification. Use when the system is uncertain about a person alias, time reference, pronoun, or timeline conflict. Create asks the user a question; resolve records the user answer. Clarification is NOT memory saving — it only updates session understanding.',
      risk: 'reasoning',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          type: { type: 'string' },
          question: { type: 'string' },
          payload: { type: 'object' },
          clarificationId: { type: 'string' },
          result: { type: 'object' }
        },
        required: ['action']
      },
      execute: async (input = {}, context) => {
        if (typeof manageClarification === 'function') return manageClarification(input.action, {
          type: input.type,
          question: input.question,
          payload: input.payload,
          clarificationId: input.clarificationId,
          result: input.result
        });
        return { ok: false, reason: 'clarification not available in this context' };
      }
    }
  ];
}
