import assert from 'assert';
import { AgentLoop } from '../agent/AgentLoop.js';
import { ToolRegistry } from '../agent/ToolRegistry.js';
import { createLifebookTools } from '../agent/LifebookTools.js';
import { MemoryStore } from '../memory/MemoryStore.js';
import { normalizeMemoryCandidate } from '../memory/CandidateNormalizer.js';
import { createState, createMockInternalTool, actionTools } from './testHarness.js';

// --- 1. manage_clarification create → state has pendingClarification ---
const state1 = createState({
  confirmedFacts: [
    { id: 'fact-laozhang', canonicalLabel: '老张是纺织厂同事', relatedPeople: ['老张'], status: 'user_confirmed' }
  ]
});
let pendingClarification = null;
let sessionAliases = {};

const clarificationHandler = {
  calls: [],
  async handle(action, payload = {}) {
    this.calls.push({ action, payload });
    if (action === 'create') {
      pendingClarification = {
        id: `clarify_test_${Date.now()}`,
        type: payload.type || 'person_alias',
        status: 'awaiting_reply',
        question: payload.question || '',
        payload: payload.payload || {},
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      };
      return { ok: true, clarification: pendingClarification };
    }
    if (action === 'resolve') {
      const existing = { ...pendingClarification };
      pendingClarification = null;
      const result = payload.result || {};
      if (result.matchConfirmed && result.resolvedAlias && result.canonicalPerson) {
        sessionAliases[result.resolvedAlias] = result.canonicalPerson;
      }
      return { ok: true, resolved: existing, sessionAliases: { ...sessionAliases } };
    }
    if (action === 'cancel') {
      pendingClarification = null;
      return { ok: true, cancelled: true };
    }
    throw new Error(`Unknown action: ${action}`);
  },
  reset() {
    this.calls = [];
    pendingClarification = null;
    sessionAliases = {};
  }
};

const store1 = new MemoryStore({ readState: async () => state1 });
const registry1 = new ToolRegistry();
createLifebookTools({
  readState: async () => state1,
  callInternalTool: createMockInternalTool(),
  memoryStore: store1,
  manageClarification: clarificationHandler.handle.bind(clarificationHandler)
}).forEach((tool) => registry1.register(tool));

// Test create
const createResult = await registry1.call('manage_clarification', {
  action: 'create',
  type: 'person_alias',
  question: '你说的张伯，是之前提到的老张吗？',
  payload: { newAlias: '张伯', canonicalPerson: '老张', originalMessage: '张伯最近身体不好' }
}, {});
assert.equal(createResult.ok, true, 'create should return ok');
assert.ok(createResult.clarification, 'should return clarification object');
assert.equal(createResult.clarification.type, 'person_alias');
assert.equal(createResult.clarification.status, 'awaiting_reply');
assert.ok(pendingClarification, 'state should have pendingClarification after create');
console.log('  ✓ manage_clarification create sets pendingClarification in state');

// Test resolve with matchConfirmed
const resolveResult = await registry1.call('manage_clarification', {
  action: 'resolve',
  result: { resolved: true, matchConfirmed: true, resolvedAlias: '张伯', canonicalPerson: '老张' }
}, {});
assert.equal(resolveResult.ok, true, 'resolve should return ok');
assert.equal(pendingClarification, null, 'state pendingClarification should be null after resolve');
assert.equal(sessionAliases['张伯'], '老张', 'sessionAliases should map 张伯→老张');
console.log('  ✓ manage_clarification resolve updates sessionAliases and clears pending');

// Reset and test cancel
clarificationHandler.reset();
await registry1.call('manage_clarification', {
  action: 'create', type: 'person_alias',
  question: '你说的张伯，是之前提到的老张吗？',
  payload: { newAlias: '张伯', canonicalPerson: '老张' }
}, {});
const cancelResult = await registry1.call('manage_clarification', {
  action: 'cancel'
}, {});
assert.equal(cancelResult.ok, true);
assert.equal(pendingClarification, null, 'cancel clears pendingClarification');
console.log('  ✓ manage_clarification cancel clears pending');

