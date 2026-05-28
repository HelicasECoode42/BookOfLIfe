import assert from 'assert';
import { MemoryStore } from '../memory/MemoryStore.js';
import { normalizeMemoryCandidate, normalizeStringList } from '../memory/CandidateNormalizer.js';

// --- 1. normalizeMemoryCandidate 不产生 [object Object] ---
const badCandidate = {
  people: [{ name: '老张' }, '赵姐', {}, { foo: 'bar' }, { toString: () => '[object Object]' }],
  timeLabels: ['今天', { label: '昨天' }, {}],
  tags: ['纺织厂', {}, { title: '退休' }]
};
const normalized = normalizeMemoryCandidate(badCandidate, { message: '测试' });
assert.deepEqual(normalized.people, ['老张', '赵姐'], `people should not contain [object Object], got: ${JSON.stringify(normalized.people)}`);
assert.deepEqual(normalized.timeLabels, ['今天', '昨天'], `timeLabels should be clean, got: ${JSON.stringify(normalized.timeLabels)}`);
assert.deepEqual(normalized.tags, ['纺织厂', '退休'], `tags should not contain [object Object], got: ${JSON.stringify(normalized.tags)}`);
assert.equal(normalized.status, 'pending_user_confirmation', 'status should be pending_user_confirmation');
console.log('  ✓ normalizeMemoryCandidate eliminates [object Object]');

// --- 2. normalizeStringList edge cases ---
assert.deepEqual(normalizeStringList(null), [], 'null -> []');
assert.deepEqual(normalizeStringList([null, undefined, '', '  ']), [], 'empty items dropped');
assert.deepEqual(normalizeStringList(['a', 'a', 'b']), ['a', 'b'], 'dedupe works');
assert.deepEqual(normalizeStringList(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], 5), ['a', 'b', 'c', 'd', 'e'], 'limit works');
console.log('  ✓ normalizeStringList edge cases pass');

// --- 3. search_memory("张师傅") 命中老张 ---
const state = {
  confirmedFacts: [
    {
      id: 'fact-laozhang',
      canonicalLabel: '老张是纺织厂同事',
      label: '老张是纺织厂同事',
      subject: '老张',
      predicate: '是',
      object: '纺织厂同事',
      relatedPeople: ['老张'],
      timeLabels: ['纺织厂那几年'],
      sourceText: '老张和用户在纺织厂一起工作过十二年。',
      status: 'user_confirmed',
      updatedAt: new Date().toISOString()
    }
  ],
  memoryCandidates: [
    {
      id: 'candidate-laozhang',
      summary: '老张最近退休了',
      sourceText: '今天听说老张退休了。',
      people: ['老张'],
      timeLabels: ['今天'],
      status: 'pending_user_confirmation',
      candidateType: 'event_memory',
      updatedAt: new Date().toISOString()
    }
  ],
  memories: [],
  dailyLogs: [],
  photos: [],
  lifeSummaries: []
};

const store = new MemoryStore({ readState: async () => state });

const searchResult = await store.search('张师傅', { limit: 5 });
assert.ok(searchResult.results.length > 0, 'search_memory("张师傅") should return results for 老张');
const laozhangHit = searchResult.results.find((r) => r.id === 'fact-laozhang');
assert.ok(laozhangHit, 'search_memory("张师傅") should hit fact-laozhang');
console.log('  ✓ search_memory("张师傅") hits 老张 via alias expansion');

// --- 4. search result 带 memoryLayer/trustLevel/answerPolicy/evidence ---
const firstResult = searchResult.results[0];
assert.ok(firstResult.memoryLayer, 'result should have memoryLayer');
assert.ok(firstResult.trustLevel, 'result should have trustLevel');
assert.ok(firstResult.answerPolicy, 'result should have answerPolicy');
assert.ok(Array.isArray(firstResult.evidence), 'result should have evidence array');
assert.equal(firstResult.memoryLayer, 'confirmed_fact', 'confirmed fact layer');
assert.equal(firstResult.answerPolicy, 'can_state_as_fact', 'confirmed fact answer policy');
console.log('  ✓ search result has memoryLayer/trustLevel/answerPolicy/evidence');

// --- 5. candidate result answerPolicy is must_mark_unconfirmed ---
const candidateResult = searchResult.results.find((r) => r.source === 'memoryCandidates');
if (candidateResult) {
  assert.equal(candidateResult.answerPolicy, 'must_mark_unconfirmed', 'candidate must be marked unconfirmed');
  console.log('  ✓ candidate answerPolicy is must_mark_unconfirmed');
} else {
  console.log('  (no candidate in search results)');
}

