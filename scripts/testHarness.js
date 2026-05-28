import { AgentLoop } from '../agent/AgentLoop.js';
import { ToolRegistry } from '../agent/ToolRegistry.js';
import { createLifebookTools } from '../agent/LifebookTools.js';
import { MemoryStore } from '../memory/MemoryStore.js';

export function createState(overrides = {}) {
  return {
    memories: [],
    dailyLogs: [],
    photos: [],
    confirmedFacts: [],
    memoryCandidates: [],
    lifeSummaries: [],
    resolvedClarifications: [],
    ...overrides
  };
}

export function createMockInternalTool(overrides = {}) {
  const calls = [];
  const handler = async (name, payload) => {
    calls.push({ name, payload });
    if (overrides[name]) return overrides[name](payload);
    if (name === 'reply-plan') {
      return {
        responseMode: 'chatting',
        replyStrategy: 'gentle_acknowledgment',
        memorySignal: false,
        reason: '默认测试回复规划。'
      };
    }
    if (name === 'memory-filter') {
      return {
        filteredText: payload.text || '',
        memorySignal: false,
        candidateType: 'none',
        confidence: 0,
        people: [],
        timeType: 'none',
        isComplete: false,
        summary: '',
        narrative: '',
        missingPieces: [],
        followUpHint: '',
        noiseFiltered: false,
        reason: '默认测试不进入候选。'
      };
    }
    if (name === 'memory-draft') {
      return {
        title: '测试记忆',
        content: payload.text || '',
        summary: payload.text || '',
        mood: '',
        tags: []
      };
    }
    if (name === 'memory-structure') {
      return {
        title: payload.title || '测试记忆',
        summary: payload.text || '',
        people: [],
        timeRefs: [],
        locations: [],
        actions: [],
        tags: []
      };
    }
    throw new Error(`unexpected internal tool: ${name}`);
  };
  handler.calls = calls;
  return handler;
}

export function createHarness({
  state = createState(),
  decisions = [],
  internalTool = createMockInternalTool(),
  manageClarification = null,
  maxSteps = 8
} = {}) {
  const memoryStore = new MemoryStore({
    readState: async () => state,
    writeState: async (nextState) => {
      Object.keys(state).forEach((key) => delete state[key]);
      Object.assign(state, nextState);
    }
  });
  const registry = new ToolRegistry();
  createLifebookTools({
    readState: async () => state,
    callInternalTool: internalTool,
    memoryStore,
    manageClarification
  }).forEach((tool) => registry.register(tool));

  let step = 0;
  const agent = new AgentLoop({
    toolRegistry: registry,
    selectAction: async () => {
      const decision = decisions[step];
      step += 1;
      if (!decision) throw new Error(`No scripted model decision for step ${step}.`);
      return decision;
    },
    maxSteps
  });

  return {
    agent,
    state,
    registry,
    internalTool
  };
}

export function actionTools(result) {
  return result.actions.map((item) => item.action.tool).filter(Boolean);
}