// --- 2. AgentLoop context includes pendingClarification ---
clarificationHandler.reset();
const store2 = new MemoryStore({ readState: async () => state1 });
const registry2 = new ToolRegistry();
createLifebookTools({
  readState: async () => state1,
  callInternalTool: createMockInternalTool(),
  memoryStore: store2,
  manageClarification: clarificationHandler.handle.bind(clarificationHandler)
}).forEach((tool) => registry2.register(tool));

const agent2 = new AgentLoop({
  toolRegistry: registry2,
  maxSteps: 5,
  selectAction: async (ctx) => {
    if (ctx.pendingClarification) {
      return { thought: '有 pending clarification，先 resolve', final: '收到，已记录。' };
    }
    return { thought: '先搜索', action: { tool: 'search_memory', input: { query: ctx.message, limit: 3 } } };
  }
});

// Run with pendingClarification in input
const resultWithPending = await agent2.run({
  message: '对',
  sessionId: 'test-session',
  pendingClarification: {
    id: 'clarify-old',
    type: 'person_alias',
    status: 'awaiting_reply',
    question: '你说的张伯，是老张吗？',
    payload: { newAlias: '张伯', canonicalPerson: '老张' },
    createdAt: new Date().toISOString()
  }
});
assert.ok(resultWithPending.reply, 'should produce reply');
console.log('  ✓ AgentLoop receives and processes pendingClarification from input');

// --- 3. manage_clarification without handler returns ok=false ---
const store3 = new MemoryStore({ readState: async () => state1 });
const registry3 = new ToolRegistry();
createLifebookTools({
  readState: async () => state1,
  callInternalTool: createMockInternalTool(),
  memoryStore: store3
}).forEach((tool) => registry3.register(tool));

const noHandlerResult = await registry3.call('manage_clarification', {
  action: 'create', type: 'person_alias', question: 'test?', payload: {}
}, {});
assert.equal(noHandlerResult.ok, false, 'should return ok=false without handler');
assert.ok(noHandlerResult.reason, 'should have reason');
console.log('  ✓ manage_clarification without handler returns graceful ok=false');

// --- 4. Agent harness: two-turn clarification flow ---
clarificationHandler.reset();
const state4 = createState({
  confirmedFacts: [
    { id: 'fact-laozhang', canonicalLabel: '老张是纺织厂同事', relatedPeople: ['老张'], status: 'user_confirmed' }
  ]
});
const store4 = new MemoryStore({ readState: async () => state4 });

// Turn 1: user mentions unknown alias → Agent creates clarification
const registry4a = new ToolRegistry();
createLifebookTools({
  readState: async () => state4,
  callInternalTool: createMockInternalTool({
    'memory-filter': async () => ({ memorySignal: false, candidateType: 'none', confidence: 0, reason: 'alias uncertain' })
  }),
  memoryStore: store4,
  manageClarification: clarificationHandler.handle.bind(clarificationHandler)
}).forEach((tool) => registry4a.register(tool));

const turn1Decisions = [
  { thought: '搜索张伯', action: { tool: 'search_memory', input: { query: '张伯', limit: 3 } } },
  { thought: '没找到，可能是老张的别名，先创建澄清', action: { tool: 'manage_clarification', input: { action: 'create', type: 'person_alias', question: '你说的张伯，是之前提到的老张吗？', payload: { newAlias: '张伯', canonicalPerson: '老张', originalMessage: '张伯最近身体不好' } } } },
  { thought: '把澄清问题展示给用户', final: '你说的张伯，是之前提到的老张吗？' }
];
const agentTurn1 = new AgentLoop({
  toolRegistry: registry4a,
  maxSteps: 5,
  selectAction: async () => {
    const d = turn1Decisions.shift();
    if (!d) return { thought: 'done', final: 'done' };
    return d;
  }
});
const result1 = await agentTurn1.run({ message: '张伯最近身体不好', sessionId: 'clarify-test' });
assert.ok(result1.reply.includes('老张') || result1.reply.includes('张伯'), 'Turn 1 should ask clarification');
assert.ok(pendingClarification, 'pendingClarification should exist after turn 1');
assert.ok(result1.pendingClarification, 'AgentLoop result should retain pendingClarification after create');
assert.equal(result1.pendingClarification.type, 'person_alias');
assert.equal(pendingClarification.type, 'person_alias');
assert.equal(pendingClarification.status, 'awaiting_reply');
const stepTools1 = actionTools(result1);
assert.ok(stepTools1.includes('manage_clarification'), 'Turn 1 should call manage_clarification');
console.log('  ✓ Turn 1 (alias unknown): Agent creates clarification, state has pendingClarification');