// --- 6. queryTimeline("张师傅") 命中老张时间轴 ---
const stateForTimeline = {
  confirmedFacts: [
    {
      id: 'fact-laozhang',
      canonicalLabel: '老张是纺织厂同事',
      label: '老张是纺织厂同事',
      relatedPeople: ['老张'],
      timeLabels: ['纺织厂那几年'],
      timelineDate: '1990',
      sourceText: '老张和用户在纺织厂一起工作过十二年。',
      status: 'user_confirmed',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'fact-laozhang-retire',
      canonicalLabel: '老张2022年退休',
      label: '老张2022年退休',
      relatedPeople: ['老张'],
      timeLabels: ['2022年'],
      timelineDate: '2022-03',
      sourceText: '老张2022年3月退休了。',
      status: 'user_confirmed',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'fact-laozhang-trip',
      canonicalLabel: '和老张一起出差',
      label: '和老张一起出差',
      relatedPeople: ['老张'],
      timeLabels: ['2022年'],
      timelineDate: '2022-03-15',
      sourceText: '2022年3月和老张一起去广州出差。',
      status: 'user_confirmed',
      updatedAt: new Date().toISOString()
    }
  ],
  memories: [
    {
      id: 'mem-laozhang',
      title: '老张模糊印象',
      content: '老张是个很好的人。',
      people: ['老张'],
      summary: '老张是个很好的人。',
      status: 'user_saved',
      updatedAt: new Date().toISOString()
    }
  ],
  dailyLogs: [],
  memoryCandidates: [],
  photos: [],
  lifeSummaries: []
};

const timelineStore = new MemoryStore({ readState: async () => stateForTimeline });
const timeline = await timelineStore.queryTimeline({ person: '张师傅', limit: 20 });
assert.ok(timeline.items.length > 0, 'queryTimeline("张师傅") should return dated items for 老张');
const laozhangTimelineItem = timeline.items.find((item) => item.people.includes('老张'));
assert.ok(laozhangTimelineItem, 'queryTimeline("张师傅") should find items with person 老张');
console.log('  ✓ queryTimeline("张师傅") hits 老张 timeline via alias expansion');

// --- 7. timeline item 有 id/answerPolicy/status ---
timeline.items.forEach((item) => {
  assert.ok(item.id !== undefined && item.id !== null, `timeline item should have id: ${JSON.stringify(item)}`);
  assert.ok(item.answerPolicy !== undefined, `timeline item should have answerPolicy: ${JSON.stringify(item)}`);
  assert.ok(item.status !== undefined, `timeline item should have status: ${JSON.stringify(item)}`);
});
if (timeline.fuzzyItems.length > 0) {
  timeline.fuzzyItems.forEach((item) => {
    assert.ok(item.id !== undefined, `fuzzy item should have id`);
  });
}
console.log('  ✓ timeline items have id/answerPolicy/status');

// --- 8. potentialConflicts.items 是对象数组 [{id, title, source}] ---
// 退休 + 同月出差应该产生 potential conflict
assert.ok(timeline.potentialConflicts.length > 0, 'should detect potential conflicts between retire + trip');
timeline.potentialConflicts.forEach((conflict) => {
  assert.ok(Array.isArray(conflict.items), 'conflict items should be array');
  assert.ok(conflict.items.length >= 2, 'conflict should have at least 2 items');
  conflict.items.forEach((item) => {
    assert.equal(typeof item, 'object', `conflict item should be object, got ${typeof item}: ${JSON.stringify(item)}`);
    assert.ok(item.id, `conflict item should have id: ${JSON.stringify(item)}`);
    assert.ok(item.title, `conflict item should have title: ${JSON.stringify(item)}`);
    assert.ok(item.source, `conflict item should have source: ${JSON.stringify(item)}`);
  });
});
console.log('  ✓ potentialConflicts.items are objects with id/title/source');

// --- 9. 张师傅查不到非老张的人 ---
const noResult = await timelineStore.queryTimeline({ person: '王五', limit: 10 });
assert.equal(noResult.items.length, 0, 'queryTimeline("王五") should return no items');
console.log('  ✓ queryTimeline("王五") returns empty for unknown person');

// --- 10. fuzzy conflict severity 保守 ---
// 只带模糊时间的记录不应和 dated event 产生无意义 conflict
const stateFuzzy = {
  confirmedFacts: [
    {
      id: 'fact-a',
      canonicalLabel: '老张是同事',
      label: '老张是同事',
      relatedPeople: ['老张'],
      timelineDate: '2020',
      sourceText: '老张是纺织厂同事。',
      status: 'user_confirmed',
      updatedAt: new Date().toISOString()
    }
  ],
  lifeSummaries: [
    {
      id: 'summary-b',
      label: '老张印象',
      summary: '老张是个好人。',
      people: ['老张'],
      status: 'confirmed',
      updatedAt: new Date().toISOString()
    }
  ],
  memories: [],
  dailyLogs: [],
  memoryCandidates: [],
  photos: []
};
const fuzzyStore = new MemoryStore({ readState: async () => stateFuzzy });
const fuzzyTimeline = await fuzzyStore.queryTimeline({ person: '老张', limit: 10 });
assert.equal(fuzzyTimeline.potentialConflicts.length, 0,
  'fuzzy timeline without timeLabel overlap should not generate conflicts');
