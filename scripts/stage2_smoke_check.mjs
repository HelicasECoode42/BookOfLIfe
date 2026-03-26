import fs from 'fs';
import vm from 'vm';
import assert from 'assert';

const scriptPath = new URL('../script.js', import.meta.url);
const code = fs.readFileSync(scriptPath, 'utf8');

const storage = new Map();
const localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  }
};

const noop = () => {};
const fakeElement = () => ({
  value: '',
  innerHTML: '',
  textContent: '',
  style: {},
  dataset: {},
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  addEventListener: noop,
  removeEventListener: noop,
  setAttribute: noop,
  getAttribute: () => '',
  querySelector: () => null,
  querySelectorAll: () => [],
  closest: () => null,
  appendChild: noop,
  insertAdjacentHTML: noop,
  getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 0, width: 0, height: 0 }),
  scrollHeight: 0
});

const context = {
  console,
  localStorage,
  Intl,
  Date,
  Math,
  JSON,
  setTimeout: noop,
  clearTimeout: noop,
  alert: noop,
  fetch: async () => {
    throw new Error('fetch disabled in smoke test');
  },
  document: {
    addEventListener: noop,
    body: { classList: { add: noop, remove: noop } },
    getElementById: () => fakeElement(),
    querySelector: () => null,
    querySelectorAll: () => []
  },
  window: {
    addEventListener: noop,
    setTimeout: noop,
    innerHeight: 800,
    L2Dwidget: { init: noop }
  },
  SpeechRecognition: undefined,
  webkitSpeechRecognition: undefined,
  Element: function Element() {}
};

vm.createContext(context);
vm.runInContext(code, context);

const retrieval = (text, explicitPeople = [], timeRefs = []) => ({
  queryFeatures: {
    text,
    explicitPeople,
    timeRefs,
    intent: 'listen',
    emotion: '平静',
    tokens: [],
    embedding: []
  },
  understanding: { responseMode: 'chatting' },
  memories: [],
  pendingTimeQuestions: [],
  profileSignals: [],
  lifeSummaries: []
});

assert.ok(typeof context.detectTurnSignals === 'function', 'detectTurnSignals should exist');
assert.ok(typeof context.buildLocalReplyPlan === 'function', 'buildLocalReplyPlan should exist');
assert.ok(typeof context.postProcessMemoryCandidate === 'function', 'postProcessMemoryCandidate should exist');
assert.ok(typeof context.parseTimeRef === 'function', 'parseTimeRef should exist');
assert.ok(typeof context.rebuildLocalFacts === 'function', 'rebuildLocalFacts should exist');
assert.ok(typeof context.isAnswerToRecentQuestion === 'function', 'isAnswerToRecentQuestion should exist');
assert.ok(typeof context.getFactDatabase === 'function', 'getFactDatabase should exist');
assert.ok(typeof context.mergePersonAliases === 'function', 'mergePersonAliases should exist');
assert.ok(typeof context.runReplySafetyCheck === 'function', 'runReplySafetyCheck should exist');

const timeSignals = context.detectTurnSignals('我突然想不起来啦，那是昨天的。', retrieval('我突然想不起来啦，那是昨天的。'));
assert.equal(timeSignals.correctionType, 'time');
assert.equal(timeSignals.hasTimeConflict, true);
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(timeSignals.resolvedRelativeTime));
assert.equal(timeSignals.replyTimeStrategy, 'revise_active_event_time');
assert.ok(timeSignals.timeRef && timeSignals.timeRef.normalizedLabel === '昨天');
assert.ok(timeSignals.timeConfidence >= 0.9);

const correctionSignals = context.detectTurnSignals('诶不对，我们是前天下棋的啊。', retrieval('诶不对，我们是前天下棋的啊。', [], ['前天']));
assert.equal(correctionSignals.correctionType, 'time');
assert.equal(correctionSignals.timeAnchorLabel, '前天');

const weekSignals = context.detectTurnSignals('我们下周五再去。', retrieval('我们下周五再去。', [], ['下周五']));
assert.equal(weekSignals.timeAnchorLabel, '下周五');
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(weekSignals.resolvedRelativeTime));
assert.equal(weekSignals.timeRef.timeType, 'relative_weekday');