// Turn 2: user confirms → Agent resolves clarification
const registry4b = new ToolRegistry();
createLifebookTools({
  readState: async () => state4,
  callInternalTool: createMockInternalTool(),
  memoryStore: store4,
  manageClarification: clarificationHandler.handle.bind(clarificationHandler)
}).forEach((tool) => registry4b.register(tool));

const turn2Decisions = [
  { thought: '用户在回答之前的澄清问题，resolve', action: { tool: 'manage_clarification', input: { action: 'resolve', result: { resolved: true, matchConfirmed: true, resolvedAlias: '张伯', canonicalPerson: '老张' } } } },
  { thought: '澄清已处理，继续处理原始消息', action: { tool: 'search_memory', input: { query: '老张 身体', limit: 3 } } },
  { thought: '已检索到老张相关信息', final: '收到，已把张伯当作老张来理解。老张最近身体怎么样？' }
];
const agentTurn2 = new AgentLoop({
  toolRegistry: registry4b,
  maxSteps: 5,
  selectAction: async () => {
    const d = turn2Decisions.shift();
    if (!d) return { thought: 'done', final: 'done' };
    return d;
  }
});
const clarificationBeforeTurn2 = pendingClarification;
const result2 = await agentTurn2.run({
  message: '对，就是他',
  sessionId: 'clarify-test',
  pendingClarification: clarificationBeforeTurn2
});
assert.equal(pendingClarification, null, 'pendingClarification should be null after resolve');
assert.equal(result2.pendingClarification, null, 'AgentLoop result should clear pendingClarification after resolve');
assert.equal(sessionAliases['张伯'], '老张', 'sessionAliases should be updated');
const stepTools2 = actionTools(result2);
assert.ok(stepTools2.includes('manage_clarification'), 'Turn 2 should resolve clarification');
console.log('  ✓ Turn 2 (user confirms): Agent resolves clarification, sessionAliases updated');

// --- 5. resolve with "不是" ---
clarificationHandler.reset();
// Re-create a pending clarification
await registry1.call('manage_clarification', {
  action: 'create', type: 'person_alias',
  question: '你说的张伯，是之前提到的老张吗？',
  payload: { newAlias: '张伯', canonicalPerson: '老张', originalMessage: '张伯最近身体不好' }
}, {});
const rejectResult = await registry1.call('manage_clarification', {
  action: 'resolve',
  result: { resolved: true, matchConfirmed: false }
}, {});
assert.equal(rejectResult.ok, true);
assert.equal(pendingClarification, null, 'resolve clears pending even on rejection');
assert.equal(sessionAliases['张伯'], undefined, 'sessionAliases should not add on rejection');
console.log('  ✓ manage_clarification resolve with matchConfirmed=false clears without alias');

// --- 6. P1-2: sessionAliases 接入 search_memory ---
const state6 = createState({
  confirmedFacts: [
    { id: 'fact-laozhang', canonicalLabel: '老张是纺织厂同事', label: '老张是纺织厂同事', relatedPeople: ['老张'], status: 'user_confirmed', sourceText: '老张在纺织厂工作', updatedAt: new Date().toISOString() },
    { id: 'fact-zhaojie', canonicalLabel: '赵姐是邻居', label: '赵姐是邻居', relatedPeople: ['赵姐'], status: 'user_confirmed', sourceText: '赵姐是邻居', updatedAt: new Date().toISOString() }
  ],
  sessionAliases: {}
});