console.log('  ✓ fuzzy overlap without shared timeLabels produces no false conflicts');

// --- 11. timeRange filter: start only ---
const stateTimeRange = {
  confirmedFacts: [
    { id: 't1', canonicalLabel: '1990事件', label: '1990事件', relatedPeople: ['老张'], timelineDate: '1990-05', sourceText: '1990年的事', status: 'user_confirmed', updatedAt: new Date().toISOString() },
    { id: 't2', canonicalLabel: '2020事件', label: '2020事件', relatedPeople: ['老张'], timelineDate: '2020-03', sourceText: '2020年的事', status: 'user_confirmed', updatedAt: new Date().toISOString() },
    { id: 't3', canonicalLabel: '2023事件', label: '2023事件', relatedPeople: ['老张'], timelineDate: '2023-08', sourceText: '2023年的事', status: 'user_confirmed', updatedAt: new Date().toISOString() }
  ],
  memories: [],
  dailyLogs: [],
  memoryCandidates: [],
  photos: [],
  lifeSummaries: []
};
const trStore = new MemoryStore({ readState: async () => stateTimeRange });

// start=2020-01 → only 2020+ entries
const tr1 = await trStore.queryTimeline({ person: '老张', limit: 20, timeRange: { start: '2020-01' } });
assert.equal(tr1.items.length, 2, 'timeRange start=2020-01 should return 2 items');
assert.equal(tr1.items[0].id, 't2', 'first should be 2020');

// end=2000-12 → only 1990 entry
const tr2 = await trStore.queryTimeline({ person: '老张', limit: 20, timeRange: { end: '2000-12' } });
assert.equal(tr2.items.length, 1, 'timeRange end=2000-12 should return 1 item');
assert.equal(tr2.items[0].id, 't1', 'should be 1990 entry');

// start=2019 + end=2021 → only 2020 entry
const tr3 = await trStore.queryTimeline({ person: '老张', limit: 20, timeRange: { start: '2019-01', end: '2021-12' } });
assert.equal(tr3.items.length, 1, 'timeRange 2019-2021 should return 1 item');
assert.equal(tr3.items[0].id, 't2');

// no timeRange → all 3
const tr4 = await trStore.queryTimeline({ person: '老张', limit: 20 });
assert.equal(tr4.items.length, 3, 'no timeRange should return all 3 items');
console.log('  ✓ timeRange filter: start/end/range/no-range');

// --- 12. fuzzy items with no_exact_date when timeRange active ---
const stateFuzzyTimeRange = {
  confirmedFacts: [
    { id: 'ft1', canonicalLabel: '2022事件', label: '2022事件', relatedPeople: ['老张'], timelineDate: '2022-06', sourceText: '2022', status: 'user_confirmed', updatedAt: new Date().toISOString() }
  ],
  memories: [
    { id: 'ft2', title: '老张模糊', content: '老张的模糊记忆', people: ['老张'], summary: '模糊记忆', status: 'user_saved', updatedAt: new Date().toISOString() }
  ],
  dailyLogs: [],
  memoryCandidates: [],
  photos: [],
  lifeSummaries: []
};
const ftrStore = new MemoryStore({ readState: async () => stateFuzzyTimeRange });
const ftr = await ftrStore.queryTimeline({ person: '老张', limit: 20, timeRange: { start: '2020-01' } });
const fuzzyWithFlag = ftr.fuzzyItems.filter((f) => f.no_exact_date === true);
assert.ok(ftr.fuzzyItems.length > 0, 'fuzzy items should be retained with timeRange');
assert.ok(fuzzyWithFlag.length > 0, 'fuzzy items should have no_exact_date flag');
console.log('  ✓ fuzzy items annotated with no_exact_date when timeRange active');

// --- 13. GET /api/timeline passes timeRange through MemoryStore.queryTimeline ---
// (tested via MemoryStore directly; endpoint is a thin wrapper)
const trApi = await trStore.queryTimeline({ person: '老张', limit: 20, timeRange: { start: '2022-01', end: '2023-12' } });
assert.equal(trApi.items.length, 1, '2022-2023 range via store = 1 item');
assert.equal(trApi.items[0].id, 't3', 'should be 2023 entry');
console.log('  ✓ queryTimeline timeRange via MemoryStore (same path as GET /api/timeline)');

console.log('\n  stage22 layered memory smoke PASSED');