const recurringSignals = context.detectTurnSignals('我们每周四都去跳舞。', retrieval('我们每周四都去跳舞。', [], ['每周四']));
assert.equal(recurringSignals.timeAnchorLabel, '每周四');
assert.equal(recurringSignals.replyTimeStrategy, 'use_relative_label_only');

const lifeStageRef = context.parseTimeRef('我小时候住过那边。');
assert.equal(lifeStageRef.timeType, 'life_stage');
assert.equal(lifeStageRef.lifeStageLabel, '小时候');
assert.equal(lifeStageRef.resolvedDate, '');

context.setActiveEventContext({
  people: ['赵姐'],
  actions: ['跳广场舞'],
  timeLabel: '昨天',
  resolvedDate: '2026-03-25',
  summary: '昨天，赵姐，跳广场舞'
});
const conflictSignals = context.detectTurnSignals('今天我去找赵姐。', retrieval('今天我去找赵姐。', ['赵姐'], ['今天']));
assert.equal(conflictSignals.conflictDetected, true);
assert.equal(conflictSignals.replyTimeStrategy, 'acknowledge_uncertainty');

const metaSignals = context.detectTurnSignals('我记得我跟你聊了，但没来得及存档，我也看不到你的卡片整理。', retrieval('我记得我跟你聊了，但没来得及存档，我也看不到你的卡片整理。'));
assert.equal(metaSignals.metaConversation, true);
assert.equal(metaSignals.shouldAvoidMemoryRecall, true);
assert.equal(metaSignals.metaConversationType, 'product_state');

const entitySignals = context.detectTurnSignals('不是赵姐，是李阿姨。', retrieval('不是赵姐，是李阿姨。', ['赵姐', '李阿姨']));
assert.equal(entitySignals.correctionType, 'entity');
assert.equal(entitySignals.hasEntityConflict, true);

const metaPlan = context.buildLocalReplyPlan('我只是点了忆光，但没保存，结果它没了。', retrieval('我只是点了忆光，但没保存，结果它没了。'));
assert.equal(metaPlan.isMetaConversation, true);
assert.equal(metaPlan.shouldAvoidMemoryRecall, true);
assert.equal(metaPlan.replyStrategy, 'avoid_memory_claim');

const confirmationPlan = context.buildLocalReplyPlan('我记得是赵姐还是李阿姨来着。', retrieval('我记得是赵姐还是李阿姨来着。', ['赵姐', '李阿姨']));
assert.equal(confirmationPlan.needsConfirmation, true);
assert.ok(confirmationPlan.confirmationPrompt.includes('赵姐'));

const unsafeCheck = context.runReplySafetyCheck(
  '肯定就是昨天和赵姐那次。',
  '那好像不是昨天吧',
  { memories: [], queryFeatures: { explicitPeople: [], timeRefs: [], text: '那好像不是昨天吧', intent: 'listen', emotion: '平静', tokens: [], embedding: [] } },
  { needsConfirmation: true, confirmationPrompt: '我先确认一下，这次是今天，还是昨天？', replyTimeStrategy: 'acknowledge_uncertainty', consistencyWarnings: ['时间还不稳'] }
);
assert.equal(unsafeCheck.ok, false);
assert.equal(unsafeCheck.issues.includes('overstates_low_confidence'), true);

context.setChatHistory([
  { role: 'assistant', content: 'Manner的咖啡确实不错，您喜欢它家哪种口味呢？', createdAt: '2026/3/26 14:00:00' }
]);
assert.equal(context.isAnswerToRecentQuestion('清橙拿铁'), true);
const answerFallback = context.fallbackReply('清橙拿铁', '平静', []);
assert.ok(answerFallback.includes('清橙拿铁'));
const sanitizedAnswer = context.sanitizeAssistantReply(
  '清橙拿铁啊，听起来这是你会专门记住的一杯。',
  '清橙拿铁',
  { understanding: { responseMode: 'chatting' }, queryFeatures: { explicitPeople: [], timeRefs: [], text: '清橙拿铁', intent: 'listen', emotion: '平静', tokens: [], embedding: [] }, memories: [] },
  {}
);
assert.ok(sanitizedAnswer.includes('清橙拿铁'));