// First: search "张伯" WITHOUT session aliases → should NOT hit 老张
const storeNoAlias = new MemoryStore({ readState: async () => state6 });
const searchNoAlias = await storeNoAlias.search('张伯', { limit: 5 });
const laozhangHitNoAlias = searchNoAlias.results.find((r) => r.id === 'fact-laozhang');
assert.equal(laozhangHitNoAlias, undefined, 'search "张伯" without sessionAliases should NOT hit 老张');
console.log('  ✓ search "张伯" without sessionAliases → no 老张 hits');

// Then: search "张伯" WITH session aliases → SHOULD hit 老张
const stateWithAlias = { ...state6, sessionAliases: { '张伯': '老张' } };
const storeWithAlias = new MemoryStore({ readState: async () => stateWithAlias });
const searchWithAlias = await storeWithAlias.search('张伯', { limit: 5 });
const laozhangHitWithAlias = searchWithAlias.results.find((r) => r.id === 'fact-laozhang');
assert.ok(laozhangHitWithAlias, 'search "张伯" with sessionAliases should hit 老张');
assert.equal(laozhangHitWithAlias.answerPolicy, 'can_state_as_fact');
console.log('  ✓ search "张伯" with sessionAliases {张伯→老张} hits 老张 confirmed fact');

// --- 7. P1-2: sessionAliases 接入 queryTimeline ---
const stateTimelineWithAlias = {
  confirmedFacts: [
    { id: 'fact-laozhang', canonicalLabel: '老张是纺织厂同事', label: '老张是纺织厂同事', relatedPeople: ['老张'], timelineDate: '1990', status: 'user_confirmed', sourceText: '老张在纺织厂工作', updatedAt: new Date().toISOString() }
  ],
  memories: [],
  dailyLogs: [],
  memoryCandidates: [],
  photos: [],
  lifeSummaries: [],
  sessionAliases: { '张伯': '老张' }
};
const timelineStore = new MemoryStore({ readState: async () => stateTimelineWithAlias });
const timelineWithAlias = await timelineStore.queryTimeline({ person: '张伯', limit: 20 });
assert.ok(timelineWithAlias.items.length > 0, 'queryTimeline "张伯" with sessionAliases should return items');
const timelineLaozhang = timelineWithAlias.items.find((item) => item.people.includes('老张'));
assert.ok(timelineLaozhang, 'queryTimeline "张伯" should hit items with people=老张');
console.log('  ✓ queryTimeline "张伯" with sessionAliases hits 老张 timeline');

// --- 8. P1-2: alias flow does NOT auto-write confirmed facts ---
// After sessionAlias resolve, a new entry about "张伯" should still go through
// the normal candidate pipeline, not become a confirmed fact.
const state8 = createState({
  confirmedFacts: [
    { id: 'fact-laozhang', canonicalLabel: '老张是纺织厂同事', relatedPeople: ['老张'], status: 'user_confirmed' }
  ],
  sessionAliases: { '张伯': '老张' }
});
const store8 = new MemoryStore({ readState: async () => state8 });
// After alias resolve, search for 张伯 should find 老张
const search8 = await store8.search('张伯', { limit: 5 });
const laozhang8 = search8.results.find((r) => r.id === 'fact-laozhang');
assert.ok(laozhang8, 'after alias resolve, "张伯" should find 老张');
// But confirmedFacts should still only have the original "老张" entry
assert.equal(state8.confirmedFacts.length, 1, 'confirmedFacts must not change after alias resolve');
console.log('  ✓ alias resolve does NOT auto-write confirmed facts');

// --- 9. time_ambiguity clarification ---
clarificationHandler.reset();
await registry1.call('manage_clarification', {
  action: 'create', type: 'time_ambiguity',
  question: '你说的"纺织厂那几年"，大概是1988到1995年那段吗？',
  payload: { timeExpression: '纺织厂那几年', suggestedRange: '1988-1995', originalMessage: '纺织厂那几年老张经常帮我' }
}, {});
assert.equal(pendingClarification.type, 'time_ambiguity');
assert.equal(pendingClarification.status, 'awaiting_reply');
console.log('  ✓ time_ambiguity clarification create works');

const timeResolve = await registry1.call('manage_clarification', {
  action: 'resolve',
  result: { resolved: true, matchConfirmed: true, confirmedRange: '1988-1995' }
}, {});
assert.equal(timeResolve.ok, true);
assert.equal(pendingClarification, null, 'time resolve clears pending');
console.log('  ✓ time_ambiguity clarification resolve works');

// --- 10. pronoun_reference clarification ---
clarificationHandler.reset();
await registry1.call('manage_clarification', {
  action: 'create', type: 'pronoun_reference',
  question: '你说的"他"，是老张吗？',
  payload: { pronoun: '他', candidates: ['老张', '老徐'], originalMessage: '他后来搬走了' }
}, {});
assert.equal(pendingClarification.type, 'pronoun_reference');
assert.equal(pendingClarification.status, 'awaiting_reply');
console.log('  ✓ pronoun_reference clarification create works');

const pronounResolve = await registry1.call('manage_clarification', {
  action: 'resolve',
  result: { resolved: true, matchConfirmed: true, resolvedReferent: '老张' }
}, {});
assert.equal(pronounResolve.ok, true);
assert.equal(pendingClarification, null, 'pronoun resolve clears pending');
console.log('  ✓ pronoun_reference clarification resolve works');

// --- 11. timeline_conflict: Agent sees conflicts → creates clarification ---
clarificationHandler.reset();
const stateConflict = {
  confirmedFacts: [
    { id: 'fact-retire', canonicalLabel: '老张2022年3月退休', relatedPeople: ['老张'], timelineDate: '2022-03-01', sourceText: '老张2022年3月退休了。', status: 'user_confirmed', updatedAt: new Date().toISOString() },
    { id: 'fact-trip', canonicalLabel: '2022年3月和老张出差', relatedPeople: ['老张'], timelineDate: '2022-03-15', sourceText: '2022年3月和老张去广州出差。', status: 'user_confirmed', updatedAt: new Date().toISOString() }
  ],
  memories: [],
  dailyLogs: [],
  memoryCandidates: [],
  photos: [],
  lifeSummaries: []
};
const storeConflict = new MemoryStore({ readState: async () => stateConflict });
const conflictTimeline = await storeConflict.queryTimeline({ person: '老张', limit: 20 });
assert.ok(conflictTimeline.potentialConflicts.length > 0, 'should detect retire+trip conflict');

const registryConflict = new ToolRegistry();
createLifebookTools({
  readState: async () => stateConflict,
  callInternalTool: createMockInternalTool(),
  memoryStore: storeConflict,
  manageClarification: clarificationHandler.handle.bind(clarificationHandler)
}).forEach((tool) => registryConflict.register(tool));

// Simulate Agent: get_timeline → see conflicts → create timeline_conflict clarification
const conflictItem = conflictTimeline.potentialConflicts[0];
await registryConflict.call('manage_clarification', {
  action: 'create',
  type: 'timeline_conflict',
  question: conflictItem.suggestedQuestion || conflictItem.reason,
  payload: { conflict: conflictItem, originalMessage: '老张退休那年是不是还和我出过差？' }
}, {});
assert.equal(pendingClarification.type, 'timeline_conflict');
assert.equal(pendingClarification.status, 'awaiting_reply');
assert.ok(pendingClarification.question, 'conflict clarification should have question');
console.log('  ✓ timeline_conflict: Agent creates clarification from potentialConflicts');

// Resolve conflict clarification
await registryConflict.call('manage_clarification', {
  action: 'resolve',
  result: { resolved: true, matchConfirmed: true, note: '退休后临时返聘出的差' }
}, {});
assert.equal(pendingClarification, null, 'conflict resolve clears pending');
console.log('  ✓ timeline_conflict clarification resolve works');