context.setActiveEventContext({
  people: ['赵姐'],
  actions: ['跳广场舞'],
  timeLabel: '昨天',
  resolvedDate: '2026-03-25',
  summary: '昨天，赵姐，跳广场舞'
});
const followUpRetrieval = retrieval('舒服');
followUpRetrieval.activeEvent = context.getActiveEventContext();
const followUpPlan = context.buildLocalReplyPlan('舒服', followUpRetrieval);
assert.equal(followUpPlan.isActiveEventFollowUp, true);
assert.equal(followUpPlan.replyStrategy, 'continue_event');
assert.equal(followUpPlan.eventLinkAction, 'attach_to_existing_event');

const cleanedCandidate = context.postProcessMemoryCandidate({
  people: ['她'],
  memorySignal: true,
  candidateType: 'daily_fragment',
  summary: '前几天还和她见过面。',
  narrative: '先把这段内容放进待整理里。',
  confidence: 0.8,
  missingPieces: []
}, '前几天我好像还跟她见过。', retrieval('前几天我好像还跟她见过。', [], ['前几天']), { isMetaConversation: false, shouldAvoidMemoryRecall: false });

assert.equal(Array.isArray(cleanedCandidate.people), true);
assert.equal(cleanedCandidate.people.length, 0);
assert.ok(cleanedCandidate.missingPieces.includes('人物待确认'));

const foodRetrieval = retrieval('今天吃了红烧肉，昨天吃了鸡蛋羹，都挺好吃的，我得记住怎么做。', [], ['今天', '昨天']);
const foodPlan = context.buildLocalReplyPlan('今天吃了红烧肉，昨天吃了鸡蛋羹，都挺好吃的，我得记住怎么做。', foodRetrieval);
const foodCandidate = context.buildLocalMemoryFilter('今天吃了红烧肉，昨天吃了鸡蛋羹，都挺好吃的，我得记住怎么做。', foodRetrieval, foodPlan);
assert.equal(foodCandidate.candidateType, 'daily_fragment');
assert.equal(foodCandidate.memorySignal, true);
const foodConsolidated = context.consolidateMemoryCandidate(foodCandidate, [foodCandidate], {});
assert.notEqual(foodConsolidated.summary, '最近几条线索都落在同一段待补时间里，可以先按人生阶段收着。');

context.setActiveEventContext({
  people: ['赵姐'],
  actions: ['跳广场舞'],
  timeLabel: '昨天',
  resolvedDate: '2026-03-25',
  summary: '昨天，赵姐，跳广场舞'
});
const newEventRetrieval = retrieval('今天我做了红烧肉', [], ['今天']);
context.updateActiveEventContextFromTurn('今天我做了红烧肉', newEventRetrieval, context.buildLocalReplyPlan('今天我做了红烧肉', newEventRetrieval));
const switchedEvent = context.getActiveEventContext();
assert.equal(switchedEvent.timeLabel, '今天');
assert.equal(switchedEvent.people.includes('赵姐'), false);
assert.equal(switchedEvent.actions.includes('跳广场舞'), false);
assert.ok(switchedEvent.actions.includes('做饭') || switchedEvent.actions.includes('做红烧肉'));
assert.ok(/今天/.test(switchedEvent.summary));
assert.equal(switchedEvent.linkAction, 'create_new_event');
assert.equal(switchedEvent.status, 'active');

const activeFollowUpReply = context.sanitizeAssistantReply(
  '是老伴约的你。那昨天这盘棋下得怎么样？',
  '他约的我',
  {
    understanding: { responseMode: 'chatting' },
    queryFeatures: { explicitPeople: [], timeRefs: [], text: '他约的我', intent: 'listen', emotion: '平静', tokens: [], embedding: [] },
    memories: [],
    activeEvent: {
      people: ['老伴'],
      actions: ['下棋'],
      timeLabel: '昨天',
      summary: '昨天，老伴，下棋'
    }
  },
  { isActiveEventFollowUp: true, shouldAvoidMemoryRecall: false }
);
assert.equal(activeFollowUpReply, '是老伴约的你。那昨天这盘棋下得怎么样？');

const spouseDailyCandidate = context.buildLocalMemoryFilter(
  '我昨天和老伴下棋，他约的我',
  retrieval('我昨天和老伴下棋，他约的我', ['老伴'], ['昨天']),
  context.buildLocalReplyPlan('我昨天和老伴下棋，他约的我', retrieval('我昨天和老伴下棋，他约的我', ['老伴'], ['昨天']))
);
assert.equal(spouseDailyCandidate.candidateType, 'daily_fragment');
assert.ok(context.getCandidateLineKey(spouseDailyCandidate).startsWith('event:'));
assert.ok(spouseDailyCandidate.timeRef && spouseDailyCandidate.timeRef.normalizedLabel === '昨天');
assert.ok(spouseDailyCandidate.timeConfidence >= 0.9);

const lifeStageCandidate = context.buildLocalMemoryFilter(
  '我小时候住过那边。',
  retrieval('我小时候住过那边。', [], ['小时候']),
  context.buildLocalReplyPlan('我小时候住过那边。', retrieval('我小时候住过那边。', [], ['小时候']))
);
assert.equal(lifeStageCandidate.timeRef.lifeStageLabel, '小时候');
assert.equal(lifeStageCandidate.timeRef.resolvedDate, '');

const mixedCandidate = context.postProcessMemoryCandidate({
  filteredText: '前天我做了红烧肉，昨天我和赵姐跳舞了。',
  memorySignal: true,
  candidateType: 'daily_fragment',
  summary: '前天做了红烧肉，昨天和赵姐跳舞。',
  narrative: '两个相邻日常片段。',
  confidence: 0.8,
  people: ['赵姐'],
  missingPieces: []
}, '前天我做了红烧肉，昨天我和赵姐跳舞了。', retrieval('前天我做了红烧肉，昨天我和赵姐跳舞了。', ['赵姐'], ['前天', '昨天']), { isMetaConversation: false, shouldAvoidMemoryRecall: false });
assert.equal(mixedCandidate.memorySignal, false);
assert.equal(mixedCandidate.candidateType, 'none');

context.setMemoryCandidates([context.normalizeMemoryCandidate({
  people: ['老伴'],
  filteredText: '我昨天和老伴下棋了',
  summary: '昨天和老伴一起下棋',
  narrative: '昨天和老伴一起下棋。',
  memorySignal: true,
  candidateType: 'daily_fragment',
  timeType: 'relative',
  sourceTurnIds: ['t-1']
})]);
context.setActiveEventContext({
  people: ['老伴'],
  actions: ['下棋'],
  timeLabel: '昨天',
  resolvedDate: '2026-03-25',
  summary: '昨天，老伴，下棋'
});
const correctionRetrieval = retrieval('诶不对，我们是前天下棋的啊', [], ['前天']);
context.updateActiveEventContextFromTurn('诶不对，我们是前天下棋的啊', correctionRetrieval, context.buildLocalReplyPlan('诶不对，我们是前天下棋的啊', correctionRetrieval));
const revisedCandidate = context.getMemoryCandidates()[0];
assert.ok(revisedCandidate.summary.includes('前天'));
assert.equal(revisedCandidate.summary.includes('昨天'), false);
const revisedEvent = context.getActiveEventContext();
assert.equal(revisedEvent.linkAction, 'revise_existing_event');
assert.equal(revisedEvent.status, 'revised');
const revisionLogsAfterTime = context.getRevisionLogs();
assert.equal(revisionLogsAfterTime[0].revisionType, 'time_revision');

context.setActiveEventContext({
  people: ['赵姐'],
  actions: ['出门'],
  timeLabel: '今天',
  resolvedDate: '2026-03-26',
  summary: '今天，赵姐，出门'
});
const entityCorrectionRetrieval = retrieval('不是赵姐，是李阿姨。', ['赵姐', '李阿姨'], []);
context.updateActiveEventContextFromTurn('不是赵姐，是李阿姨。', entityCorrectionRetrieval, context.buildLocalReplyPlan('不是赵姐，是李阿姨。', entityCorrectionRetrieval));
const revisionLogsAfterEntity = context.getRevisionLogs();
assert.equal(revisionLogsAfterEntity[0].revisionType, 'entity_revision');
assert.equal(Array.isArray(revisionLogsAfterEntity[0].newValue), true);
assert.equal(revisionLogsAfterEntity[0].newValue.includes('李阿姨'), true);