// --- 12. Agent harness: pronoun + time clarification flow ---
clarificationHandler.reset();
const state12 = createState({
  confirmedFacts: [
    { id: 'fact-laozhang', canonicalLabel: '老张是纺织厂同事', relatedPeople: ['老张'], status: 'user_confirmed' },
    { id: 'fact-laoxu', canonicalLabel: '老徐是一起打游戏的朋友', relatedPeople: ['老徐'], status: 'user_confirmed' }
  ]
});
const store12 = new MemoryStore({ readState: async () => state12 });
const registry12 = new ToolRegistry();
createLifebookTools({
  readState: async () => state12,
  callInternalTool: createMockInternalTool(),
  memoryStore: store12,
  manageClarification: clarificationHandler.handle.bind(clarificationHandler)
}).forEach((tool) => registry12.register(tool));

// Turn: user says "他后来搬走了" with multiple possible referents
const pronounDecisions = [
  { thought: 'search 他 搬走', action: { tool: 'search_memory', input: { query: '搬走', limit: 5 } } },
  { thought: '检索到老张和老徐，代词不明确，创建澄清', action: { tool: 'manage_clarification', input: { action: 'create', type: 'pronoun_reference', question: '你说的"他"，是老张还是老徐？', payload: { pronoun: '他', candidates: ['老张', '老徐'], originalMessage: '他后来搬走了' } } } },
  { thought: '问清楚再继续', final: '你说的"他"，是老张还是老徐？' }
];
const agentPronoun = new AgentLoop({
  toolRegistry: registry12,
  maxSteps: 5,
  selectAction: async () => {
    const d = pronounDecisions.shift();
    if (!d) return { thought: 'done', final: 'done' };
    return d;
  }
});
const pronounResult = await agentPronoun.run({ message: '他后来搬走了', sessionId: 'test-pronoun' });
assert.equal(pendingClarification.type, 'pronoun_reference', 'should create pronoun clarification');
assert.ok(pronounResult.reply.includes('老张') || pronounResult.reply.includes('老徐') || pronounResult.reply.includes('他'), 'reply should ask about pronoun');
console.log('  ✓ Agent harness: pronoun creates clarification with candidate list');

// --- 13. P1-6: resolvedClarifications structured logging ---
clarificationHandler.reset();
const resolvedLog = [];

const handlerWithLog = {
  calls: [],
  async handle(action, payload = {}) {
    this.calls.push({ action, payload });
    if (action === 'create') {
      pendingClarification = {
        id: `clarify_${Date.now()}`,
        type: payload.type || 'person_alias',
        status: 'awaiting_reply',
        question: payload.question || '',
        payload: payload.payload || {},
        createdAt: new Date().toISOString()
      };
      return { ok: true, clarification: pendingClarification };
    }
    if (action === 'resolve') {
      const existing = { ...pendingClarification };
      pendingClarification = null;
      const result = payload.result || {};
      const entry = {
        id: existing.id,
        type: existing.type,
        originalQuestion: existing.question,
        originalMessage: existing.payload?.originalMessage || '',
        result: {
          matchConfirmed: Boolean(result.matchConfirmed),
          resolvedAlias: result.resolvedAlias || null,
          canonicalPerson: result.canonicalPerson || null,
          confirmedRange: result.confirmedRange || null,
          resolvedReferent: result.resolvedReferent || null,
          note: result.note || null
        },
        resolvedAt: new Date().toISOString()
      };
      resolvedLog.push(entry);
      if (result.matchConfirmed && result.resolvedAlias && result.canonicalPerson) {
        sessionAliases[result.resolvedAlias] = result.canonicalPerson;
      }
      return { ok: true, resolved: existing, resolvedEntry: entry };
    }
    if (action === 'cancel') {
      pendingClarification = null;
      return { ok: true, cancelled: true };
    }
    throw new Error(`Unknown action: ${action}`);
  },
  reset() {
    this.calls = [];
    pendingClarification = null;
    sessionAliases = {};
    resolvedLog.length = 0;
  }
};

const registryLog = new ToolRegistry();
createLifebookTools({
  readState: async () => state1,
  callInternalTool: createMockInternalTool(),
  memoryStore: store1,
  manageClarification: handlerWithLog.handle.bind(handlerWithLog)
}).forEach((tool) => registryLog.register(tool));