context.setMemoryCandidates([context.normalizeMemoryCandidate({
  id: 'cand-1',
  people: ['赵姐'],
  filteredText: '昨天和赵姐出门了',
  summary: '昨天和赵姐出门了',
  memorySignal: true,
  candidateType: 'daily_fragment',
  timeType: 'relative',
  sourceTurnIds: ['turn-a']
})]);
let localFacts = context.getLocalFacts();
const singleMentionFact = localFacts.find((item) => item.object === '赵姐');
assert.equal(singleMentionFact.status, 'proposed');

context.setMemoryCandidates([
  context.normalizeMemoryCandidate({
    id: 'cand-1',
    people: ['赵姐'],
    filteredText: '昨天和赵姐出门了',
    summary: '昨天和赵姐出门了',
    memorySignal: true,
    candidateType: 'daily_fragment',
    timeType: 'relative',
    sourceTurnIds: ['turn-a']
  }),
  context.normalizeMemoryCandidate({
    id: 'cand-2',
    people: ['赵姐'],
    filteredText: '刚刚赵姐打电话了',
    summary: '刚刚赵姐打电话了',
    memorySignal: true,
    candidateType: 'daily_fragment',
    timeType: 'present',
    sourceTurnIds: ['turn-b']
  })
]);
localFacts = context.getLocalFacts();
const supportedFact = localFacts.find((item) => item.object === '赵姐');
assert.equal(supportedFact.status, 'supported');
assert.ok(supportedFact.confidence >= 0.72);

const supportedSignals = context.retrieveRelevantProfileSignals('赵姐刚刚又来电话了');
assert.equal(supportedSignals.some((item) => item.type === '重要人物事实' && item.value.includes('赵姐')), true);

const factDatabase = context.getFactDatabase();
assert.equal(factDatabase.some((item) => item.object === '赵姐' && item.verificationStatus === 'verified'), true);

context.setMemoryCandidates([]);
context.setActiveEventContext(null);
let cardRetrieval = retrieval('昨天我在给她写贺卡', [], ['昨天']);
let cardPlan = context.buildLocalReplyPlan('昨天我在给她写贺卡', cardRetrieval);
context.updateActiveEventContextFromTurn('昨天我在给她写贺卡', cardRetrieval, cardPlan);
const cardCandidate = context.buildLocalMemoryFilter('昨天我在给她写贺卡', cardRetrieval, cardPlan);
assert.equal(cardCandidate.memorySignal, true);
assert.ok(cardCandidate.timeRef.normalizedLabel === '昨天');
assert.ok((context.getActiveEventContext().actions || []).includes('写贺卡'));

cardRetrieval = retrieval('哦不对，是今天写的贺卡。我记错了，你知道的', [], ['今天']);
cardPlan = context.buildLocalReplyPlan('哦不对，是今天写的贺卡。我记错了，你知道的', cardRetrieval);
context.updateActiveEventContextFromTurn('哦不对，是今天写的贺卡。我记错了，你知道的', cardRetrieval, cardPlan);
const cardRevisedEvent = context.getActiveEventContext();
assert.equal(cardRevisedEvent.timeLabel, '今天');
assert.equal(cardRevisedEvent.linkAction, 'revise_existing_event');

context.setMemoryCandidates([]);
context.setActiveEventContext({
  id: 'event-bday',
  people: ['清江移步'],
  actions: ['写贺卡', '庆祝生日'],
  timeLabel: '今天',
  resolvedDate: '2026-03-26',
  summary: '今天，清江移步，写贺卡、庆祝生日',
  sourceTurnId: 'turn-bday'
});
const slotFillRetrieval = retrieval('今天写好啦！早上写的，去给她过生日，刚回来', [], ['今天']);
slotFillRetrieval.activeEvent = context.getActiveEventContext();
const slotFillPlan = context.buildLocalReplyPlan('今天写好啦！早上写的，去给她过生日，刚回来', slotFillRetrieval);
const slotFilledCandidate = context.buildLocalMemoryFilter('今天写好啦！早上写的，去给她过生日，刚回来', slotFillRetrieval, slotFillPlan);
assert.equal(slotFilledCandidate.people.includes('清江移步'), true);
assert.equal(slotFilledCandidate.missingPieces.includes('人物'), false);