// alias resolve → entry has resolvedAlias+canonicalPerson
await registryLog.call('manage_clarification', {
  action: 'create', type: 'person_alias',
  question: '你说的张伯，是老张吗？',
  payload: { newAlias: '张伯', canonicalPerson: '老张', originalMessage: '张伯最近身体不好' }
}, {});
const aliasResolve = await registryLog.call('manage_clarification', {
  action: 'resolve',
  result: { resolved: true, matchConfirmed: true, resolvedAlias: '张伯', canonicalPerson: '老张' }
}, {});
assert.equal(resolvedLog.length, 1, 'should have 1 resolved entry');
assert.equal(resolvedLog[0].type, 'person_alias');
assert.equal(resolvedLog[0].result.matchConfirmed, true);
assert.equal(resolvedLog[0].result.resolvedAlias, '张伯');
assert.equal(resolvedLog[0].result.canonicalPerson, '老张');
assert.equal(resolvedLog[0].originalMessage, '张伯最近身体不好');
console.log('  ✓ resolve alias → entry with type/resolvedAlias/canonicalPerson/originalMessage');

// time_ambiguity resolve → entry has confirmedRange
handlerWithLog.reset();
await registryLog.call('manage_clarification', {
  action: 'create', type: 'time_ambiguity',
  question: '纺织厂那几年是1988-1995吗？',
  payload: { timeExpression: '纺织厂那几年', suggestedRange: '1988-1995', originalMessage: '纺织厂那几年老张经常帮我' }
}, {});
await registryLog.call('manage_clarification', {
  action: 'resolve',
  result: { resolved: true, matchConfirmed: true, confirmedRange: '1988-1995' }
}, {});
assert.equal(resolvedLog[0].type, 'time_ambiguity');
assert.equal(resolvedLog[0].result.confirmedRange, '1988-1995');
console.log('  ✓ resolve time_ambiguity → entry with confirmedRange');

// pronoun_reference resolve → entry has resolvedReferent
handlerWithLog.reset();
await registryLog.call('manage_clarification', {
  action: 'create', type: 'pronoun_reference',
  question: '你说的他是老张还是老徐？',
  payload: { pronoun: '他', candidates: ['老张', '老徐'], originalMessage: '他后来搬走了' }
}, {});
await registryLog.call('manage_clarification', {
  action: 'resolve',
  result: { resolved: true, matchConfirmed: true, resolvedReferent: '老张' }
}, {});
assert.equal(resolvedLog[0].type, 'pronoun_reference');
assert.equal(resolvedLog[0].result.resolvedReferent, '老张');
console.log('  ✓ resolve pronoun_reference → entry with resolvedReferent');

// resolve with matchConfirmed=false still logs
handlerWithLog.reset();
await registryLog.call('manage_clarification', {
  action: 'create', type: 'person_alias',
  question: '你说的张伯，是老张吗？',
  payload: { newAlias: '张伯', canonicalPerson: '老张' }
}, {});
await registryLog.call('manage_clarification', {
  action: 'resolve',
  result: { resolved: true, matchConfirmed: false }
}, {});
assert.equal(resolvedLog.length, 1, 'rejection should still log');
assert.equal(resolvedLog[0].result.matchConfirmed, false);
console.log('  ✓ resolve with matchConfirmed=false still logs structured entry');

// entries accumulate across multiple resolves
handlerWithLog.reset();
await registryLog.call('manage_clarification', {
  action: 'create', type: 'person_alias',
  question: 'A?', payload: {}
}, {});
await registryLog.call('manage_clarification', {
  action: 'resolve', result: { resolved: true, matchConfirmed: false }
}, {});
await registryLog.call('manage_clarification', {
  action: 'create', type: 'time_ambiguity',
  question: 'B?', payload: {}
}, {});
await registryLog.call('manage_clarification', {
  action: 'resolve', result: { resolved: true, matchConfirmed: true, confirmedRange: '2020' }
}, {});
assert.ok(resolvedLog.length >= 2, 'multiple resolves accumulate');
console.log('  ✓ resolvedClarifications accumulate across multiple resolves');

console.log('\n  stage23 clarification smoke PASSED');