context.mergePersonAliases('清江移步', ['老徐', '清江移步'], 0.96);
assert.equal(context.resolveCanonicalPersonName('老徐'), '清江移步');
const aliasFacts = context.getFactDatabase().filter((item) => item.factType === 'alias_fact');
assert.equal(aliasFacts.some((item) => item.object === '清江移步' && item.aliases.includes('老徐')), true);

context.setMemories([
  context.normalizeMemory({
    id: 'mem-y',
    title: '昨天和赵姐跳舞',
    content: '昨天和赵姐去跳广场舞了。',
    summary: '昨天和赵姐跳广场舞。',
    people: [{ name: '赵姐' }],
    timeRefs: ['昨天'],
    timelineLabel: '昨天',
    actions: ['跳广场舞'],
    createdAt: '2026/3/25 20:00:00'
  }),
  context.normalizeMemory({
    id: 'mem-t',
    title: '今天和赵姐吃饭',
    content: '今天和赵姐一起吃饭了。',
    summary: '今天和赵姐吃饭。',
    people: [{ name: '赵姐' }],
    timeRefs: ['今天'],
    timelineLabel: '今天',
    actions: ['吃饭'],
    createdAt: '2026/3/26 12:00:00'
  })
]);
const reorderedMemories = context.retrieveRelevantMemories('昨天和赵姐那次');
assert.equal(reorderedMemories[0].timelineLabel, '昨天');

context.setMemoryCandidates([]);
context.setActiveEventContext(null);
let birthdayRetrieval = retrieval('今天和朋友出去过生日了。我过得很开心', [], ['今天']);
let birthdayPlan = context.buildLocalReplyPlan('今天和朋友出去过生日了。我过得很开心', birthdayRetrieval);
let birthdayCandidate = context.buildLocalMemoryFilter('今天和朋友出去过生日了。我过得很开心', birthdayRetrieval, birthdayPlan);
context.upsertMemoryCandidate(birthdayCandidate, {});
context.updateActiveEventContextFromTurn('今天和朋友出去过生日了。我过得很开心', birthdayRetrieval, birthdayPlan);

birthdayRetrieval = retrieval('她是过生日的朋友，老徐', ['老徐'], []);
birthdayRetrieval.activeEvent = context.getActiveEventContext();
birthdayPlan = context.buildLocalReplyPlan('她是过生日的朋友，老徐', birthdayRetrieval);
context.updateActiveEventContextFromTurn('她是过生日的朋友，老徐', birthdayRetrieval, birthdayPlan);
let afterPersonFill = context.getMemoryCandidates()[0];
assert.equal(afterPersonFill.people.some((name) => name === '老徐' || name === '清江移步'), true);
assert.equal(afterPersonFill.missingPieces.includes('人物'), false);

birthdayRetrieval = retrieval('老徐的网名。嘻嘻。同一个人哦', ['老徐'], []);
birthdayRetrieval.activeEvent = context.getActiveEventContext();
birthdayPlan = context.buildLocalReplyPlan('老徐的网名。嘻嘻。同一个人哦', birthdayRetrieval);
context.updateActiveEventContextFromTurn('清江移步就是老徐', retrieval('清江移步就是老徐', ['清江移步', '老徐'], []), context.buildLocalReplyPlan('清江移步就是老徐', retrieval('清江移步就是老徐', ['清江移步', '老徐'], [])));
afterPersonFill = context.getMemoryCandidates()[0];
assert.equal(afterPersonFill.people.includes('清江移步'), true);

const followBirthdayRetrieval = retrieval('今晚吃的烤肉，和老徐一起', ['老徐'], ['今天']);
followBirthdayRetrieval.activeEvent = context.getActiveEventContext();
const followBirthdayPlan = context.buildLocalReplyPlan('今晚吃的烤肉，和老徐一起', followBirthdayRetrieval);
const followBirthdayCandidate = context.buildLocalMemoryFilter('今晚吃的烤肉，和老徐一起', followBirthdayRetrieval, followBirthdayPlan);
assert.equal(Boolean(followBirthdayCandidate.eventKey), true);

console.log('stage2 smoke check passed');
