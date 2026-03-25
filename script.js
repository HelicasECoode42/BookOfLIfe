const STORAGE_KEYS = {
  memories: 'life_book_memories_v3',
  chat: 'life_book_chat_v3',
  profile: 'life_book_profile_v3',
  settings: 'life_book_settings_v3',
  lastChatRecap: 'life_book_last_chat_recap_v1',
  memoryCues: 'life_book_memory_cues_v1',
  strategyTrail: 'life_book_strategy_trail_v1',
  memoryCandidates: 'life_book_memory_candidates_v1',
  lifeSummaries: 'life_book_life_summaries_v1'
};

const DEFAULT_PROFILE = {
  name: '李阿姨',
  role: '正在整理人生故事的人',
  family: '',
  preferences: '喜欢把生活里的片段慢慢理顺',
  tone: '像懂自己的晚辈，轻一点，慢一点',
  speakingStyle: '',
  worldview: '',
  userStyle: {
    talkingPace: '',
    reactsWellTo: [],
    reactsPoorlyTo: [],
    anchorTopics: [],
    humorStyle: ''
  },
  likes: [],
  habits: [],
  goals: [],
  dislikes: [],
  importantPeople: [],
  keyMemories: []
};

const DEFAULT_SETTINGS = {
  fontSize: '17px',
  companionName: '温伴',
  accent: '#c76645'
};

// Live2D visual tuning for the book-stage layout.
const LIVE2D_TUNE = {
  chatOffsetX: 100,
  chatOffsetY: 6,
  chatWidthRatio: 0.42,
  chatHeightRatio: 0.86
};

const LOCAL_EMBEDDING_DIM = 128;

const SEED_MEMORIES = [];

const EMOTION_HINTS = {
  难过: ['难过', '想哭', '失落', '孤单', '空落落', '委屈', '伤心'],
  焦虑: ['担心', '害怕', '睡不着', '不安', '着急', '烦', '紧张'],
  怀念: ['以前', '那时候', '想起', '怀念', '记得', '从前', '年轻'],
  温暖: ['开心', '高兴', '幸福', '安心', '舒服', '踏实', '温暖'],
  平静: ['今天', '最近', '还好', '慢慢', '一般', '没事']
};

let recognition;
let recognizing = false;
let activeMemoryId = null;
let activePersonName = null;
let activeBookPanel = '';
const personSummaryCache = new Map();
let pendingMemoryDraft = null;
let memoryCandidatesExpanded = false;
let lifeSummaryComposeTimer = null;
let lifeSummaryComposeInFlight = false;

function autosizeTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function autosizeMemoryEditors() {
  document.querySelectorAll('.memory-inline-editor textarea').forEach((textarea) => {
    autosizeTextarea(textarea);
    if (textarea.dataset.autosizeBound === 'true') return;
    textarea.addEventListener('input', () => {
      autosizeTextarea(textarea);
      syncMemoryCardHeights(textarea.closest('.memory-entry'));
    });
    textarea.dataset.autosizeBound = 'true';
  });
}

function syncMemoryCardHeights(scope = document) {
  const entries = scope instanceof Element && scope.classList.contains('memory-entry')
    ? [scope]
    : Array.from(scope.querySelectorAll?.('.memory-entry') || []);

  entries.forEach((entry) => {
    const details = entry.querySelector('.memory-details');
    if (details) {
      const previousMaxHeight = details.style.maxHeight;
      details.style.maxHeight = 'none';
      entry.style.setProperty('--memory-details-height', `${details.scrollHeight}px`);
      details.style.maxHeight = previousMaxHeight;
    }
  });
}

function nowString() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uniqueStrings(list = [], limit = 8) {
  return Array.from(new Set(
    list
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )).slice(0, limit);
}

function summarizeTopTerms(list = [], limit = 3) {
  const counts = new Map();
  uniqueStrings(list, 100).forEach((item) => {
    counts.set(item, 0);
  });
  list
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .slice(0, limit)
    .map(([item]) => item);
}

function normalizeMeaningfulTags(list = [], limit = 6) {
  const blocked = new Set(['平静', '不好', '还好', '说话', '聊天', '今天', '赵姐说话']);
  return uniqueStrings(list, limit)
    .filter((item) => item.length >= 2 && !blocked.has(item));
}

function uniquePeople(list = [], limit = 8) {
  const deduped = new Map();
  list.forEach((item) => {
    const name = String(item?.name || '').trim();
    if (!name || deduped.has(name)) return;
    deduped.set(name, {
      name,
      relation: String(item?.relation || '').trim(),
      role: String(item?.role || '').trim()
    });
  });
  return Array.from(deduped.values()).slice(0, limit);
}

function isThinMemoryText(text) {
  const value = String(text || '').trim();
  if (!value) return true;
  const sentenceCount = (value.match(/[。！？!?；;]/g) || []).length;
  const clauseCount = value.split(/[，,]/).filter((item) => item.trim()).length;
  return value.length < 26 && sentenceCount < 1 && clauseCount < 2;
}

function hashString(value, mod = LOCAL_EMBEDDING_DIM) {
  let hash = 2166136261;
  const input = String(value || '');
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % mod;
}

function getShingles(text) {
  const compact = String(text || '').replace(/\s+/g, '');
  const shingles = [];
  for (let i = 0; i < compact.length - 1; i += 1) {
    shingles.push(compact.slice(i, i + 2));
  }
  return shingles;
}

function buildLocalEmbedding(text, dim = LOCAL_EMBEDDING_DIM) {
  const vector = new Array(dim).fill(0);
  const tokens = [
    ...tokenize(text),
    ...getShingles(text)
  ].filter(Boolean);

  tokens.forEach((token) => {
    const index = hashString(token, dim);
    vector[index] += token.length > 1 ? 1.4 : 0.7;
  });

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

function cosineSimilarity(vectorA = [], vectorB = []) {
  if (!vectorA.length || !vectorB.length || vectorA.length !== vectorB.length) return 0;
  let sum = 0;
  for (let i = 0; i < vectorA.length; i += 1) {
    sum += (vectorA[i] || 0) * (vectorB[i] || 0);
  }
  return sum;
}

function normalizeProfile(profile = {}) {
  const rawStyle = profile.userStyle || {};
  return {
    ...DEFAULT_PROFILE,
    ...profile,
    speakingStyle: String(profile.speakingStyle || '').trim(),
    worldview: String(profile.worldview || '').trim(),
    userStyle: {
      talkingPace: String(rawStyle.talkingPace || '').trim(),
      reactsWellTo: uniqueStrings(Array.isArray(rawStyle.reactsWellTo) ? rawStyle.reactsWellTo : String(rawStyle.reactsWellTo || '').split(/[、，,\n]+/), 6),
      reactsPoorlyTo: uniqueStrings(Array.isArray(rawStyle.reactsPoorlyTo) ? rawStyle.reactsPoorlyTo : String(rawStyle.reactsPoorlyTo || '').split(/[、，,\n]+/), 6),
      anchorTopics: uniqueStrings(Array.isArray(rawStyle.anchorTopics) ? rawStyle.anchorTopics : String(rawStyle.anchorTopics || '').split(/[、，,\n]+/), 6),
      humorStyle: String(rawStyle.humorStyle || '').trim()
    },
    likes: uniqueStrings(Array.isArray(profile.likes) ? profile.likes : String(profile.likes || '').split(/[、，,\n]+/), 8),
    habits: uniqueStrings(Array.isArray(profile.habits) ? profile.habits : String(profile.habits || '').split(/[、，,\n]+/), 8),
    goals: uniqueStrings(Array.isArray(profile.goals) ? profile.goals : String(profile.goals || '').split(/[、，,\n]+/), 8),
    dislikes: uniqueStrings(Array.isArray(profile.dislikes) ? profile.dislikes : String(profile.dislikes || '').split(/[、，,\n]+/), 8),
    importantPeople: uniqueStrings(Array.isArray(profile.importantPeople) ? profile.importantPeople : String(profile.importantPeople || '').split(/[、，,\n]+/), 8),
    keyMemories: uniqueStrings(Array.isArray(profile.keyMemories) ? profile.keyMemories : String(profile.keyMemories || '').split(/[、，,\n]+/), 8)
  };
}

function normalizePeople(list = []) {
  const blocked = new Set(['大家', '有人', '别人', '一个人', '那个人', '这个人', '医生', '老师', '同学', '朋友', '家人', '孩子们']);
  const suffixPattern = /(姐|姨|叔|伯|哥|嫂|婶|老师|主任|医生|奶奶|爷爷|外婆|外公|爱人|老伴|同学|师傅)$/;
  const leadingNoise = /^[想起去来看找跟和与把被给叫问聊说听喜欢总老又会常]/;
  const getCanonicalPersonId = (name) => String(name || '').trim().replace(/\s+/g, '').toLowerCase();
  const canonicalizePersonName = (name) => {
    let value = String(name || '').trim().replace(/^(和|跟|与)/, '');
    while (value.length >= 3 && leadingNoise.test(value) && suffixPattern.test(value.slice(1))) {
      value = value.slice(1);
    }
    return value;
  };
  if (!Array.isArray(list)) return [];
  return uniquePeople(list
    .map((item) => ({
      name: canonicalizePersonName(item?.name || ''),
      personId: getCanonicalPersonId(canonicalizePersonName(item?.name || '')),
      relation: String(item?.relation || '').trim(),
      role: String(item?.role || '').trim()
    }))
    .filter((item) => item.name && !blocked.has(item.name) && item.name.length <= 8)
  , 8);
}

function guessPeopleFromText(text) {
  const source = String(text || '');
  const patterns = [
    /(?:老|小|阿)?[\u4e00-\u9fa5]{1,2}(?:姐|姨|叔|伯|哥|嫂|婶|老师|主任|医生)/g,
    /[\u4e00-\u9fa5]{1,3}(?:奶奶|爷爷|外婆|外公|爱人|老伴)/g,
    /[\u4e00-\u9fa5]{1,2}(?:同学|师傅)/g
  ];
  const matches = patterns.flatMap((pattern) => source.match(pattern) || []);
  return normalizePeople(matches.map((name) => ({ name })));
}

function normalizeCandidateType(type = '') {
  return ['daily_fragment', 'person_clue', 'event_memory', 'timeline_memory', 'emotion_note', 'none'].includes(type)
    ? type
    : 'none';
}

function normalizeTimeType(type = '') {
  return ['exact', 'relative', 'missing', 'present', 'none'].includes(type)
    ? type
    : 'none';
}

function guessTimeRefs(text) {
  const matches = String(text || '').match(/今天|今儿|刚才|刚刚|刚开始|这会儿|\d{4}年(?:\d{1,2}月(?:\d{1,2}[日号]?)?)?|\d{1,2}月\d{1,2}[日号]?|\d+岁(?:那年|的时候)?|上小学|上初中|上高中|大学时候|工作后|结婚后|退休后/g) || [];
  return uniqueStrings(matches, 6);
}

function normalizeMemoryCandidate(candidate = {}) {
  const people = normalizePeople((candidate.people || []).map((name) => ({ name })), 6).map((item) => item.name);
  const sourceTurns = Array.isArray(candidate.sourceTurnIds) ? candidate.sourceTurnIds.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8) : [];
  const summary = String(candidate.summary || '').trim();
  const narrative = String(candidate.narrative || '').trim();
  const filteredText = String(candidate.filteredText || '').trim();
  const followUpHint = String(candidate.followUpHint || '').trim();
  const missingPieces = uniqueStrings(candidate.missingPieces || [], 4);
  const reason = String(candidate.reason || '').trim();
  const confidence = Math.max(0, Math.min(1, Number(candidate.confidence || 0) || 0));

  return {
    id: String(candidate.id || uid('candidate')).trim(),
    createdAt: String(candidate.createdAt || nowString()).trim(),
    updatedAt: String(candidate.updatedAt || candidate.createdAt || nowString()).trim(),
    sourceTurnIds: sourceTurns,
    filteredText,
    summary,
    narrative,
    people,
    memorySignal: Boolean(candidate.memorySignal),
    candidateType: normalizeCandidateType(candidate.candidateType),
    timeType: normalizeTimeType(candidate.timeType),
    isComplete: Boolean(candidate.isComplete),
    confidence,
    missingPieces,
    followUpHint,
    reason,
    dismissed: Boolean(candidate.dismissed)
  };
}

function extractTimelineDate(text) {
  const value = String(text || '');
  const full = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})[日号]?/);
  if (full) {
    return `${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}`;
  }
  const ym = value.match(/(\d{4})年(\d{1,2})月/);
  if (ym) {
    return `${ym[1]}-${ym[2].padStart(2, '0')}`;
  }
  const year = value.match(/(\d{4})年/);
  if (year) {
    return year[1];
  }
  return '';
}

function buildFallbackStructure(text, title = '', mood = '', tags = []) {
  const resolvedMood = mood || detectEmotion(text);
  const normalizedTags = normalizeMeaningfulTags(tags, 5);
  const timeRefs = guessTimeRefs(text);
  const timelineDate = extractTimelineDate(text);
  const guessedPeople = guessPeopleFromText(text);
  const hasPresentTime = timeRefs.some((item) => /今天|今儿|刚才|刚刚|刚开始|这会儿/.test(item));
  const followUpQuestion = timelineDate
    ? ''
    : hasPresentTime
      ? '我先把这一点记成今天的小片段。你愿意的话，可以再多说一点当时你们在聊什么，或者后来怎么样了。'
    : isThinMemoryText(text)
      ? '这一句我先记成一个待展开的小片段。你愿意的话，再多告诉我一点当时发生了什么，以及那大概是你多少岁、哪几年，或者人生的哪个阶段？'
      : '我先把这一点记成一段待补时间的回忆。你再告诉我一下，这大概是你多少岁、哪几年，或者人生的哪个阶段？';
  return {
    title: title || makeMemoryTitle(text),
    summary: isThinMemoryText(text)
      ? `你刚提到${compactText(text, 26)}，这更像一个还可以继续展开的小片段。`
      : compactText(text, 52),
    mood: resolvedMood,
    people: guessedPeople,
    timeRefs,
    timelineDate,
    timelineLabel: timeRefs[0] || '',
    timeAccuracy: timelineDate ? 'approx' : 'unknown',
    followUpQuestion,
    locations: [],
    actions: [],
    tags: normalizedTags,
    retrievalText: [title, text, normalizedTags.join(' ')].filter(Boolean).join(' '),
    embedding: null
  };
}

function getMemoryFollowUpCopy(memory) {
  if (!memory.followUpQuestion || memory.timelineDate) return '';
  const people = (memory.people || []).map((item) => item.name).slice(0, 2).join('、');
  const actions = (memory.actions || []).slice(0, 2).join('、');
  const summary = memory.summary || compactText(memory.content, 36);
  const subject = people || '这段回忆';
  const actionPart = actions ? `，重点是${actions}` : '';
  return `我先记下：你提到的是${subject}${actionPart}。${summary ? `目前整理成“${summary}”。` : ''}${memory.followUpQuestion}`;
}

function buildConversationRecap(text, retrieval) {
  const features = retrieval.queryFeatures || buildQueryFeatures(text);
  const people = features.explicitPeople.slice(0, 2);
  const memory = retrieval.memories[0];
  const action = memory?.actions?.[0] || '';
  const recapParts = [];

  if (people.length) {
    recapParts.push(`我又更清楚了你和${people.join('、')}之间的一点相处片段`);
  } else if (memory?.summary) {
    recapParts.push(`我先记下了你刚提到的这一点`);
  }

  if (memory?.timelineDate || memory?.timelineLabel) {
    recapParts.push(`也多了一个时间线索`);
  } else if (memory?.followUpQuestion) {
    recapParts.push(`还差一个时间点等你慢慢补上`);
  }

  const summary = recapParts.length
    ? `${recapParts.join('，')}。`
    : '这一轮我先把你刚说的内容记成一个待继续展开的小片段。';

  const relation = people.length && action
    ? `这次我先知道了你和${people[0]}会一起${action}。`
    : people.length
      ? `这次我先知道了${people[0]}对你来说是个会反复出现的人。`
      : memory?.summary
        ? `这次我先知道了：${memory.summary}`
        : '这次我先记下了一个还可以继续补充的小片段。';

  return {
    status: summary,
    quote: relation
  };
}

function buildLocalReplyPlan(text, retrieval) {
  const mode = retrieval.understanding?.responseMode || 'chatting';
  const questions = retrieval.pendingTimeQuestions || [];
  const rhythm = buildRhythmState(text, retrieval);
  const features = retrieval.queryFeatures || buildQueryFeatures(text);
  const strongMemorySignal = shouldTreatAsMemorySignal(text, features);
  const planMap = {
    small_talk: {
      selfJudgment: '这轮更适合自然接话，不适合追问。',
      replyGoal: '先像平常聊天一样接住这句话。',
      shouldAsk: false
    },
    emotional_support: {
      selfJudgment: '这轮更适合先情感支持，不适合推进信息。',
      replyGoal: '先接住情绪，让她感觉被陪着。',
      shouldAsk: false
    },
    relationship_signal: {
      selfJudgment: '这轮更像人物线索，还不是完整回忆。',
      replyGoal: '先顺着这个人聊一句，不急着整理成记忆。',
      shouldAsk: false
    },
    memory_narrative: {
      selfJudgment: '这轮已经接近一段回忆，可以轻轻理顺。',
      replyGoal: '先理顺当前这段，再视情况补一个缺口。',
      shouldAsk: Boolean(questions[0])
    },
    memory_capture: {
      selfJudgment: '这轮已经进入整理语境，可以帮助收束。',
      replyGoal: '先把内容收成一个点，再决定是否补问。',
      shouldAsk: Boolean(questions[0])
    },
    chatting: {
      selfJudgment: '这轮更适合顺着聊，不需要硬分析。',
      replyGoal: '先自然接话，给一点判断或陪伴。',
      shouldAsk: false
    }
  };
  return {
    responseMode: rhythm.shouldStaySupportive
      ? 'emotional_support'
      : rhythm.shouldLowerMemoryDrive && (mode === 'memory_narrative' || mode === 'memory_capture' || mode === 'relationship_signal')
        ? 'chatting'
        : mode,
    memorySignal: strongMemorySignal && !rhythm.currentThin && (mode === 'memory_narrative' || mode === 'memory_capture' || (mode === 'relationship_signal' && retrieval.queryFeatures?.explicitPeople?.length > 0)),
    reason: strongMemorySignal && !rhythm.currentThin && (mode === 'memory_narrative' || mode === 'memory_capture' || (mode === 'relationship_signal' && retrieval.queryFeatures?.explicitPeople?.length > 0))
      ? '这轮出现了可沉淀的记忆线索。'
      : '这轮更适合先聊天，不急着进入记忆整理。',
    suggestedQuestion: rhythm.shouldReduceAsking ? '' : (questions[0] || ''),
    ...planMap[
      rhythm.shouldStaySupportive
        ? 'emotional_support'
        : rhythm.shouldLowerMemoryDrive && (mode === 'memory_narrative' || mode === 'memory_capture' || mode === 'relationship_signal')
          ? 'chatting'
          : mode
    ]
  };
}

async function requestReplyPlan(text, retrieval) {
  const fallback = buildLocalReplyPlan(text, retrieval);
  const rhythm = buildRhythmState(text, retrieval);
  try {
    const response = await fetch('http://localhost:3001/api/reply-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        retrieval: {
          understanding: retrieval.understanding,
          queryFeatures: retrieval.queryFeatures,
          memories: (retrieval.memories || []).map((memory) => ({
            title: memory.title,
            summary: memory.summary,
            people: (memory.people || []).map((item) => item.name),
            actions: memory.actions,
            timelineLabel: memory.timelineLabel
          })),
          pendingTimeQuestions: retrieval.pendingTimeQuestions || [],
          recentStrategyTrail: getStrategyTrail().slice(0, 4),
          rhythm
        },
        history: getChatHistory().slice(-6).map((item) => ({
          role: item.role,
          content: item.content
        }))
      })
    });
    if (!response.ok) throw new Error('回复策略接口异常');
    const data = await response.json();
    return {
      responseMode: String(data.responseMode || fallback.responseMode).trim() || fallback.responseMode,
      selfJudgment: String(data.selfJudgment || fallback.selfJudgment).trim() || fallback.selfJudgment,
      replyGoal: String(data.replyGoal || fallback.replyGoal).trim() || fallback.replyGoal,
      memorySignal: typeof data.memorySignal === 'boolean' ? data.memorySignal : fallback.memorySignal,
      reason: String(data.reason || fallback.reason).trim() || fallback.reason,
      shouldAsk: typeof data.shouldAsk === 'boolean' ? data.shouldAsk : fallback.shouldAsk,
      suggestedQuestion: String(data.suggestedQuestion || fallback.suggestedQuestion).trim()
    };
  } catch (error) {
    console.error(error);
    return fallback;
  }
}

async function requestChatRecap(text, reply, retrieval) {
  const fallback = buildConversationRecap(text, retrieval);
  try {
    const response = await fetch('http://localhost:3001/api/chat-recap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        reply,
        retrieval: {
          explicitPeople: retrieval.queryFeatures?.explicitPeople || [],
          timeRefs: retrieval.queryFeatures?.timeRefs || [],
          memories: (retrieval.memories || []).map((memory) => ({
            title: memory.title,
            summary: memory.summary,
            people: (memory.people || []).map((item) => item.name),
            actions: memory.actions,
            timelineLabel: memory.timelineLabel
          })),
          profileSignals: retrieval.profileSignals || [],
          lifeSummaries: retrieval.lifeSummaries || []
        },
        history: getChatHistory().slice(-6).map((item) => ({
          role: item.role,
          content: item.content
        }))
      })
    });

    if (!response.ok) throw new Error('复盘接口异常');
    const data = await response.json();
    const recap = {
      status: String(data.userUnderstanding || fallback.status).trim() || fallback.status,
      quote: [data.personUnderstanding, data.missingInfo]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .join(' ')
        || String(data.suggestedMemory || fallback.quote).trim()
        || fallback.quote,
      suggestedMemory: String(data.suggestedMemory || '').trim(),
      personUnderstanding: String(data.personUnderstanding || '').trim(),
      missingInfo: String(data.missingInfo || '').trim(),
      selfJudgment: String(data.selfJudgment || '').trim()
    };
    return recap;
  } catch (error) {
    console.error(error);
    return {
      ...fallback,
      suggestedMemory: '',
      personUnderstanding: '',
      missingInfo: '',
      selfJudgment: ''
    };
  }
}

function buildLocalMemoryFilter(text, retrieval, replyPlan) {
  const value = String(text || '').trim();
  const recentUserTurn = [...getChatHistory()].reverse().find((item) => item.role === 'user');
  const features = retrieval?.queryFeatures || buildQueryFeatures(value);
  const people = features.explicitPeople || [];
  const timeRefs = features.timeRefs || [];
  const mode = replyPlan?.responseMode || retrieval?.understanding?.responseMode || 'chatting';
  const noiseFiltered = [];
  let filteredText = value
    .replace(/(?:你傻啊|好蠢啊|我们不是刚开始聊天吗|闲聊，不需要这么紧绷)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (filteredText !== value) {
    noiseFiltered.push('已去掉元对话和抱怨性噪声');
  }

  const memorySignal = Boolean(replyPlan?.memorySignal) && shouldTreatAsMemorySignal(filteredText, features);
  const candidateType = !memorySignal
    ? 'none'
    : /想|想起|惦记|挂念|怀念/.test(filteredText)
      ? 'emotion_note'
    : timeRefs.some((item) => /今天|今儿|刚才|刚刚|刚开始|这会儿/.test(item))
      ? 'daily_fragment'
      : people.length && !timeRefs.length
        ? 'person_clue'
      : timeRefs.length
          ? 'timeline_memory'
          : 'event_memory';
  const summary = !memorySignal
    ? ''
    : /想|想起|惦记|挂念|怀念/.test(filteredText) && people.length
      ? `今天有一点关于${people[0]}的想念。`
      : timeRefs.some((item) => /今天|今儿/.test(item)) && people.length && /想|想起|惦记|挂念|怀念/.test(filteredText)
        ? `今天想起了${people[0]}。`
        : compactText(filteredText, 52);
  const narrative = !memorySignal
    ? ''
    : /想|想起|惦记|挂念|怀念/.test(filteredText) && people.length
      ? `先记下这一点：今天的心情里，有一部分是在想着${people[0]}。这更像一条当下的心绪记录，不一定非要展开成完整往事。`
      : `先把这段内容放进待整理里：${compactText(filteredText, 70)}。如果后面你继续讲，它再慢慢长成更完整的一页。`;

  return normalizeMemoryCandidate({
    filteredText: memorySignal ? filteredText : '',
    memorySignal,
    candidateType,
    confidence: memorySignal ? (people.length || timeRefs.length ? 0.72 : 0.58) : 0.08,
    people,
    timeType: !memorySignal ? 'none' : timeRefs.length ? (/今天|今儿|刚才|刚刚|刚开始|这会儿/.test(timeRefs.join(' ')) ? 'present' : 'relative') : 'missing',
    isComplete: memorySignal && !isThinMemoryText(filteredText) && (people.length > 0 || timeRefs.length > 0),
    summary,
    narrative,
    missingPieces: !memorySignal ? [] : [
      ...(people.length ? [] : ['人物']),
      ...(candidateType === 'event_memory' && !timeRefs.length ? ['时间'] : []),
      ...(candidateType === 'event_memory' && filteredText.length < 18 ? ['事件经过'] : [])
    ].slice(0, 3),
    followUpHint: !memorySignal || mode === 'small_talk' || mode === 'chatting'
      ? ''
      : candidateType === 'emotion_note'
        ? ''
      : timeRefs.length
        ? ''
        : '后面如果她继续往下说，再顺手补一个时间锚点。',
    noiseFiltered,
    reason: memorySignal ? (replyPlan?.reason || '这轮有可保留的记忆线索。') : (replyPlan?.reason || '这轮还不适合进入记忆整理。'),
    sourceTurnIds: [recentUserTurn?.createdAt || nowString()]
  });
}

async function requestMemoryFilter(text, retrieval, replyPlan) {
  const fallback = buildLocalMemoryFilter(text, retrieval, replyPlan);
  const recentUserTurn = [...getChatHistory()].reverse().find((item) => item.role === 'user');
  try {
    const response = await fetch('http://localhost:3001/api/memory-filter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        retrieval: {
          queryFeatures: retrieval.queryFeatures,
          understanding: retrieval.understanding,
          memories: (retrieval.memories || []).map((memory) => ({
            title: memory.title,
            summary: memory.summary,
            people: (memory.people || []).map((item) => item.name),
            actions: memory.actions,
            timelineLabel: memory.timelineLabel
          }))
        },
        replyPlan,
        history: getChatHistory().slice(-8).map((item) => ({
          role: item.role,
          content: item.content,
          createdAt: item.createdAt
        }))
      })
    });
    if (!response.ok) throw new Error('记忆过滤接口异常');
    const data = await response.json();
    return normalizeMemoryCandidate({
      ...fallback,
      ...data,
      sourceTurnIds: [recentUserTurn?.createdAt || nowString()],
      updatedAt: nowString()
    });
  } catch (error) {
    console.error(error);
    return fallback;
  }
}

function normalizeMemory(memory) {
  const fallback = buildFallbackStructure(memory.content || '', memory.title || '', memory.mood || '', memory.tags || []);
  const people = normalizePeople([...(memory.people || []), ...guessPeopleFromText(memory.content || '')]);
  const timeRefs = uniqueStrings(memory.timeRefs?.length ? memory.timeRefs : fallback.timeRefs, 8);
  const timelineDate = String(memory.timelineDate || fallback.timelineDate || '').trim();
  const timelineLabel = String(memory.timelineLabel || (timelineDate ? timelineDate : timeRefs[0] || '')).trim();
  const timeAccuracy = String(memory.timeAccuracy || fallback.timeAccuracy || (timelineDate ? 'approx' : 'unknown')).trim();
  const followUpQuestion = String(memory.followUpQuestion || fallback.followUpQuestion || '').trim();
  const locations = uniqueStrings(memory.locations, 8);
  const actions = uniqueStrings(memory.actions, 8);
  const tags = uniqueStrings(memory.tags?.length ? memory.tags : fallback.tags, 10);
  const summary = String(memory.summary || fallback.summary || '').trim();
  const mood = String(memory.mood || fallback.mood || '平静').trim();
  const title = String(memory.title || fallback.title || makeMemoryTitle(memory.content || '')).trim();
  const retrievalText = String(
    memory.retrievalText ||
    [
      title,
      summary,
      memory.content || '',
      people.map((item) => item.name).join(' '),
      timelineDate,
      timelineLabel,
      timeRefs.join(' '),
      locations.join(' '),
      actions.join(' '),
      tags.join(' ')
    ].join(' ')
  ).trim();

  return {
    id: memory.id || uid('memory'),
    title,
    content: String(memory.content || '').trim(),
    mood,
    tags,
    createdAt: String(memory.createdAt || nowString()),
    source: String(memory.source || '手动记录'),
    people,
    timeRefs,
    timelineDate,
    timelineLabel,
    timeAccuracy,
    followUpQuestion,
    locations,
    actions,
    summary,
    retrievalText,
    embedding: Array.isArray(memory.embedding) && memory.embedding.length === LOCAL_EMBEDDING_DIM
      ? memory.embedding
      : buildLocalEmbedding(retrievalText)
  };
}

function ensureSeedData() {
  const existingMemories = readStorage(STORAGE_KEYS.memories, null);
  if (!existingMemories?.length) {
    writeStorage(STORAGE_KEYS.memories, []);
  } else {
    writeStorage(
      STORAGE_KEYS.memories,
      existingMemories
        .filter((memory) => !String(memory?.id || '').startsWith('seed-'))
        .map(normalizeMemory)
    );
  }
  if (!readStorage(STORAGE_KEYS.profile, null)) {
    writeStorage(STORAGE_KEYS.profile, DEFAULT_PROFILE);
  }
  if (!readStorage(STORAGE_KEYS.settings, null)) {
    writeStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  }
  if (!readStorage(STORAGE_KEYS.lifeSummaries, null)) {
    writeStorage(STORAGE_KEYS.lifeSummaries, []);
  }
  refreshLifeSummaries();
}

function getProfile() {
  return normalizeProfile(readStorage(STORAGE_KEYS.profile, DEFAULT_PROFILE));
}

function getSettings() {
  return readStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
}

function getMemories() {
  return readStorage(STORAGE_KEYS.memories, []).map(normalizeMemory);
}

function setMemories(memories) {
  writeStorage(STORAGE_KEYS.memories, memories.map(normalizeMemory));
  refreshLifeSummaries();
  personSummaryCache.clear();
  if (activePersonName && !getMemories().some((memory) => (memory.people || []).some((item) => item.name === activePersonName))) {
    activePersonName = null;
  }
}

function getChatHistory() {
  return readStorage(STORAGE_KEYS.chat, []);
}

function getUserChatHistory(limit = 8) {
  return getChatHistory()
    .filter((item) => item.role === 'user' && String(item.content || '').trim())
    .slice(-limit);
}

function setChatHistory(history) {
  writeStorage(STORAGE_KEYS.chat, history);
}

function setProfile(profile) {
  writeStorage(STORAGE_KEYS.profile, normalizeProfile(profile));
  refreshLifeSummaries();
}

function setSettings(settings) {
  writeStorage(STORAGE_KEYS.settings, settings);
}

function getLastChatRecap() {
  return readStorage(STORAGE_KEYS.lastChatRecap, {
    suggestedMemory: '',
    status: '',
    quote: '',
    personUnderstanding: '',
    missingInfo: '',
    selfJudgment: ''
  });
}

function setLastChatRecap(recap) {
  writeStorage(STORAGE_KEYS.lastChatRecap, {
    suggestedMemory: String(recap?.suggestedMemory || '').trim(),
    status: String(recap?.status || '').trim(),
    quote: String(recap?.quote || '').trim(),
    personUnderstanding: String(recap?.personUnderstanding || '').trim(),
    missingInfo: String(recap?.missingInfo || '').trim(),
    selfJudgment: String(recap?.selfJudgment || '').trim()
  });
}

function getMemoryCues() {
  return readStorage(STORAGE_KEYS.memoryCues, []);
}

function setMemoryCues(cues) {
  writeStorage(STORAGE_KEYS.memoryCues, cues);
}

function normalizeLifeSummary(summary = {}) {
  return {
    id: String(summary.id || uid('summary')).trim(),
    type: String(summary.type || '').trim(),
    label: String(summary.label || '').trim(),
    summary: String(summary.summary || '').trim(),
    evidenceCount: Math.max(0, Number(summary.evidenceCount || 0) || 0),
    people: uniqueStrings(summary.people || [], 6),
    tags: uniqueStrings(summary.tags || [], 6),
    updatedAt: String(summary.updatedAt || nowString()).trim()
  };
}

function getLifeSummaries() {
  return readStorage(STORAGE_KEYS.lifeSummaries, []).map(normalizeLifeSummary);
}

function setLifeSummaries(items) {
  writeStorage(STORAGE_KEYS.lifeSummaries, items.map(normalizeLifeSummary));
}

function buildLifeSummaries(memories = getMemories(), candidates = getMemoryCandidates()) {
  const summaries = [];
  const personMap = new Map();
  memories.forEach((memory) => {
    (memory.people || []).forEach((person) => {
      const key = person.personId || person.name;
      if (!key) return;
      if (!personMap.has(key)) {
        personMap.set(key, { label: person.name, count: 0, moods: [], actions: [], times: [] });
      }
      const bucket = personMap.get(key);
      bucket.count += 1;
      if (memory.mood) bucket.moods.push(memory.mood);
      if (memory.timelineLabel) bucket.times.push(memory.timelineLabel);
      (memory.actions || []).forEach((action) => bucket.actions.push(action));
    });
  });

  candidates
    .filter((item) => !item.dismissed && item.memorySignal)
    .forEach((candidate) => {
      if (!candidate.people?.[0]) return;
      const key = candidate.people[0];
      if (!personMap.has(key)) {
        personMap.set(key, { label: candidate.people[0], count: 0, moods: [], actions: [], times: [] });
      }
      const bucket = personMap.get(key);
      bucket.count += 0.6;
      if (candidate.candidateType === 'emotion_note') bucket.moods.push('牵挂');
      if (candidate.timeType === 'present') bucket.times.push('最近');
    });

  personMap.forEach((bucket, key) => {
    if (bucket.count < 2) return;
    const topMood = summarizeTopTerms(bucket.moods, 1)[0] || '';
    const topAction = summarizeTopTerms(bucket.actions, 2);
    const topTime = summarizeTopTerms(bucket.times, 1)[0] || '';
    const text = topMood === '牵挂'
      ? `${bucket.label}已经不只是偶尔被提到的人，这条线里反复出现的是想念和牵挂。`
      : `${bucket.label}是用户生活里反复出现的人物，这条线已经开始沉淀出较稳定的相处痕迹。`;
    summaries.push(normalizeLifeSummary({
      id: `person:${key}`,
      type: 'person_line',
      label: bucket.label,
      summary: topAction.length
        ? `${text}${topAction.join('、')}这些片段出现得比较多。`
        : text,
      evidenceCount: bucket.count,
      people: [bucket.label],
      tags: uniqueStrings([topMood, topTime, ...topAction].filter(Boolean), 6),
      updatedAt: nowString()
    }));
  });

  const timeBuckets = new Map();
  memories.forEach((memory) => {
    const label = String(memory.timelineLabel || '').trim();
    if (!label || label === '待补时间') return;
    if (!timeBuckets.has(label)) timeBuckets.set(label, { count: 0, moods: [], people: [] });
    const bucket = timeBuckets.get(label);
    bucket.count += 1;
    if (memory.mood) bucket.moods.push(memory.mood);
    (memory.people || []).forEach((person) => bucket.people.push(person.name));
  });

  candidates
    .filter((item) => !item.dismissed && item.memorySignal && item.timeType === 'relative')
    .forEach((candidate) => {
      const label = '待补人生阶段';
      if (!timeBuckets.has(label)) timeBuckets.set(label, { count: 0, moods: [], people: [] });
      const bucket = timeBuckets.get(label);
      bucket.count += 0.6;
      candidate.people.forEach((name) => bucket.people.push(name));
    });

  timeBuckets.forEach((bucket, label) => {
    if (bucket.count < 2) return;
    const mood = summarizeTopTerms(bucket.moods, 1)[0] || '';
    const people = summarizeTopTerms(bucket.people, 2);
    summaries.push(normalizeLifeSummary({
      id: `time:${label}`,
      type: 'timeline_line',
      label,
      summary: people.length
        ? `${label}这一段时间已经开始成形，和${people.join('、')}有关的内容会反复落到这里。`
        : `${label}这一段时间已经开始成形，后面可以继续往这条人生阶段线上补。`,
      evidenceCount: bucket.count,
      people,
      tags: uniqueStrings([mood, label].filter(Boolean), 6),
      updatedAt: nowString()
    }));
  });

  const emotionBuckets = new Map();
  memories.forEach((memory) => {
    if (!memory.mood) return;
    if (!emotionBuckets.has(memory.mood)) emotionBuckets.set(memory.mood, { count: 0, people: [] });
    const bucket = emotionBuckets.get(memory.mood);
    bucket.count += 1;
    (memory.people || []).forEach((person) => bucket.people.push(person.name));
  });
  candidates
    .filter((item) => !item.dismissed && item.memorySignal && item.candidateType === 'emotion_note')
    .forEach((candidate) => {
      const key = candidate.people?.[0] ? '牵挂' : '情绪片段';
      if (!emotionBuckets.has(key)) emotionBuckets.set(key, { count: 0, people: [] });
      const bucket = emotionBuckets.get(key);
      bucket.count += 0.7;
      candidate.people.forEach((name) => bucket.people.push(name));
    });

  emotionBuckets.forEach((bucket, label) => {
    if (bucket.count < 2) return;
    const people = summarizeTopTerms(bucket.people, 2);
    summaries.push(normalizeLifeSummary({
      id: `emotion:${label}`,
      type: 'emotion_line',
      label,
      summary: people.length
        ? `${label}这一类心绪最近和${people.join('、')}这条线连得更紧。`
        : `${label}这一类心绪最近开始重复出现，可以当成一条长期心情线来理解。`,
      evidenceCount: bucket.count,
      people,
      tags: uniqueStrings([label, ...people].filter(Boolean), 6),
      updatedAt: nowString()
    }));
  });

  return summaries
    .sort((a, b) => b.evidenceCount - a.evidenceCount || a.label.localeCompare(b.label, 'zh-Hans-CN'))
    .slice(0, 12);
}

function refreshLifeSummaries() {
  const localSummaries = buildLifeSummaries();
  setLifeSummaries(localSummaries);
  scheduleLifeSummaryCompose(localSummaries);
}

async function requestLifeSummaryCompose(localSummaries = buildLifeSummaries()) {
  try {
    const response = await fetch('http://localhost:3001/api/life-summary-compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localSummaries,
        memories: getMemories().slice(0, 18).map((memory) => ({
          id: memory.id,
          title: memory.title,
          summary: memory.summary,
          mood: memory.mood,
          people: (memory.people || []).map((item) => item.name),
          timelineLabel: memory.timelineLabel,
          actions: memory.actions,
          tags: memory.tags
        })),
        candidates: getMemoryCandidates()
          .filter((item) => !item.dismissed && item.memorySignal)
          .slice(0, 12)
          .map((item) => ({
            id: item.id,
            candidateType: item.candidateType,
            summary: item.summary,
            narrative: item.narrative,
            people: item.people,
            timeType: item.timeType,
            missingPieces: item.missingPieces
          }))
      })
    });
    if (!response.ok) throw new Error('人生线摘要接口异常');
    const data = await response.json();
    const summaries = Array.isArray(data.summaries) ? data.summaries.map(normalizeLifeSummary).filter((item) => item.type && item.label && item.summary) : [];
    if (summaries.length) {
      setLifeSummaries(summaries);
    }
  } catch (error) {
    console.error(error);
  }
}

function scheduleLifeSummaryCompose(localSummaries = buildLifeSummaries()) {
  if (lifeSummaryComposeTimer) {
    clearTimeout(lifeSummaryComposeTimer);
  }
  if (!localSummaries.length) return;
  lifeSummaryComposeTimer = window.setTimeout(async () => {
    if (lifeSummaryComposeInFlight) return;
    lifeSummaryComposeInFlight = true;
    try {
      await requestLifeSummaryCompose(localSummaries);
    } finally {
      lifeSummaryComposeInFlight = false;
    }
  }, 280);
}

function pushMemoryCue(recap) {
  const next = [
    {
      id: uid('cue'),
      createdAt: nowString(),
      suggestedMemory: String(recap?.suggestedMemory || '').trim(),
      status: String(recap?.status || '').trim(),
      personUnderstanding: String(recap?.personUnderstanding || '').trim(),
      missingInfo: String(recap?.missingInfo || '').trim(),
      selfJudgment: String(recap?.selfJudgment || '').trim()
    },
    ...getMemoryCues()
  ].filter((item) => item.suggestedMemory || item.status || item.personUnderstanding || item.missingInfo);
  setMemoryCues(next.slice(0, 12));
}

function getMemoryCandidates() {
  return readStorage(STORAGE_KEYS.memoryCandidates, []).map(normalizeMemoryCandidate);
}

function setMemoryCandidates(candidates) {
  writeStorage(STORAGE_KEYS.memoryCandidates, candidates.map(normalizeMemoryCandidate));
  refreshLifeSummaries();
}

function removeMemoryCandidate(candidateId) {
  setMemoryCandidates(getMemoryCandidates().filter((item) => item.id !== candidateId));
}

function dismissMemoryCandidate(candidateId) {
  setMemoryCandidates(getMemoryCandidates().map((item) => (
    item.id === candidateId
      ? normalizeMemoryCandidate({ ...item, dismissed: true, updatedAt: nowString() })
      : item
  )));
}

function getCandidateLineKey(candidate) {
  if (candidate.people?.[0]) return `person:${candidate.people[0]}`;
  if (candidate.timeType && candidate.timeType !== 'none') return `time:${candidate.timeType}`;
  return `misc:${candidate.candidateType || 'none'}`;
}

function getCandidateLinePeers(candidate, pool = getMemoryCandidates()) {
  const lineKey = getCandidateLineKey(candidate);
  return pool.filter((item) => !item.dismissed && item.memorySignal && getCandidateLineKey(item) === lineKey);
}

function buildConsolidatedCandidateCopy(candidate, peers = [], recap = {}) {
  const person = candidate.people?.[0] || '';
  const activePeers = peers.filter((item) => !item.dismissed && item.memorySignal);
  const count = activePeers.length;
  const emotionCount = activePeers.filter((item) => item.candidateType === 'emotion_note').length;
  const eventCount = activePeers.filter((item) => item.candidateType === 'event_memory' || item.candidateType === 'daily_fragment').length;
  const timelineCount = activePeers.filter((item) => item.candidateType === 'timeline_memory').length;
  const personClueCount = activePeers.filter((item) => item.candidateType === 'person_clue').length;
  const latestSummary = activePeers[0]?.summary || candidate.summary || '';
  const personUnderstanding = String(recap?.personUnderstanding || '').trim();
  const suggestedMemory = String(recap?.suggestedMemory || '').trim();

  if (count < 2) {
    return {
      summary: candidate.summary,
      narrative: candidate.narrative,
      followUpHint: candidate.followUpHint
    };
  }

  if (person && emotionCount >= 2) {
    return {
      summary: `最近几次提到${person}，重点更像一条关于想念或牵挂的生活线索。`,
      narrative: personUnderstanding
        ? `这几轮里，${person}不是偶尔被提到一下，而是在反复出现。现在看起来，这条线更接近一种会不断被想起的心情，重点不一定是完整事件，而是你想到她时的那种感觉。`
        : `这几轮里，${person}反复出现。现在更像是一条关于想起她、惦记她的生活线索，先不急着硬整理成完整往事，后面再慢慢补细节也来得及。`,
      followUpHint: ''
    };
  }

  if (person && (eventCount + timelineCount + personClueCount) >= 2) {
    return {
      summary: `最近几次都提到${person}，这条人物线已经开始慢慢聚起来了。`,
      narrative: suggestedMemory
        ? `这几轮关于${person}的内容已经不只是一个零散名字，而是在慢慢连成一条线。现在先能看出来，你和她之间有一些会反复被提起的片段，这条线后面可以继续长成更完整的人物篇。`
        : `这几轮关于${person}的内容开始往同一条人物线上聚。先收住现在能确认的部分：她不是偶然出现的人，而是在你的生活里有持续痕迹，后面可以再慢慢补时间和具体经过。`,
      followUpHint: candidate.timeType === 'none' ? '后面如果她继续说，再顺手补一个时间点，这条人物线会更稳。' : ''
    };
  }

  if (candidate.timeType === 'present' && count >= 2) {
    return {
      summary: '最近几轮里，今天发生的小片段开始连在一起了。',
      narrative: `这些内容都更像是最近这段日常里的小片段。单看每一条都不算大事，但放在一起，已经能看出一段正在发生的生活线，先按“最近这阵子”收着会更合适。`,
      followUpHint: ''
    };
  }

  if (candidate.timeType === 'relative' && count >= 2) {
    return {
      summary: '最近几条线索都落在同一段待补时间里，可以先按人生阶段收着。',
      narrative: `这几条内容虽然还没有精确日期，但它们已经开始指向同一段时间。现在先把它们收成一条待补的人生阶段线，后面慢慢补年份、年龄或当时的生活状态就行。`,
      followUpHint: '以后如果她自然提到“那几年”或“当时多大”，这条时间线就能接得更稳。'
    };
  }

  return {
    summary: latestSummary || candidate.summary,
    narrative: candidate.narrative,
    followUpHint: candidate.followUpHint
  };
}

function consolidateMemoryCandidate(candidate, existing = getMemoryCandidates(), recap = {}) {
  const normalized = normalizeMemoryCandidate(candidate);
  const peers = getCandidateLinePeers(normalized, [normalized, ...existing]);
  const consolidated = buildConsolidatedCandidateCopy(normalized, peers, recap);
  return normalizeMemoryCandidate({
    ...normalized,
    ...consolidated,
    missingPieces: uniqueStrings([
      ...(normalized.missingPieces || []),
      ...(peers.length >= 2 && normalized.timeType === 'none' && normalized.people?.[0] ? ['时间'] : [])
    ], 4)
  });
}

function upsertMemoryCandidate(candidate, recap = {}) {
  const existing = getMemoryCandidates();
  const normalized = consolidateMemoryCandidate(candidate, existing, recap);
  const match = existing.find((item) => {
    if (normalized.sourceTurnIds.length && item.sourceTurnIds.some((id) => normalized.sourceTurnIds.includes(id))) return true;
    if (
      normalized.people.length &&
      item.people.length &&
      normalized.people.some((name) => item.people.includes(name)) &&
      normalized.candidateType === item.candidateType
    ) return true;
    if (normalized.summary && item.summary === normalized.summary) return true;
    if (normalized.filteredText && item.filteredText === normalized.filteredText) return true;
    return false;
  });

  if (match) {
    const mergedBase = normalizeMemoryCandidate({
      ...match,
      ...normalized,
      id: match.id,
      createdAt: match.createdAt,
      updatedAt: nowString(),
      sourceTurnIds: uniqueStrings([...(match.sourceTurnIds || []), ...(normalized.sourceTurnIds || [])], 8),
      people: uniqueStrings([...(match.people || []), ...(normalized.people || [])], 6),
      missingPieces: uniqueStrings([...(match.missingPieces || []), ...(normalized.missingPieces || [])], 4),
      dismissed: false,
      confidence: Math.max(match.confidence || 0, normalized.confidence || 0)
    });
    const merged = consolidateMemoryCandidate(mergedBase, existing.filter((item) => item.id !== match.id), recap);
    setMemoryCandidates([merged, ...existing.filter((item) => item.id !== match.id)]);
    return merged;
  }

  const inserted = consolidateMemoryCandidate(normalized, existing, recap);
  setMemoryCandidates([inserted, ...existing].slice(0, 20));
  return inserted;
}

function getCandidateClusters(candidates = getMemoryCandidates()) {
  const active = candidates.filter((item) => !item.dismissed && item.memorySignal);
  const clusters = new Map();

  active.forEach((candidate) => {
    const key = candidate.people[0]
      ? `person:${candidate.people[0]}`
      : candidate.timeType !== 'none'
        ? `time:${candidate.timeType}`
        : `misc:${candidate.candidateType}`;
    if (!clusters.has(key)) {
      clusters.set(key, {
        id: key,
        label: candidate.people[0] || (
          candidate.timeType === 'present'
            ? '今天'
            : candidate.timeType === 'relative'
              ? '待补时间'
              : candidate.candidateType === 'event_memory'
                ? '事件片段'
                : '零散线索'
        ),
        type: candidate.people[0] ? 'person' : candidate.timeType !== 'none' ? 'time' : 'misc',
        candidates: []
      });
    }
    clusters.get(key).candidates.push(candidate);
  });

  return Array.from(clusters.values())
    .map((cluster) => ({
      ...cluster,
      candidates: cluster.candidates.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
      count: cluster.candidates.length,
      summary: cluster.candidates[0]?.summary || '',
      people: uniqueStrings(cluster.candidates.flatMap((item) => item.people), 8),
      missingPieces: uniqueStrings(cluster.candidates.flatMap((item) => item.missingPieces || []), 4)
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hans-CN'));
}

function getStrategyTrail() {
  return readStorage(STORAGE_KEYS.strategyTrail, []);
}

function setStrategyTrail(items) {
  writeStorage(STORAGE_KEYS.strategyTrail, items);
}

function pushStrategyTrail(entry) {
  const next = [
    {
      createdAt: nowString(),
      responseMode: String(entry?.responseMode || '').trim(),
      selfJudgment: String(entry?.selfJudgment || '').trim(),
      shouldAsk: Boolean(entry?.shouldAsk),
      emotion: String(entry?.emotion || '').trim(),
      userText: compactText(entry?.userText || '', 24),
      infoRich: Boolean(entry?.infoRich)
    },
    ...getStrategyTrail()
  ].filter((item) => item.responseMode);
  setStrategyTrail(next.slice(0, 8));
}

function summarizeStrategyTrail() {
  const trail = getStrategyTrail().slice(0, 3);
  if (!trail.length) return '最近几轮还没有稳定策略。';
  return trail
    .map((item, index) => `最近第${index + 1}轮：${item.responseMode}${item.shouldAsk ? '，当时有追问' : '，当时没有追问'}。`)
    .join('\n');
}

function buildRhythmState(text, retrieval) {
  const trail = getStrategyTrail().slice(0, 4);
  const currentThin = isThinMemoryText(text);
  const currentInfoRich = !currentThin && (
    (retrieval.queryFeatures?.explicitPeople?.length || 0) > 0 ||
    (retrieval.queryFeatures?.timeRefs?.length || 0) > 0 ||
    (retrieval.memories?.[0]?.actions?.length || 0) > 0
  );
  const recentAskCount = trail.slice(0, 2).filter((item) => item.shouldAsk).length;
  const recentSupportCount = trail.slice(0, 2).filter((item) => item.responseMode === 'emotional_support').length;
  const recentThinCount = trail.slice(0, 2).filter((item) => item.userText && item.userText.length <= 10).length;

  return {
    currentThin,
    currentInfoRich,
    recentAskCount,
    recentSupportCount,
    recentThinCount,
    shouldReduceAsking: recentAskCount >= 1 && currentThin,
    shouldStaySupportive: recentSupportCount >= 2,
    shouldLowerMemoryDrive: recentThinCount >= 2 && !currentInfoRich
  };
}

function shouldSurfaceMemoryCue(text, retrieval, recap) {
  const value = String(text || '').trim();
  if (!value) return false;

  const features = retrieval?.queryFeatures || buildQueryFeatures(value);
  const understanding = retrieval?.understanding || buildUnderstandingLayers(value, retrieval || { memories: [], profileSignals: [], queryFeatures: features });
  const explicitPeople = features.explicitPeople || [];
  const timeRefs = features.timeRefs || [];
  const memories = retrieval?.memories || [];
  const suggestedMemory = String(recap?.suggestedMemory || '').trim();
  const personUnderstanding = String(recap?.personUnderstanding || '').trim();
  const missingInfo = String(recap?.missingInfo || '').trim();

  if (/^(你好|您好|在吗|在嘛|哈喽|嗨|早上好|晚上好|中午好|晚安|拜拜|再见)[！!。.]?$/i.test(value)) {
    return false;
  }
  if (understanding.responseMode === 'small_talk' || understanding.responseMode === 'emotional_support' || understanding.responseMode === 'chatting') {
    return false;
  }

  let score = 0;
  if (!isThinMemoryText(value)) score += 2;
  if (value.length >= 20) score += 1;
  if (explicitPeople.length) score += 2;
  if (timeRefs.length) score += 2;
  if (memories[0]?.actions?.length) score += 2;
  if (memories[0]?.timelineLabel) score += 1;
  if (personUnderstanding) score += 2;
  if (missingInfo) score += 1;
  if (suggestedMemory && suggestedMemory.length >= 18) score += 2;

  const mode = features.intent;
  if (mode === 'organize' || mode === 'reminisce') score += 1;
  if (mode === 'listen' && isThinMemoryText(value) && !explicitPeople.length && !timeRefs.length) score -= 3;
  if (understanding.memory.canBeSavedNow) score += 2;
  if (understanding.responseMode === 'relationship_signal') score += 1;

  return score >= 4;
}

function mergeProfileInsights(current, incoming) {
  return normalizeProfile({
    ...current,
    speakingStyle: incoming.speakingStyle || current.speakingStyle,
    worldview: incoming.worldview || current.worldview,
    userStyle: {
      talkingPace: incoming.userStyle?.talkingPace || current.userStyle?.talkingPace,
      reactsWellTo: uniqueStrings([...(current.userStyle?.reactsWellTo || []), ...(incoming.userStyle?.reactsWellTo || [])], 6),
      reactsPoorlyTo: uniqueStrings([...(current.userStyle?.reactsPoorlyTo || []), ...(incoming.userStyle?.reactsPoorlyTo || [])], 6),
      anchorTopics: uniqueStrings([...(current.userStyle?.anchorTopics || []), ...(incoming.userStyle?.anchorTopics || [])], 6),
      humorStyle: incoming.userStyle?.humorStyle || current.userStyle?.humorStyle
    },
    likes: uniqueStrings([...(current.likes || []), ...(incoming.likes || [])], 8),
    habits: uniqueStrings([...(current.habits || []), ...(incoming.habits || [])], 8),
    goals: uniqueStrings([...(current.goals || []), ...(incoming.goals || [])], 8),
    dislikes: uniqueStrings([...(current.dislikes || []), ...(incoming.dislikes || [])], 8),
    importantPeople: uniqueStrings([...(current.importantPeople || []), ...(incoming.importantPeople || [])], 8),
    keyMemories: uniqueStrings([...(current.keyMemories || []), ...(incoming.keyMemories || [])], 8)
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function tokenize(text) {
  return String(text).toLowerCase().match(/[\u4e00-\u9fa5]{1,}|[a-z0-9]+/g) || [];
}

function detectEmotion(text) {
  let best = '平静';
  let bestScore = 0;
  Object.entries(EMOTION_HINTS).forEach(([emotion, words]) => {
    const score = words.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
    if (score > bestScore) {
      best = emotion;
      bestScore = score;
    }
  });
  return best;
}

function isGreetingLike(text) {
  return /^(你好|您好|在吗|在嘛|哈喽|嗨|早上好|晚上好|中午好|晚安|拜拜|再见)[！!。.]?$/i.test(String(text || '').trim());
}

function isShortBackchannel(text) {
  return /^(嗯|嗯嗯|哦|啊|欸|哎|好|好的|行|行吧|对|对啊|对呢|是啊|没事|还好|一般吧|算了|随便|哈哈|呵呵)[！!。.]?$/i.test(String(text || '').trim());
}

function isCorrectionLike(text) {
  return /^(不是|不是这个意思|你没听懂|你理解错了|我不是这个意思|不是这句|不是说这个|你又理解偏了)/.test(String(text || '').trim());
}

function isMetaConversation(text) {
  return /(你傻啊|好蠢啊|我们不是刚开始聊天吗|闲聊，不需要这么紧绷|别这么上价值|别分析我|别总结|别记录|别瞎猜|别脑补|别乱安慰)/.test(String(text || '').trim());
}

function isMildComplaint(text) {
  return /(无聊|烦死了|真烦|麻烦|累死了|有点烦|有点无语|服了|受不了|懒得说)/.test(String(text || '').trim())
    && !/(睡不着|害怕|崩溃|撑不住|不想活|想哭|特别难受|难受到不行)/.test(String(text || '').trim());
}

function needsEmotionalSupport(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (isMildComplaint(value) || isMetaConversation(value)) return false;
  return /(难过|伤心|想哭|委屈|崩溃|撑不住|害怕|很怕|睡不着|焦虑|不安|孤单|空落落|特别难受|心里堵|心里发慌)/.test(value);
}

function shouldTreatAsMemorySignal(text, features = {}) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (isGreetingLike(value) || isShortBackchannel(value) || isCorrectionLike(value) || isMetaConversation(value)) return false;
  if (value.length < 10 && !(features.explicitPeople || []).length && !(features.timeRefs || []).length) return false;
  if ((features.explicitPeople || []).length && value.length >= 8 && !isThinMemoryText(value)) return true;
  if ((features.timeRefs || []).length && value.length >= 8) return true;
  if (/(那天|后来|当时|结果|然后|一起|回去|以前|记得|想起|怀念|惦记|挂念)/.test(value) && value.length >= 12) return true;
  return false;
}

function inferIntent(text) {
  if (/(整理|写成|保存|篇章|生成|润色|记录)/.test(text)) return 'organize';
  if (/(以前|那年|小时候|年轻|记得|怀念|从前)/.test(text)) return 'reminisce';
  if (needsEmotionalSupport(text)) return 'comfort';
  return 'listen';
}

function getMemorySearchText(memory) {
  return [
    memory.title,
    memory.content,
    memory.summary,
    (memory.tags || []).join(' '),
    (memory.people || []).map((item) => `${item.name} ${item.relation} ${item.role}`).join(' '),
    (memory.timeRefs || []).join(' '),
    (memory.locations || []).join(' '),
    (memory.actions || []).join(' '),
    memory.retrievalText || ''
  ].join(' ').toLowerCase();
}

function buildQueryFeatures(queryText, profile = getProfile()) {
  const text = String(queryText || '').trim();
  const tokens = tokenize(text);
  const embedding = buildLocalEmbedding(text);
  const explicitPeople = uniqueStrings([
    ...guessPeopleFromText(text).map((item) => item.name),
    ...(profile.importantPeople || []).filter((name) => text.includes(name))
  ], 8);
  const timeRefs = guessTimeRefs(text);
  const intent = inferIntent(text);
  const emotion = detectEmotion(text);
  return { text, tokens, embedding, explicitPeople, timeRefs, intent, emotion };
}

function inferConversationMode(text, features) {
  const value = String(text || '').trim();
  if (!value) return 'small_talk';
  if (isGreetingLike(value) || isShortBackchannel(value)) return 'small_talk';
  if (isCorrectionLike(value) || isMetaConversation(value)) return 'chatting';
  if (features.intent === 'comfort') return 'emotional_support';
  if (features.intent === 'organize') return 'memory_capture';
  if (features.intent === 'reminisce' && !isThinMemoryText(value)) return 'memory_narrative';
  if (features.explicitPeople.length && (features.timeRefs.length || value.length >= 16) && !isThinMemoryText(value)) return 'relationship_signal';
  if (!isThinMemoryText(value) && /(?:那天|后来|当时|结果|然后|一起|回去|以前|记得)/.test(value)) return 'memory_narrative';
  if (features.explicitPeople.length && value.length >= 8) return 'relationship_signal';
  return 'chatting';
}

function buildUnderstandingLayers(text, retrieval) {
  const features = retrieval.queryFeatures || buildQueryFeatures(text);
  const firstMemory = retrieval.memories?.[0];
  const literal = {
    people: features.explicitPeople,
    timeRefs: features.timeRefs,
    actions: firstMemory?.actions || [],
    contentDensity: isThinMemoryText(text) ? 'thin' : 'rich'
  };
  const relation = {
    mentionedPeople: features.explicitPeople,
    repeatedPeople: (retrieval.memories || [])
      .flatMap((memory) => (memory.people || []).map((item) => item.name))
      .filter((name, index, arr) => arr.indexOf(name) !== index)
      .slice(0, 3)
  };
  const emotion = {
    type: features.emotion,
    needsSupport: needsEmotionalSupport(text)
  };
  const memory = {
    looksLikeMemory: inferConversationMode(text, features) === 'memory_narrative',
    canBeSavedNow: shouldTreatAsMemorySignal(text, features) && ((firstMemory?.actions || []).length > 0 || features.explicitPeople.length > 0 || features.timeRefs.length > 0),
    missingTime: !features.timeRefs.length && !firstMemory?.timelineDate
  };

  return {
    literal,
    relation,
    emotion,
    memory,
    responseMode: inferConversationMode(text, features)
  };
}

function scoreTextAgainstFeatures(text, features, weight = 1) {
  const haystack = String(text || '').toLowerCase();
  let score = 0;

  features.tokens.forEach((token) => {
    if (token && haystack.includes(token)) score += token.length > 1 ? 3 : 1;
  });

  features.explicitPeople.forEach((name) => {
    if (name && haystack.includes(name.toLowerCase())) score += 8;
  });

  features.timeRefs.forEach((timeRef) => {
    if (timeRef && haystack.includes(timeRef.toLowerCase())) score += 6;
  });

  score += cosineSimilarity(features.embedding, buildLocalEmbedding(text)) * 12;
  return score * weight;
}

function buildMemoryRetrievalUnits(memory) {
  const units = [
    {
      type: 'summary',
      text: [memory.title, memory.summary].filter(Boolean).join('，'),
      weight: 1.35
    },
    {
      type: 'content',
      text: memory.content,
      weight: 1.15
    },
    {
      type: 'people',
      text: (memory.people || []).map((item) => `${item.name} ${item.relation} ${item.role}`).join(' '),
      weight: 1.45
    },
    {
      type: 'time',
      text: [memory.timelineDate, memory.timelineLabel, ...(memory.timeRefs || [])].filter(Boolean).join(' '),
      weight: 1.3
    },
    {
      type: 'actions',
      text: (memory.actions || []).join(' '),
      weight: 1.3
    },
    {
      type: 'locations',
      text: (memory.locations || []).join(' '),
      weight: 1.2
    }
  ];

  return units.filter((unit) => String(unit.text || '').trim());
}

function scoreMemory(memory, features) {
  const haystack = getMemorySearchText(memory);
  let score = scoreTextAgainstFeatures(haystack, features, 1);

  const peopleNames = (memory.people || []).map((item) => item.name);
  peopleNames.forEach((name) => {
    if (name && features.text.includes(name)) score += 9;
  });

  (memory.actions || []).forEach((action) => {
    if (action && features.text.includes(action)) score += 6;
  });

  if (memory.mood === features.emotion) score += 2;
  if (memory.timelineDate && features.timeRefs.length) score += 1.5;

  const unitHits = buildMemoryRetrievalUnits(memory)
    .map((unit) => ({
      ...unit,
      score: scoreTextAgainstFeatures(unit.text, features, unit.weight)
    }))
    .filter((unit) => unit.score > 2.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (features.intent === 'reminisce' && memory.timelineLabel) score += 1.2;
  score += unitHits.reduce((sum, item, index) => sum + item.score / (index === 0 ? 1 : 1.8), 0);
  score += cosineSimilarity(features.embedding, memory.embedding || []) * 12;

  return {
    score,
    hits: unitHits.map((item) => ({
      type: item.type,
      text: compactText(item.text, item.type === 'content' ? 64 : 36)
    }))
  };
}

function retrieveRelevantMemories(queryText) {
  const profile = getProfile();
  const features = buildQueryFeatures(queryText, profile);
  return getMemories()
    .map((memory) => {
      const result = scoreMemory(memory, features);
      return {
        memory: {
          ...memory,
          retrievalHits: result.hits
        },
        score: result.score
      };
    })
    .filter((item) => item.score > 4.2)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const timeA = a.memory.timelineDate || '';
      const timeB = b.memory.timelineDate || '';
      if (timeA && timeB && timeA !== timeB) return timeB.localeCompare(timeA);
      if (timeA && !timeB) return -1;
      if (!timeA && timeB) return 1;
      return String(b.memory.createdAt).localeCompare(String(a.memory.createdAt));
    })
    .slice(0, 4)
    .map((item) => item.memory);
}

function retrieveRelevantProfileSignals(queryText, profile = getProfile()) {
  const features = buildQueryFeatures(queryText, profile);
  const candidates = [
    ...(profile.speakingStyle ? [{ type: '说话习惯', value: profile.speakingStyle }] : []),
    ...(profile.worldview ? [{ type: '看法', value: profile.worldview }] : []),
    ...(profile.likes || []).map((value) => ({ type: '喜欢', value })),
    ...(profile.dislikes || []).map((value) => ({ type: '不喜欢', value })),
    ...(profile.habits || []).map((value) => ({ type: '习惯', value })),
    ...(profile.goals || []).map((value) => ({ type: '目标', value })),
    ...(profile.importantPeople || []).map((value) => ({ type: '重要人物', value })),
    ...(profile.keyMemories || []).map((value) => ({ type: '长期记忆', value }))
  ];

  return candidates
    .map((item) => {
      const text = `${item.type} ${item.value}`;
      let score = scoreTextAgainstFeatures(text, features, item.type === '重要人物' ? 1.35 : 1);
      if ((item.type === '重要人物' || item.type === '长期记忆') && features.text.includes(item.value)) score += 6;
      if (item.type === '喜欢' && features.intent === 'listen') score += 0.5;
      return { ...item, score };
    })
    .filter((item) => item.score > 3.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function retrieveRelevantLifeSummaries(queryText) {
  const features = buildQueryFeatures(queryText, getProfile());
  return getLifeSummaries()
    .map((item) => {
      const text = `${item.type} ${item.label} ${item.summary} ${(item.people || []).join(' ')} ${(item.tags || []).join(' ')}`;
      let score = scoreTextAgainstFeatures(text, features, item.type === 'person_line' ? 1.3 : 1.1);
      if (item.people.some((name) => features.explicitPeople.includes(name))) score += 8;
      if (features.timeRefs.some((time) => item.label.includes(time) || item.summary.includes(time))) score += 6;
      if (item.tags.includes(features.emotion)) score += 3;
      return { ...item, score };
    })
    .filter((item) => item.score > 3.8)
    .sort((a, b) => b.score - a.score || b.evidenceCount - a.evidenceCount)
    .slice(0, 4);
}

function buildConversationContext() {
  return getChatHistory()
    .slice(-4)
    .map((item) => `${item.role === 'assistant' ? getSettings().companionName : '用户'}：${item.content}`)
    .join('\n');
}

function buildUserVoiceSamples(limit = 4) {
  return getUserChatHistory(limit)
    .map((item) => compactText(item.content, 42))
    .filter(Boolean)
    .join('\n');
}

function buildChatRetrieval(queryText) {
  const profile = getProfile();
  const memories = retrieveRelevantMemories(queryText);
  const profileSignals = retrieveRelevantProfileSignals(queryText, profile);
  const lifeSummaries = retrieveRelevantLifeSummaries(queryText);
  const queryFeatures = buildQueryFeatures(queryText, profile);
  const pendingTimeQuestions = memories
    .filter((memory) => !memory.timelineDate && memory.followUpQuestion)
    .map((memory) => memory.followUpQuestion)
    .slice(0, 2);
  const understanding = buildUnderstandingLayers(queryText, {
    memories,
    profileSignals,
    lifeSummaries,
    queryFeatures
  });

  return {
    profile,
    memories,
    profileSignals,
    lifeSummaries,
    queryFeatures,
    understanding,
    pendingTimeQuestions,
    recentConversation: buildConversationContext()
  };
}

function makeMemoryTitle(text) {
  const compact = compactText(text, 16).replace(/\.\.\.$/, '').trim();
  return compact || `新的篇章 ${nowString()}`;
}

function buildMemory(text, source) {
  return normalizeMemory({
    id: uid('memory'),
    title: makeMemoryTitle(text),
    content: text,
    mood: detectEmotion(text),
    tags: uniqueStrings([detectEmotion(text)], 3),
    createdAt: nowString(),
    source
  });
}

function saveMemory(memory) {
  const memories = getMemories();
  memories.unshift(normalizeMemory(memory));
  setMemories(memories);
}

async function requestMemoryStructure(memory) {
  const fallback = buildFallbackStructure(memory.content, memory.title, memory.mood, memory.tags);
  try {
    const response = await fetch('http://localhost:3001/api/memory-structure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: memory.content,
        title: memory.title,
        mood: memory.mood,
        source: memory.source
      })
    });
    if (!response.ok) throw new Error('记忆结构化接口异常');
    const data = await response.json();
    return {
      ...fallback,
      ...data,
      people: normalizePeople([...(data.people || []), ...(fallback.people || [])]),
      timeRefs: uniqueStrings(data.timeRefs?.length ? data.timeRefs : fallback.timeRefs, 8),
      timelineDate: String(data.timelineDate || fallback.timelineDate || '').trim(),
      timelineLabel: String(data.timelineLabel || data.timelineDate || fallback.timelineLabel || '').trim(),
      timeAccuracy: String(data.timeAccuracy || fallback.timeAccuracy || 'unknown').trim(),
      followUpQuestion: String(data.followUpQuestion || fallback.followUpQuestion || '').trim(),
      locations: uniqueStrings(data.locations, 8),
      actions: uniqueStrings(data.actions, 8),
      tags: normalizeMeaningfulTags([...(data.tags || []), ...(memory.tags || [])], 6),
      mood: data.mood || memory.mood || fallback.mood,
      title: data.title || memory.title || fallback.title,
      summary: data.summary || fallback.summary,
      retrievalText: data.retrievalText || fallback.retrievalText,
      embedding: null
    };
  } catch (error) {
    console.error(error);
    return fallback;
  }
}

async function enrichMemory(memory) {
  const normalized = normalizeMemory(memory);
  const structured = await requestMemoryStructure(normalized);
  return normalizeMemory({
    ...normalized,
    ...structured,
    title: normalized.title || structured.title,
    mood: normalized.mood || structured.mood,
    tags: uniqueStrings([...(normalized.tags || []), ...(structured.tags || [])], 10)
  });
}

async function createAndStoreMemory(text, source) {
  const draft = buildMemory(text, source);
  const enriched = await enrichMemory(draft);
  saveMemory(enriched);
  return enriched;
}

async function storeMemoryDraft(draft) {
  const enriched = await enrichMemory(normalizeMemory(draft));
  saveMemory(enriched);
  return enriched;
}

async function requestMemoryDraft(text, source) {
  const fallback = buildMemory(text, source);
  try {
    const response = await fetch('http://localhost:3001/api/memory-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source })
    });
    if (!response.ok) throw new Error('记忆草稿接口异常');
    const data = await response.json();
    const drafted = normalizeMemory({
      ...fallback,
      title: data.title || fallback.title,
      content: data.content || text,
      summary: data.summary || fallback.summary,
      mood: data.mood || fallback.mood,
      tags: normalizeMeaningfulTags([...(data.tags || []), ...(fallback.tags || [])], 6)
    });
    const structured = await requestMemoryStructure(drafted);
    return normalizeMemory({
      ...drafted,
      ...structured,
      title: drafted.title || structured.title,
      summary: drafted.summary || structured.summary
    });
  } catch (error) {
    console.error(error);
    return fallback;
  }
}

function renderDraftAnalysis(memory) {
  const blocks = [
    { label: '人物', value: (memory.people || []).map((item) => item.name).join('、') },
    { label: '时间', value: memory.timelineLabel || (memory.timeRefs || []).join('、') },
    { label: '地点', value: (memory.locations || []).join('、') },
    { label: '事件', value: (memory.actions || []).join('、') }
  ].filter((item) => item.value);

  const lines = blocks.length
    ? blocks.map((item) => `<span><strong>${escapeHtml(item.label)}</strong>${escapeHtml(item.value)}</span>`).join('')
    : '<span>这段内容暂时还没有提取出足够明确的人物、时间或事件。</span>';

  return `
    <div class="memory-draft-analysis">
      <div class="memory-draft-analysis-head">
        <span class="page-kicker">AI 整理到的线索</span>
        <p>先看一眼这段内容目前被整理成了什么，再决定要不要保留。</p>
      </div>
      <div class="memory-draft-analysis-grid">${lines}</div>
      ${memory.followUpQuestion ? `<div class="memory-follow-up">${escapeHtml(getMemoryFollowUpCopy(memory))}</div>` : ''}
    </div>
  `;
}

function ensureMemoryDraftModal() {
  if (document.getElementById('memoryDraftModal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="memory-modal" id="memoryDraftModal" aria-hidden="true">
      <div class="memory-modal-backdrop" onclick="closeMemoryDraftModal()"></div>
      <div class="memory-modal-panel">
        <div class="memory-modal-head">
          <div>
            <span class="page-kicker">记忆草稿</span>
            <h2>先确认这一页，再决定是否保留</h2>
          </div>
          <button class="ghost-btn" type="button" onclick="closeMemoryDraftModal()">关闭</button>
        </div>
        <div class="memory-modal-grid">
          <label>
            <span>标题</span>
            <input id="memoryDraftTitle" type="text" />
          </label>
          <label>
            <span>心绪</span>
            <input id="memoryDraftMood" type="text" />
          </label>
          <label class="wide">
            <span>摘要</span>
            <input id="memoryDraftSummary" type="text" />
          </label>
          <label class="wide">
            <span>标签</span>
            <input id="memoryDraftTags" type="text" />
          </label>
          <label class="wide">
            <span>正文</span>
            <textarea id="memoryDraftContent"></textarea>
          </label>
        </div>
        <div id="memoryDraftAnalysis"></div>
        <div class="memory-modal-actions">
          <button class="ghost-btn" type="button" onclick="discardMemoryDraft()">删除这份草稿</button>
          <button type="button" onclick="confirmMemoryDraft()">确认保留</button>
        </div>
      </div>
    </div>
  `);
}

function openMemoryDraftModal(draft) {
  pendingMemoryDraft = {
    ...normalizeMemory(draft),
    candidateId: draft?.candidateId || ''
  };
  ensureMemoryDraftModal();
  document.getElementById('memoryDraftTitle').value = pendingMemoryDraft.title || '';
  document.getElementById('memoryDraftMood').value = pendingMemoryDraft.mood || '';
  document.getElementById('memoryDraftSummary').value = pendingMemoryDraft.summary || '';
  document.getElementById('memoryDraftTags').value = (pendingMemoryDraft.tags || []).join('、');
  document.getElementById('memoryDraftContent').value = pendingMemoryDraft.content || '';
  document.getElementById('memoryDraftAnalysis').innerHTML = renderDraftAnalysis(pendingMemoryDraft);
  document.getElementById('memoryDraftModal')?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeMemoryDraftModal() {
  document.getElementById('memoryDraftModal')?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function discardMemoryDraft() {
  pendingMemoryDraft = null;
  closeMemoryDraftModal();
}

async function confirmMemoryDraft() {
  if (!pendingMemoryDraft) return;
  const confirmBtn = document.activeElement;
  if (confirmBtn instanceof HTMLButtonElement) confirmBtn.disabled = true;
  const candidateId = pendingMemoryDraft.candidateId;
  const draft = normalizeMemory({
    ...pendingMemoryDraft,
    title: document.getElementById('memoryDraftTitle')?.value.trim() || pendingMemoryDraft.title,
    mood: document.getElementById('memoryDraftMood')?.value.trim() || pendingMemoryDraft.mood,
    summary: document.getElementById('memoryDraftSummary')?.value.trim() || pendingMemoryDraft.summary,
    tags: uniqueStrings((document.getElementById('memoryDraftTags')?.value || '').split(/[、，,\n]+/), 8),
    content: document.getElementById('memoryDraftContent')?.value.trim() || pendingMemoryDraft.content
  });
  await storeMemoryDraft(draft);
  if (candidateId) {
    removeMemoryCandidate(candidateId);
  }
  pendingMemoryDraft = null;
  closeMemoryDraftModal();
  renderCoverHighlights();
  renderCoverWidgets();
  renderMemoryCandidates();
  renderMemoryCueFloat();
  renderMemories(document.getElementById('memorySearch')?.value.trim() || '');
  renderMemoryMap();
  populateSharedCopy();
  if (confirmBtn instanceof HTMLButtonElement) confirmBtn.disabled = false;
  alert('这一页已经保留下来。');
}

function renderStructuredBadges(memory) {
  const chips = [
    ...(memory.people || []).map((item) => ({ type: '人物', value: item.name })),
    ...(memory.timelineLabel ? [{ type: '时间', value: memory.timelineLabel }] : []),
    ...(memory.actions || []).slice(0, 2).map((item) => ({ type: '事件', value: item }))
  ].filter((item) => item.value);

  if (!chips.length) return '';
  return `
    <div class="memory-meta-row">
      ${chips.slice(0, 4).map((item) => `<span><strong>${escapeHtml(item.type)}</strong>${escapeHtml(item.value)}</span>`).join('')}
    </div>
  `;
}

function formatTimelineGroupLabel(memory) {
  if (memory.timelineDate) return memory.timelineDate;
  return '待补时间';
}

function getPhotoWallItems(memories = getMemories()) {
  const buckets = new Map();
  memories.forEach((memory) => {
    (memory.people || []).forEach((person) => {
      const key = person.personId || person.name;
      if (!key) return;
      if (!buckets.has(key)) {
        buckets.set(key, {
          personId: key,
          person: person.name,
          memories: []
        });
      }
      buckets.get(key).memories.push(memory);
    });
  });

  return Array.from(buckets.values())
    .sort((a, b) => b.memories.length - a.memories.length || a.person.localeCompare(b.person, 'zh-Hans-CN'))
    .slice(0, 12)
    .map((bucket) => ({
      id: bucket.personId,
      title: bucket.memories[0]?.title || '',
      personId: bucket.personId,
      person: bucket.person,
      label: `${bucket.memories.length} 段回忆`,
      summary: bucket.memories[0]?.summary || compactText(bucket.memories[0]?.content || '', 28)
    }));
}

function getRelationGraphData(memories = getMemories()) {
  const counts = new Map();
  const links = new Map();

  memories.forEach((memory) => {
    const persons = uniquePeople(memory.people || [], 12);
    const ids = uniqueStrings(persons.map((item) => item.personId || item.name), 12);
    const labelMap = new Map(persons.map((item) => [item.personId || item.name, item.name]));
    ids.forEach((id) => counts.set(id, {
      count: (counts.get(id)?.count || 0) + 1,
      name: labelMap.get(id) || id
    }));
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = [ids[i], ids[j]].sort().join('::');
        links.set(key, (links.get(key) || 0) + 1);
      }
    }
  });

  const nodes = Array.from(counts.entries())
    .filter(([, item]) => item.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([id, item], index) => ({ id, name: item.name, count: item.count, index }));

  const nodeNames = new Set(nodes.map((item) => item.id));
  const edges = Array.from(links.entries())
    .map(([key, weight]) => {
      const [sourceId, targetId] = key.split('::');
      const sourceNode = nodes.find((item) => item.id === sourceId);
      const targetNode = nodes.find((item) => item.id === targetId);
      return { sourceId, targetId, source: sourceNode?.name || sourceId, target: targetNode?.name || targetId, weight };
    })
    .filter((edge) => nodeNames.has(edge.sourceId) && nodeNames.has(edge.targetId));

  return { nodes, edges };
}

function getMemoriesForPerson(personName, memories = getMemories()) {
  return memories
    .filter((memory) => (memory.people || []).some((item) => (item.personId || item.name) === personName || item.name === personName))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function getPersonMergeSuggestions(memories = getMemories()) {
  return [];
}

async function requestPersonSummary(personName, memories) {
  const fallback = {
    summary: `这几段回忆都提到了${personName}。先把和她有关的片段放在一起，后面再慢慢补时间和细节。`,
    relationLabel: '反复提到的人',
    personImpression: '',
    sharedMoments: memories.flatMap((memory) => memory.actions || []).slice(0, 3),
    userView: '',
    personView: '',
    openQuestions: memories.some((memory) => !memory.timelineDate)
      ? ['这几段回忆大概集中在你人生的哪个阶段？']
      : []
  };

  try {
    const response = await fetch('http://localhost:3001/api/memory-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personName,
        memories: memories.map((memory) => ({
          title: memory.title,
          content: memory.content,
          actions: memory.actions,
          timelineLabel: memory.timelineLabel,
          createdAt: memory.createdAt
        }))
      })
    });
    if (!response.ok) throw new Error('人物摘要接口异常');
    const data = await response.json();
    return {
      summary: String(data.summary || fallback.summary).trim(),
      relationLabel: String(data.relationLabel || fallback.relationLabel).trim(),
      personImpression: String(data.personImpression || fallback.personImpression).trim(),
      sharedMoments: Array.isArray(data.sharedMoments) ? data.sharedMoments.slice(0, 4) : fallback.sharedMoments,
      userView: String(data.userView || fallback.userView).trim(),
      personView: String(data.personView || fallback.personView).trim(),
      openQuestions: Array.isArray(data.openQuestions) ? data.openQuestions.slice(0, 3) : fallback.openQuestions
    };
  } catch (error) {
    console.error(error);
    return fallback;
  }
}

async function requestChapterCompose(personName, memories) {
  const fallback = {
    title: `${personName}篇`,
    narrative: `${personName}已经在你的记忆里反复出现。这一条线先能看出来，你们之间有一些会被你反复想起的片段，但它还在继续长，后面会慢慢从零散回忆整理成更完整的一章。`,
    timeline: memories.some((memory) => memory.timelineDate || memory.timelineLabel)
      ? '这些片段已经开始落到时间线上。'
      : '时间还在慢慢补。',
    anchors: memories.map((memory) => memory.summary || compactText(memory.content, 26)).filter(Boolean).slice(0, 4),
    openThreads: memories.some((memory) => !memory.timelineDate)
      ? ['这条线大概开始于什么时候，还可以以后慢慢补。']
      : []
  };

  try {
    const response = await fetch('http://localhost:3001/api/chapter-compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personName,
        memories: memories.map((memory) => ({
          title: memory.title,
          summary: memory.summary,
          content: memory.content,
          people: (memory.people || []).map((item) => item.name),
          actions: memory.actions,
          timelineLabel: memory.timelineLabel,
          createdAt: memory.createdAt
        }))
      })
    });
    if (!response.ok) throw new Error('人物篇章接口异常');
    const data = await response.json();
    return {
      title: String(data.title || fallback.title).trim(),
      narrative: String(data.narrative || fallback.narrative).trim(),
      timeline: String(data.timeline || fallback.timeline).trim(),
      anchors: Array.isArray(data.anchors) ? data.anchors.slice(0, 5) : fallback.anchors,
      openThreads: Array.isArray(data.openThreads) ? data.openThreads.slice(0, 4) : fallback.openThreads
    };
  } catch (error) {
    console.error(error);
    return fallback;
  }
}

async function updateProfileInsights(text) {
  const profile = getProfile();
  const history = getUserChatHistory(8).map((item) => ({
    role: item.role,
    content: item.content
  }));
  const memories = getMemories().slice(0, 6).map((memory) => ({
    title: memory.title,
    summary: memory.summary,
    people: (memory.people || []).map((item) => item.name),
    actions: memory.actions,
    timelineLabel: memory.timelineLabel
  }));

  try {
    const response = await fetch('http://localhost:3001/api/profile-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, history, memories })
    });
    if (!response.ok) throw new Error('画像接口异常');
    const data = await response.json();
    setProfile(mergeProfileInsights(profile, data));
  } catch (error) {
    console.error(error);
  }
}

async function selectPerson(personName) {
  activePersonName = personName;
  activeBookPanel = 'people';
  renderMemoryMap();
  if (!personName || personSummaryCache.has(personName)) return;
  const memories = getMemoriesForPerson(personName);
  personSummaryCache.set(personName, {
    summary: '正在整理这位人物相关的回忆...',
    openQuestions: [],
    chapter: { title: `${personName}篇`, narrative: '正在把这一条人物线整理成一小段可回看的篇章...', timeline: '', anchors: [], openThreads: [] }
  });
  renderMemoryMap();
  const [summary, chapter] = await Promise.all([
    requestPersonSummary(personName, memories),
    requestChapterCompose(personName, memories)
  ]);
  personSummaryCache.set(personName, { ...summary, chapter });
  renderMemoryMap();
}

async function composePersonChapter(personName = activePersonName) {
  if (!personName) return;
  const memories = getMemoriesForPerson(personName);
  const cached = personSummaryCache.get(personName) || {};
  personSummaryCache.set(personName, {
    ...cached,
    chapter: {
      title: `${personName}篇`,
      narrative: '正在重新整理这一条人物线，请稍等一下。',
      timeline: '',
      anchors: [],
      openThreads: []
    }
  });
  renderMemoryMap();
  const chapter = await requestChapterCompose(personName, memories);
  personSummaryCache.set(personName, {
    ...cached,
    chapter
  });
  renderMemoryMap();
}

function focusMemoryMapView(view, query = '') {
  const viewNode = document.getElementById('memoryMapView');
  const searchNode = document.getElementById('memoryMapSearch');
  activeBookPanel = view === 'timeline' ? 'timeline' : view === 'people' ? 'people' : 'chapters';
  if (viewNode) viewNode.value = view;
  if (searchNode) searchNode.value = query;
  renderMemoryMap();
}

function focusMemoryMapSearch(query = '') {
  const searchNode = document.getElementById('memoryMapSearch');
  if (searchNode) searchNode.value = query;
  renderMemoryMap();
}

function toggleBookPanel(panelName) {
  activeBookPanel = activeBookPanel === panelName ? '' : panelName;
  if (!activeBookPanel) {
    const searchNode = document.getElementById('memoryMapSearch');
    if (searchNode) searchNode.value = '';
  }
  renderMemoryMap();
}

function getMemoryMapGroups(memories = getMemories()) {
  const people = new Map();
  const timeline = new Map();
  const actions = new Map();

  memories.forEach((memory) => {
    (memory.people || []).forEach((person) => {
      const key = person.personId || person.name;
      if (!key) return;
      if (!people.has(key)) {
        people.set(key, {
          id: key,
          label: person.name,
          hint: person.relation || person.role || '人物',
          memories: []
        });
      }
      people.get(key).memories.push(memory);
    });

    const timeItems = [formatTimelineGroupLabel(memory)];
    timeItems.forEach((item) => {
      const key = item;
      if (!key) return;
      if (!timeline.has(key)) {
        timeline.set(key, { label: key, hint: '时间', memories: [] });
      }
      timeline.get(key).memories.push(memory);
    });

    (memory.actions || []).forEach((action) => {
      const key = action;
      if (!key) return;
      if (!actions.has(key)) {
        actions.set(key, { label: key, hint: '事件', memories: [] });
      }
      actions.get(key).memories.push(memory);
    });
  });

  const compareMemoryTime = (a, b) => {
    const timeA = a.timelineDate || '';
    const timeB = b.timelineDate || '';
    if (timeA && timeB && timeA !== timeB) return timeB.localeCompare(timeA);
    if (timeA && !timeB) return -1;
    if (!timeA && timeB) return 1;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  };

  const sortGroups = (map, mode = 'default') => Array.from(map.values())
    .map((group) => ({ ...group, memories: group.memories.sort(compareMemoryTime) }))
    .sort((a, b) => {
      if (mode === 'timeline') {
        const dateA = a.memories[0]?.timelineDate || '';
        const dateB = b.memories[0]?.timelineDate || '';
        if (dateA && dateB && dateA !== dateB) return dateB.localeCompare(dateA);
        if (dateA && !dateB) return -1;
        if (!dateA && dateB) return 1;
      }
      return b.memories.length - a.memories.length || a.label.localeCompare(b.label, 'zh-Hans-CN');
    });

  return {
    people: sortGroups(new Map(Array.from(people.entries()).filter(([, group]) => group.memories.length >= 2))),
    timeline: sortGroups(timeline, 'timeline'),
    actions: sortGroups(actions)
  };
}

function getBookChapterCards() {
  const memories = getMemories();
  const groups = getMemoryMapGroups(memories);
  const cards = [];

  const mainPerson = groups.people[0];
  if (mainPerson) {
    const cached = personSummaryCache.get(mainPerson.id);
    cards.push({
      kind: '人物篇',
      title: `关于${mainPerson.label}`,
      subtitle: `${mainPerson.memories.length} 段回忆`,
      body: cached?.chapter?.narrative || cached?.summary || `${mainPerson.label}已经在你的记忆里反复出现，这一条线正在慢慢长成一章。`,
      action: `selectPerson('${mainPerson.id.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')`
    });
  }

  const mainTimeline = groups.timeline.find((group) => group.label !== '待补时间');
  if (mainTimeline) {
    cards.push({
      kind: '年代篇',
      title: `${mainTimeline.label}的日子`,
      subtitle: `${mainTimeline.memories.length} 段回忆`,
      body: `这一段时间里，${mainTimeline.memories.map((item) => item.summary || item.title).filter(Boolean).slice(0, 2).join('，')}。`,
      action: `focusMemoryMapView('timeline', '${mainTimeline.label.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')`
    });
  } else if (groups.people[1]) {
    const secondary = groups.people[1];
    const cached = personSummaryCache.get(secondary.id);
    cards.push({
      kind: '人物篇',
      title: `关于${secondary.label}`,
      subtitle: `${secondary.memories.length} 段回忆`,
      body: cached?.chapter?.narrative || cached?.summary || `${secondary.label}这一条线也在慢慢长成一章。`,
      action: `selectPerson('${secondary.id.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')`
    });
  }

  const candidateCount = getMemoryCandidates().filter((item) => !item.dismissed && item.memorySignal).length;
  cards.push({
    kind: '整理中',
    title: '还在整理中的回忆',
    subtitle: `${candidateCount} 条线索`,
    body: candidateCount
      ? '有一些刚说过的话还在慢慢沉下来，过一阵再来看，它们会长成更完整的章节。'
      : '现在这一页很安静，新的回忆线索会在这里慢慢长出来。',
    action: `window.location.href='memory.html'`
  });

  return cards.slice(0, 3);
}

function getTimelineHeatmapData(memories = getMemories()) {
  const months = new Map();
  memories.forEach((memory) => {
    const raw = String(memory.timelineDate || memory.createdAt || '').trim();
    const key = raw.match(/^(\d{4}-\d{2})/)?.[1] || raw.match(/^(\d{4})/)?.[1] || '待补时间';
    months.set(key, (months.get(key) || 0) + 1);
  });
  const entries = Array.from(months.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12);
  const max = Math.max(...entries.map(([, count]) => count), 1);
  return entries.map(([label, count]) => ({
    label,
    count,
    level: Math.max(1, Math.min(4, Math.ceil((count / max) * 4)))
  }));
}

function getTimelineStripCards() {
  return getMemoryMapGroups().timeline
    .filter((group) => group.label !== '待补时间')
    .slice(0, 4)
    .map((group) => ({
      label: group.label,
      count: group.memories.length,
      text: group.memories.map((item) => item.summary || item.title).filter(Boolean).slice(0, 2).join('，')
    }));
}

function getPersonAlbumCards() {
  const repeatedIds = new Set(getMemoryMapGroups().people.map((group) => group.id));
  return getPhotoWallItems()
    .filter((item) => repeatedIds.has(item.personId))
    .map((item) => ({
      ...item,
      subtitle: item.label,
      caption: item.summary || `${item.person}这一条回忆线正在慢慢长出来。`
    }));
}

function getBookOverviewCards() {
  const chapters = getBookChapterCards();
  const timelineCells = getTimelineHeatmapData();
  const people = getPersonAlbumCards();
  const threads = getLifeSummaries();
  return [
    {
      id: 'chapters',
      icon: '📖',
      title: '已写章节',
      count: `${chapters.length} 篇`,
      body: chapters[0]?.title ? `先读 ${chapters[0].title}，再慢慢往下翻。` : '已经长出来的章节，会先放在这里。',
      active: activeBookPanel === 'chapters'
    },
    {
      id: 'timeline',
      icon: '📅',
      title: '时间回看',
      count: timelineCells.length ? `${timelineCells.length} 段` : '还在慢慢长',
      body: timelineCells.length ? '按时间回看，哪段日子更浓一点一眼就能看见。' : '时间线还在慢慢补齐，以后会越来越清楚。',
      active: activeBookPanel === 'timeline'
    },
    {
      id: 'people',
      icon: '👤',
      title: '认识的人',
      count: `${people.length} 位`,
      body: people.length ? '一人一格，点开就能看这一条回忆线。' : '同一个人反复出现后，才会慢慢进到相册里。',
      active: activeBookPanel === 'people'
    },
    {
      id: 'threads',
      icon: '🧵',
      title: '人生线索',
      count: `${threads.length} 条`,
      body: threads.length ? '先读这几条已经慢慢长出来的线，再决定往哪一页翻。' : '人物线、情绪线和人生阶段线，会在这里慢慢浮出来。',
      active: activeBookPanel === 'threads'
    }
  ];
}

function getLifeSummaryCards() {
  return getLifeSummaries().map((item) => ({
    ...item,
    kind: item.type === 'person_line' ? '人物线' : item.type === 'timeline_line' ? '阶段线' : '心绪线'
  }));
}

function renderMemoryMap() {
  const root = document.getElementById('memoryMapRoot');
  if (!root) return;

  const view = document.getElementById('memoryMapView')?.value || 'people';
  const query = document.getElementById('memoryMapSearch')?.value.trim().toLowerCase() || '';
  const groups = getMemoryMapGroups();
  const overviewRoot = document.getElementById('bookOverviewCards');
  const photoWall = document.getElementById('memoryPhotoWall');
  const bookShelf = document.getElementById('bookChapterShelf');
  const timeGrid = document.getElementById('memoryTimeGrid');
  const timelineStrip = document.getElementById('memoryTimelineStrip');
  const lifeSummaryWall = document.getElementById('lifeSummaryWall');
  const pendingWall = document.getElementById('memoryPendingWall');
  const toolbar = document.querySelector('.map-toolbar');
  const chaptersSection = document.getElementById('bookSectionChapters');
  const timelineSection = document.getElementById('bookSectionTimeline');
  const peopleSection = document.getElementById('bookSectionPeople');
  const threadsSection = document.getElementById('bookSectionThreads');
  const pendingSection = document.getElementById('bookSectionPending');
  const detailSection = document.getElementById('memoryMapDetailSection');
  const detailTitle = document.getElementById('memoryMapDetailTitle');
  const relationRoot = document.getElementById('memoryRelationGraph');
  const personDetailRoot = document.getElementById('memoryPersonDetail');
  const mergeRoot = document.getElementById('memoryMergeSuggestions');
  const candidateClusters = getCandidateClusters();
  const buckets = view === 'timeline' ? groups.timeline : view === 'actions' ? groups.actions : groups.people;
  const filtered = buckets.filter((group) => {
    if (!query) return true;
    const haystack = `${group.label} ${group.hint} ${group.memories.map(getMemorySearchText).join(' ')}`.toLowerCase();
    return haystack.includes(query);
  });
  const showDetailList = Boolean(query || activeBookPanel === 'chapters' || activeBookPanel === 'timeline');

  if (toolbar) {
    toolbar.hidden = !activeBookPanel;
  }

  if (overviewRoot) {
    const cards = getBookOverviewCards();
    overviewRoot.innerHTML = cards.map((card) => `
      <button class="book-overview-card${card.active ? ' active' : ''}" onclick="toggleBookPanel('${card.id}')">
        <span class="book-overview-icon" aria-hidden="true">${card.icon}</span>
        <strong>${escapeHtml(card.title)}</strong>
        <span class="book-overview-count">${escapeHtml(card.count)}</span>
        <p>${escapeHtml(card.body)}</p>
      </button>
    `).join('');
  }

  if (chaptersSection) chaptersSection.hidden = activeBookPanel !== 'chapters';
  if (timelineSection) timelineSection.hidden = activeBookPanel !== 'timeline';
  if (peopleSection) peopleSection.hidden = activeBookPanel !== 'people';
  if (threadsSection) threadsSection.hidden = activeBookPanel !== 'threads';
  if (pendingSection) pendingSection.hidden = !(candidateClusters.length && activeBookPanel);
  if (detailSection) detailSection.hidden = !showDetailList;
  if (detailTitle) {
    detailTitle.textContent = activeBookPanel === 'timeline'
      ? '把时间里的细节再往下翻开'
      : '这里放这一类里更细的内容';
  }

  if (bookShelf) {
    const cards = getBookChapterCards();
    bookShelf.innerHTML = cards.map((card) => `
      <article class="book-chapter-card" onclick="${card.action}">
        <span class="memory-map-kicker">${escapeHtml(card.kind)}</span>
        <h3>${escapeHtml(card.title)}</h3>
        <strong>${escapeHtml(card.subtitle)}</strong>
        <p>${escapeHtml(compactText(card.body, 120))}</p>
      </article>
    `).join('');
  }

  if (timeGrid) {
    const cells = getTimelineHeatmapData();
    timeGrid.innerHTML = cells.length
      ? cells.map((cell) => `
        <button class="memory-time-cell level-${cell.level}" onclick="focusMemoryMapView('timeline', '${cell.label.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">
          <strong>${escapeHtml(cell.label)}</strong>
          <span>${cell.count} 段</span>
        </button>
      `).join('')
      : '<div class="memory-empty">时间线还在慢慢长出来。</div>';
  }

  if (timelineStrip) {
    const items = getTimelineStripCards();
    timelineStrip.innerHTML = items.length
      ? items.map((item) => `
        <article class="memory-timeline-card" onclick="focusMemoryMapView('timeline', '${item.label.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${item.count} 段回忆</span>
          <p>${escapeHtml(compactText(item.text, 52))}</p>
        </article>
      `).join('')
      : '<div class="memory-empty">目前还没有清楚落到时间上的片段。</div>';
  }

  if (photoWall) {
    const items = getPersonAlbumCards().filter((item) => !query || `${item.person} ${item.title} ${item.caption} ${item.subtitle}`.toLowerCase().includes(query));
    photoWall.innerHTML = items.length ? items.map((item) => `
      <article class="memory-photo-card" onclick="selectPerson('${item.personId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">
        <div class="memory-photo-avatar">${escapeHtml(item.person.slice(0, 1))}</div>
        <strong>${escapeHtml(item.person)}</strong>
        <span>${escapeHtml(item.subtitle)}</span>
        <p>${escapeHtml(compactText(item.caption, 40))}</p>
      </article>
    `).join('') : '<div class="memory-empty">同一个人至少在两段记忆里出现后，照片墙才会开始整理出来。</div>';
  }

  if (lifeSummaryWall) {
    const items = getLifeSummaryCards().filter((item) => !query || `${item.label} ${item.summary} ${item.people.join(' ')} ${item.tags.join(' ')}`.toLowerCase().includes(query));
    lifeSummaryWall.innerHTML = items.length
      ? items.map((item) => `
        <article class="life-summary-card">
          <div class="life-summary-top">
            <div>
              <span class="memory-map-kicker">${escapeHtml(item.kind)}</span>
              <strong>${escapeHtml(item.label)}</strong>
            </div>
            <span class="life-summary-kind">${escapeHtml(`${Math.round(item.evidenceCount)} 条依据`)}</span>
          </div>
          <p>${escapeHtml(item.summary)}</p>
          ${(item.tags || []).length ? `
            <div class="life-summary-tags">
              ${item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
          <div class="life-summary-actions">
            ${item.type === 'person_line' && item.people?.[0] ? `<button class="ghost-btn" onclick="selectPerson('${item.people[0].replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">去看这个人</button>` : ''}
            ${item.type === 'timeline_line' ? `<button class="ghost-btn" onclick="focusMemoryMapView('timeline', '${item.label.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">去看这段时间</button>` : ''}
            ${item.type === 'emotion_line' ? `<button class="ghost-btn" onclick="focusMemoryMapSearch('${item.label.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">按这条心绪找找</button>` : ''}
          </div>
        </article>
      `).join('')
      : '<div class="memory-empty">人物线、人生阶段线和心绪线，还在慢慢长出来。</div>';
  }

  if (pendingWall) {
    const filteredClusters = candidateClusters.filter((cluster) => {
      if (!query) return true;
      const haystack = `${cluster.label} ${cluster.summary} ${cluster.people.join(' ')} ${cluster.candidates.map((item) => item.filteredText).join(' ')}`.toLowerCase();
      return haystack.includes(query);
    });
    pendingWall.innerHTML = filteredClusters.length
      ? filteredClusters.map((cluster) => `
        <article class="memory-photo-card pending">
          <div class="memory-photo-avatar">${escapeHtml(cluster.label.slice(0, 1))}</div>
          <strong>${escapeHtml(cluster.label)}</strong>
          <span>${cluster.type === 'person' ? `${cluster.count} 条人物线索` : cluster.type === 'time' ? `${cluster.count} 条时间线索` : `${cluster.count} 条待整理线索`}</span>
          <p>${escapeHtml(cluster.summary || '这组线索还在慢慢成形。')}</p>
          ${cluster.missingPieces.length ? `<div class="pending-memory-missing">还缺：${escapeHtml(cluster.missingPieces.join('、'))}</div>` : ''}
        </article>
      `).join('')
      : '<div class="memory-empty">最近还没有新的候选线索进入整理视图。</div>';
  }

  if (relationRoot) relationRoot.innerHTML = '';
  if (mergeRoot) mergeRoot.innerHTML = '';

  if (personDetailRoot) {
    personDetailRoot.hidden = !(activeBookPanel === 'people' && activePersonName);
    if (personDetailRoot.hidden) {
      personDetailRoot.innerHTML = '';
    } else {
      const memories = getMemoriesForPerson(activePersonName);
      const displayName = memories[0]?.people?.find((item) => (item.personId || item.name) === activePersonName)?.name || activePersonName;
      const cached = personSummaryCache.get(activePersonName);
      personDetailRoot.innerHTML = `
        <article class="person-detail-card">
          <div class="person-detail-head">
            <div>
              <span class="memory-map-kicker">人物小结</span>
              <h3>${escapeHtml(displayName)}</h3>
            </div>
            <strong>${memories.length} 段相关回忆</strong>
          </div>
          ${cached?.relationLabel ? `<div class="person-detail-role">${escapeHtml(cached.relationLabel)}</div>` : ''}
          ${cached?.chapter?.narrative ? `
            <div class="person-detail-chapter">
              <div class="person-detail-chapter-head">
                <strong>${escapeHtml(cached.chapter.title || `${displayName}篇`)}</strong>
                <button class="ghost-btn" onclick="selectPerson('${activePersonName.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">重新整理成篇</button>
              </div>
              <p>${escapeHtml(cached.chapter.narrative)}</p>
              ${cached.chapter.timeline ? `<div class="person-detail-role">${escapeHtml(cached.chapter.timeline)}</div>` : ''}
              ${(cached.chapter.anchors || []).length ? `
                <div class="person-detail-tags">
                  ${cached.chapter.anchors.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
                </div>
              ` : ''}
            </div>
          ` : ''}
          <p class="person-detail-summary">${escapeHtml(cached?.summary || '正在整理这位人物相关的回忆...')}</p>
          ${(cached?.personImpression || cached?.userView || cached?.personView) ? `
            <div class="person-detail-insights">
              ${cached?.personImpression ? `<div><strong>她给人的感觉</strong><span>${escapeHtml(cached.personImpression)}</span></div>` : ''}
              ${cached?.userView ? `<div><strong>你怎么看她</strong><span>${escapeHtml(cached.userView)}</span></div>` : ''}
              ${cached?.personView ? `<div><strong>她怎么对你</strong><span>${escapeHtml(cached.personView)}</span></div>` : ''}
            </div>
          ` : ''}
          ${(cached?.sharedMoments || []).length ? `
            <div class="person-detail-moments">
              <strong>你们一起做过的事</strong>
              <div class="person-detail-tags">
                ${cached.sharedMoments.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
              </div>
            </div>
          ` : ''}
          ${(cached?.openQuestions || []).length ? `
            <div class="person-detail-questions">
              ${cached.openQuestions.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
            </div>
          ` : ''}
          ${activePersonName ? `<div class="memory-map-actions"><button onclick="composePersonChapter('${activePersonName.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">整理成篇</button></div>` : ''}
          <div class="person-detail-list">
            ${memories.map((memory) => `
              <article class="memory-map-card">
                <div class="memory-map-card-top">
                  <h4>${escapeHtml(memory.title)}</h4>
                  <span>${escapeHtml(memory.timelineLabel || memory.createdAt)}</span>
                </div>
                <p>${escapeHtml(memory.summary || compactText(memory.content, 72))}</p>
                ${renderStructuredBadges(memory)}
              </article>
            `).join('')}
          </div>
        </article>
      `;
    }
  }

  if (!showDetailList) {
    root.innerHTML = '';
    return;
  }

  if (!filtered.length) {
    root.innerHTML = candidateClusters.length
      ? '<div class="memory-empty">正式记忆还不够成脉络，但上面的候选线索已经开始聚起来了。</div>'
      : '<div class="memory-empty">还没有可以整理出来的脉络，先去忆光写下一段吧。</div>';
    return;
  }

  root.innerHTML = filtered.map((group) => `
    <article class="memory-map-group">
      <div class="memory-map-head">
        <div>
          <span class="memory-map-kicker">${escapeHtml(group.hint)}</span>
          <h3>${escapeHtml(group.label)}</h3>
        </div>
        <strong>${group.memories.length} 段回忆</strong>
      </div>
      <div class="memory-map-list">
        ${group.memories.map((memory) => `
          <article class="memory-map-card">
            <div class="memory-map-card-top">
              <h4>${escapeHtml(memory.title)}</h4>
              <span>${escapeHtml(memory.timelineLabel || memory.createdAt)}</span>
            </div>
            <p>${escapeHtml(memory.summary || memory.content.slice(0, 68))}</p>
            ${renderStructuredBadges(memory)}
            ${memory.followUpQuestion && !memory.timelineDate ? `<div class="memory-follow-up">${escapeHtml(getMemoryFollowUpCopy(memory))}</div>` : ''}
          </article>
        `).join('')}
      </div>
      ${view === 'people' ? `<div class="memory-map-actions"><button class="ghost-btn" onclick="event.stopPropagation(); selectPerson('${(group.id || group.label).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">查看这一条线</button></div>` : ''}
    </article>
  `).join('');
}

function updateTheme() {
  const settings = getSettings();
  document.documentElement.style.setProperty('--accent', settings.accent);
  document.documentElement.style.fontSize = settings.fontSize;
  document.querySelectorAll('[data-companion-name]').forEach((node) => {
    node.textContent = settings.companionName;
  });
}

function populateSharedCopy() {
  const profile = getProfile();
  const memories = getMemories();
  const greeting = document.getElementById('coverGreeting');
  if (greeting) {
    greeting.textContent = `${profile.name}，今天想从何处开始呢？`;
  }
  const quote = document.getElementById('coverQuote');
  if (quote) {
    quote.textContent = getHomepageMemorySnippet(memories[0], 36) || '有些故事不需要急着讲完，我们可以慢慢翻开。';
  }
  const chapterTitle = document.getElementById('chapterHighlight');
  if (chapterTitle) {
    chapterTitle.textContent = memories[0]?.title || '今日篇章';
  }
  const presenceText = document.getElementById('coverPresenceText');
  if (presenceText) {
    presenceText.textContent = `${getSettings().companionName}会先安静听你说，再把值得留下的片段轻轻收进书里。`;
  }
  const memoryHint = document.getElementById('coverMemoryHint');
  if (memoryHint) {
    memoryHint.textContent = readableMemoryTitle(memories[0] || { title: '一小段旧时光' });
  }
  const todayStrip = document.getElementById('todayStrip');
  if (todayStrip) {
    const now = new Date();
    const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
    const notes = [
      '今天的天气和历史不必都记住，但今天的心情值得被温柔收下。',
      '历史上的今天也有人认真过日子，你也可以把这一页慢慢写下来。',
      '如果今天没什么大事发生，也可以只留下一句轻轻的话。'
    ];
    const note = notes[now.getDate() % notes.length];
    todayStrip.textContent = `${now.getMonth() + 1}月${now.getDate()}日 ${weekday} · ${note}`;
  }
}

function renderCoverHighlights() {
  const output = document.getElementById('coverHighlights');
  if (!output) return;
  output.innerHTML = getMemories().slice(0, 3).map((memory, index) => `
    <article class="chapter-teaser" style="animation-delay:${0.15 * index}s">
      <div class="chapter-ribbon"></div>
      <div class="chapter-label">${escapeHtml(memory.mood)}</div>
      <h3>${escapeHtml(memory.title)}</h3>
      <p>${escapeHtml(getHomepageMemorySnippet(memory, 32) || '这一页正在慢慢展开。')}</p>
    </article>
  `).join('');
}

function summarizeRecentTopics(memories) {
  const counts = new Map();
  memories.forEach((memory) => {
    (memory.tags || []).forEach((tag) => {
      if (!tag) return;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag]) => tag);
}

function renderCoverWidgets() {
  const memories = getMemories();
  const latest = memories[0];
  const summaryTitle = document.getElementById('coverSummaryTitle');
  const summaryText = document.getElementById('coverSummaryText');
  const continueTitle = document.getElementById('continueMemoryTitle');
  const continueText = document.getElementById('continueMemoryText');
  const continueBtn = document.getElementById('continueMemoryBtn');
  const tagInsights = document.getElementById('coverTagInsights');
  const dollText = document.getElementById('coverDollText');
  const summaryMemories = memories.slice(0, 3);

  if (continueTitle) {
    continueTitle.textContent = readableMemoryTitle(latest || { title: '最近的一页' });
  }
  if (continueText) {
    continueText.textContent = latest
      ? getHomepageMemorySnippet(latest, 34)
      : '还没有写下篇章时，也可以先从今天的心情开始。';
  }
  if (continueBtn) {
    continueBtn.disabled = !latest;
    continueBtn.onclick = () => {
      if (latest) reuseMemory(latest.id);
    };
  }
  if (summaryTitle) {
    summaryTitle.textContent = summaryMemories.length
      ? `最近常被翻开的，是${summaryMemories.length}段旧时光`
      : '慢慢写下来的，不只是片段';
  }
  if (summaryText) {
    const fragments = summaryMemories.map((memory) => readableMemoryTitle(memory)).filter(Boolean);
    summaryText.textContent = fragments.length
      ? `${fragments.slice(0, 2).join('、')}，正慢慢连成最近常回看的章节。`
      : '一些经常出现的人、地点和心情，会慢慢变成一本书的脉络。';
  }
  if (tagInsights) {
    const tags = summarizeRecentTopics(memories.slice(0, 6));
    tagInsights.innerHTML = tags.length
      ? tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')
      : '<span>今天</span><span>故事</span><span>慢慢说</span>';
  }
  if (dollText) {
    dollText.textContent = latest
      ? `“${getHomepageMemorySnippet(latest, 18)}”`
      : '像桌边的小小陪伴娃娃一样守着你，等你从今天的一件小事开始。';
  }
}

function initSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;
  recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    const input = document.getElementById('userInput');
    if (input) input.value = text;
  };
  recognition.onend = () => {
    recognizing = false;
    document.getElementById('voiceBtn')?.classList.remove('active');
  };
}

function toggleVoice() {
  if (!recognition) {
    alert('当前浏览器不支持语音识别，建议使用 Chrome。');
    return;
  }
  if (recognizing) {
    recognition.stop();
    recognizing = false;
    document.getElementById('voiceBtn')?.classList.remove('active');
    return;
  }
  recognition.start();
  recognizing = true;
  document.getElementById('voiceBtn')?.classList.add('active');
}

function renderChatHistory() {
  const box = document.getElementById('chatBox');
  if (!box) return;
  const settings = getSettings();
  const history = getChatHistory();
  if (history.length === 0) {
    box.innerHTML = `
      <div class="chat-empty">
        <p>可以从一个人、一张照片、一个地方开始。</p>
        <span>她会先听你说，再陪你慢慢把它收进书里。</span>
      </div>
    `;
    return;
  }
  box.innerHTML = history.map((item) => `
    <article class="message ${item.role === 'assistant' ? 'assistant' : 'user'}">
      <div class="message-bubble">
        <div class="message-name">${item.role === 'assistant' ? escapeHtml(settings.companionName) : '你'}</div>
        <div class="message-text">${escapeHtml(item.content)}</div>
      </div>
    </article>
  `).join('');
  box.scrollTop = box.scrollHeight;
}

function getLatestActiveCandidate() {
  return getMemoryCandidates().find((item) => !item.dismissed && item.memorySignal && item.summary);
}

function shouldSurfaceCandidateCue(candidate) {
  if (!candidate || candidate.dismissed || !candidate.memorySignal) return false;
  if (!candidate.summary || candidate.summary.length < 12) return false;
  if (candidate.confidence < 0.55) return false;
  return true;
}

function syncMemoryCandidatePanel() {
  const list = document.getElementById('memoryCandidateList');
  const toggle = document.getElementById('memoryCandidateToggle');
  if (!list || !toggle) return;
  const hasItems = !!list.children.length && !list.querySelector('.memory-empty');
  if (!hasItems) memoryCandidatesExpanded = false;
  list.classList.toggle('collapsed', !hasItems || !memoryCandidatesExpanded);
  list.style.maxHeight = hasItems && memoryCandidatesExpanded ? `${Math.min(list.scrollHeight, 460)}px` : '0px';
  toggle.hidden = !hasItems;
  toggle.textContent = memoryCandidatesExpanded ? '收起' : '展开';
}

function toggleMemoryCandidates() {
  const list = document.getElementById('memoryCandidateList');
  const toggle = document.getElementById('memoryCandidateToggle');
  if (!list || !toggle) return;
  memoryCandidatesExpanded = !memoryCandidatesExpanded;
  list.classList.toggle('collapsed', !memoryCandidatesExpanded);
  list.style.maxHeight = memoryCandidatesExpanded ? `${Math.min(list.scrollHeight, 460)}px` : '0px';
  toggle.textContent = memoryCandidatesExpanded ? '收起' : '展开';
}

function renderMemoryCueFloat() {
  const panel = document.getElementById('memoryCueFloat');
  if (!panel) return;
  const candidate = getLatestActiveCandidate();
  const hasContent = shouldSurfaceCandidateCue(candidate);
  panel.hidden = !hasContent;
  if (!hasContent) {
    panel.innerHTML = '';
    return;
  }

  panel.innerHTML = `
    <span class="page-kicker">轻轻记下</span>
    <p>${escapeHtml(candidate.summary || '我先替你记下了一点，等你想整理的时候再看。')}</p>
    <div class="memory-cue-actions">
      <button class="ghost-btn" onclick="dismissMemoryCue()">稍后再看</button>
      <button onclick="goToMemoryCandidates()">去忆光查看</button>
    </div>
  `;
}

function setCompanionStatus(text) {
  const status = document.getElementById('companionStatus');
  if (status) status.textContent = text;
}

function setAmbientQuote(text) {
  const quote = document.getElementById('ambientQuote');
  if (quote) quote.textContent = text;
}

function setStageMode(mode) {
  const stage = document.getElementById('companionStage');
  if (!stage) return;
  stage.dataset.mode = mode;
}

function getLastAssistantText() {
  const lastAssistant = [...getChatHistory()].reverse().find((item) => item.role === 'assistant' && String(item.content || '').trim());
  return String(lastAssistant?.content || '').trim();
}

function fallbackReply(text, emotion, memories) {
  const companionName = getSettings().companionName;
  const retrieved = memories[0];
  const memoryMention = retrieved ? readableMemoryTitle(retrieved) : '';
  const history = getChatHistory();
  const value = String(text || '').trim();
  const lastAssistant = getLastAssistantText();
  if (isGreetingLike(value)) {
    return `${companionName}在。你想轻松聊聊也行，想认真说点什么也行。`;
  }
  if (isMetaConversation(value)) {
    return '好，我收一点。这轮就按你字面上的意思听，不急着分析，也不急着整理。';
  }
  if (/^(无聊|有点无聊|没意思)$/.test(value)) {
    return '那我们就随便说几句，不用急着找话题。你现在想吐槽点什么也行。';
  }
  if (isMildComplaint(value)) {
    return '听见了，这种烦更像是一口闷气。你要是想说，就说说刚才最让你烦的是哪一下。';
  }
  if (/^(好吧|行吧|嗯好|那好吧)$/.test(value)) {
    return lastAssistant.includes('不急着替你下判断')
      ? '嗯，那我们就松一点。你想继续说就说，不想展开也没关系。'
      : '嗯，我跟着你。你想换个话题也可以。';
  }
  if (isCorrectionLike(value)) {
    return '是，我刚才理解偏了。你按你本来的意思再说一句，我这次只照着你的字面听。';
  }
  if (isShortBackchannel(value) || (value.length <= 6 && !/[，。！？!?]/.test(value))) {
    return lastAssistant.includes('不急着替你下判断')
      ? '嗯，我跟着听。你要是只想随口说一句，也可以。'
      : '我在听。你慢慢接着说，我先不急着替你下判断。';
  }
  if (history.length <= 2) {
    return `${companionName}在呢。我们就随便聊，不急着整理。`;
  }
  if (needsEmotionalSupport(value) && emotion === '难过') {
    return `${companionName}在这里。你可以慢一点说，我们先把眼前最在意的那件事说清楚。`;
  }
  if (emotion === '怀念' && retrieved && value.length >= 14) {
    return `你刚刚提到的内容，和“${memoryMention}”这页有些关联。你愿意的话，可以先告诉我那时候大概是什么年份，或者你大概多少岁。`;
  }
  if (retrieved && value.length >= 18) {
    return `我在认真听。你刚才提到的内容，和之前记下的一段回忆有些关联。要不要先说一个最确定的细节，比如那是谁、在哪儿、或者是什么时候？`;
  }
  return '我在认真听。你先按你想说的方式说就行，不用一下子说得很完整。';
}

function sanitizeAssistantReply(reply, userText, retrieval) {
  let output = String(reply || '').trim();
  const value = String(userText || '').trim();
  const responseMode = retrieval?.understanding?.responseMode || 'chatting';

  if (!output) return output;

  const suspiciousCountClaim = /连着说了两遍|说了两遍|重复了两遍|又说了一遍|两次提到/i.test(output);
  const repeatedChunks = value.match(/([\u4e00-\u9fa5a-zA-Z0-9]{2,})\s*\1/g) || [];
  const userHasRepeat = repeatedChunks.length > 0;
  if (suspiciousCountClaim && !userHasRepeat) {
    output = '';
  }

  const fabricatedScene = /旧相册|年轻的模样|某张照片|翻看照片|以前在.*时候|想起您以前|这让我想到您以前/.test(output);
  if (fabricatedScene && !retrieval?.memories?.length) {
    output = '';
  }

  const unsupportedMemoryClaim = /您之前提过|你之前提过|记得你提过|你说过|您说过/.test(output);
  if (unsupportedMemoryClaim && !retrieval?.memories?.length) {
    output = '';
  }

  const unsupportedPeople = Array.from(output.matchAll(/(?:赵姐|外孙|老伴|女儿|儿子|学生|爱人)/g)).map((item) => item[0]);
  const allowedPeople = new Set([
    ...(retrieval?.queryFeatures?.explicitPeople || []),
    ...((retrieval?.memories || []).flatMap((memory) => (memory.people || []).map((item) => item.name)))
  ]);
  if (unsupportedPeople.some((name) => !allowedPeople.has(name) && !value.includes(name))) {
    output = '';
  }

  if ((responseMode === 'small_talk' || responseMode === 'chatting') && /是不是/.test(output) && value.length <= 12) {
    output = '';
  }

  if ((responseMode === 'small_talk' || responseMode === 'chatting' || responseMode === 'relationship_signal') && /你是不是|是不是因为|听起来你是|我感觉你是|你一定是/.test(output)) {
    output = '';
  }

  if ((isCorrectionLike(value) || isMetaConversation(value)) && !/理解偏了|按你刚说的|照着你的意思|我收一点/.test(output)) {
    output = '';
  }

  const userTokens = tokenize(value).filter((token) => token.length >= 2);
  const replyTokens = tokenize(output).filter((token) => token.length >= 2);
  if (userTokens.length && replyTokens.length) {
    const overlap = userTokens.filter((token) => replyTokens.includes(token)).length / userTokens.length;
    const hasJudgment = /我觉得|我看|我先|更像|不一定|可以先|先别|不急着|先说|慢慢说/.test(output);
    if (overlap >= 0.8 && !hasJudgment) {
      output = '';
    }
  }

  return output.trim();
}

function readableMemoryTitle(memory) {
  const title = String(memory?.title || '').trim();
  if (!title || title.startsWith('我：') || title.startsWith('温伴：')) {
    return '那一页旧时光';
  }
  return title;
}

function compactText(text, limit = 42) {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/(我|温伴)：/g, '')
    .trim();
  if (!normalized) return '';
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function getHomepageMemorySnippet(memory, limit = 42) {
  if (!memory) return '';
  const preferred = memory.summary || memory.timelineLabel || memory.content;
  return compactText(preferred, limit);
}

function getMemoryExportText(history) {
  const recent = history.slice(-6);
  const userLines = recent
    .filter((item) => item.role === 'user')
    .map((item) => item.content.trim())
    .filter((line) => !/^(你好|温伴|对啊|对呢|我|没|好的?|嗯|哦|啊)$/.test(line))
    .filter((line) => !/傻啊|刚开始聊天|闲聊，不需要这么紧绷|我们不是刚开始聊天吗/.test(line))
    .filter(Boolean);
  const recap = getLastChatRecap();
  const combined = [recap.suggestedMemory, userLines.join(' ')].filter(Boolean).join(' ');
  return compactText(combined, 400) || '';
}

function candidateToDraftText(candidate) {
  if (!candidate) return '';
  return [candidate.summary, candidate.filteredText].filter(Boolean).join('。');
}

async function requestAI(text, retrieval, replyPlan = buildLocalReplyPlan(text, retrieval)) {
  const settings = getSettings();
  const profile = retrieval.profile;
  const emotion = detectEmotion(text);
  const intent = inferIntent(text);
  const history = getChatHistory().slice(-6).map((item) => ({
    role: item.role,
    content: item.content
  }));
  const voiceSamples = buildUserVoiceSamples();
  const memoryContext = retrieval.memories.length
    ? retrieval.memories.map((memory) => [
      `篇章：${memory.title}`,
      `概括：${memory.summary || memory.content.slice(0, 48)}`,
      `人物：${(memory.people || []).map((item) => item.name).join('、') || '无'}`,
      `时间：${(memory.timeRefs || []).join('、') || '无'}`,
      `地点：${(memory.locations || []).join('、') || '无'}`,
      `事件：${(memory.actions || []).join('、') || '无'}`,
      `命中片段：${(memory.retrievalHits || []).map((item) => `${item.type}:${item.text}`).join(' | ') || '无'}`,
      `内容：${memory.content}`
    ].join('；')).join('\n')
    : '暂无已召回篇章。';
  const profileContext = [
    profile.speakingStyle ? `她最近的说话习惯：${profile.speakingStyle}` : '',
    profile.worldview ? `她比较稳定的看法和价值取向：${profile.worldview}` : '',
    profile.userStyle?.talkingPace ? `她更舒服的聊天节奏：${profile.userStyle.talkingPace}` : '',
    profile.userStyle?.reactsWellTo?.length ? `她通常更接受这样的回应方式：${profile.userStyle.reactsWellTo.join('、')}` : '',
    profile.userStyle?.reactsPoorlyTo?.length ? `她通常不喜欢这样的回应方式：${profile.userStyle.reactsPoorlyTo.join('、')}` : '',
    profile.userStyle?.anchorTopics?.length ? `她常会围绕这些话题展开：${profile.userStyle.anchorTopics.join('、')}` : '',
    profile.userStyle?.humorStyle ? `她能接受的玩笑和轻松感：${profile.userStyle.humorStyle}` : '',
    profile.likes?.length ? `她明确喜欢的事：${profile.likes.join('、')}` : '',
    profile.habits?.length ? `她常提到的习惯：${profile.habits.join('、')}` : '',
    profile.goals?.length ? `她当前在意的目标：${profile.goals.join('、')}` : '',
    profile.dislikes?.length ? `她明确不喜欢的事：${profile.dislikes.join('、')}` : '',
    profile.importantPeople?.length ? `她常提到的重要人物：${profile.importantPeople.join('、')}` : '',
    profile.keyMemories?.length ? `她希望被记住的长期回忆主题：${profile.keyMemories.join('、')}` : ''
  ].filter(Boolean).join('\n');
  const profileSignalContext = retrieval.profileSignals.length
    ? retrieval.profileSignals.map((item) => `${item.type}：${item.value}`).join('\n')
    : '暂无额外命中的长期画像。';
  const lifeSummaryContext = retrieval.lifeSummaries?.length
    ? retrieval.lifeSummaries.map((item) => `${item.type}:${item.label}｜${item.summary}`).join('\n')
    : '暂无命中的人生线摘要。';
  const pendingQuestionContext = retrieval.pendingTimeQuestions.length
    ? retrieval.pendingTimeQuestions.join('\n')
    : '暂无待补时间问题。';
  const strategyTrailContext = summarizeStrategyTrail();
  const rhythm = buildRhythmState(text, retrieval);

  const prompt = [
    '# 角色',
    `你是“${settings.companionName}”，一个温柔、克制的数字陪伴者。你正在陪伴 ${profile.name}（${profile.role}）。${profile.family ? `她明确提过的家庭信息只有：${profile.family}。` : '如果没有用户明确说过，不要假设她的家庭成员。'}`,
    '',
    '# 核心原则（优先级从高到低）',
    '1. 接住情绪，而非推进信息。',
    `优先回应当前情绪“${emotion}”，而不是急于追问或挖掘内容。`,
    '轻微吐槽、嫌烦、无语、纠正你，并不自动等于用户需要安抚。遇到这类内容，优先回到字面、放轻一点，不要立刻上情绪支持强度。',
    '如果用户表达模糊，先帮她轻轻整理当前这句话，不要自己补全。',
    '2. 只用明确知道的事实。',
    '可提及的内容必须来自【召回内容】，而且必须是明确出现过的事实。',
    `如果缺少细节，只追问一个具体的小问题；如果这一轮判断是不该追问，就不要问。建议问题：${replyPlan.shouldAsk ? (replyPlan.suggestedQuestion || pendingQuestionContext) : '本轮不追问'}`,
    '3. 保持克制的陪伴感。',
    '不使用括号内的舞台说明。',
    '不扩写画面、不联想往事、不推断记忆。',
    '',
    '# 什么时候不要追问',
    '如果用户只是寒暄、附和、短回应、重复对方的话，或者主要是在表达情绪，这一轮可以只接住，不一定追问。',
    '如果用户这轮信息很少，就老老实实接话、确认、陪伴，不要为了显得懂而借题发挥。',
    '如果用户是在纠正你，先承认理解偏了，再照着她刚说的话重来，不要继续沿着旧理解往下说。',
    '',
    '# 什么时候不要提旧记忆',
    '只有当【召回内容】和当前输入明显贴合时，才可以自然接上。',
    '如果只是弱相关、模糊相关，宁可不提过去，也不要硬拉旧回忆进来。',
    '绝对不要把一句普通回应，扩写成具体画面或往事。例如用户只说一次“是啊”，不能说成“连说两遍”，也不能擅自联想到旧相册、年轻时候、某张照片。',
    '不要根据语气词、停顿、重复字，推断出具体记忆内容。除非用户明确说了，否则不要补“您想起了……”之类的句子。',
    '不要把你自己上一轮说过的话当成事实来源，更不要沿着自己猜的内容继续展开。',
    '不要把轻微抱怨自动解释成“委屈、伤心、脆弱”。',
    '不要动不动使用“听起来你……”“是不是因为……”这类心理推断句式，除非用户已经明确说出了那个情绪或原因。',
    '',
    '# 当前情境',
    `- 用户情绪：${emotion}`,
    `- 对话意图：${intent}`,
    `- 回应策略：${replyPlan.responseMode || retrieval.understanding?.responseMode || 'chatting'}`,
    `- 这一轮你的判断：${replyPlan.selfJudgment || '先自然接话'}`,
    `- 这一轮回复目标：${replyPlan.replyGoal || '先接住用户这句话'}`,
    `- 明确提到的人物：${retrieval.queryFeatures?.explicitPeople?.join('、') || '无'}`,
    `- 明确提到的时间：${retrieval.queryFeatures?.timeRefs?.join('、') || '无'}`,
    `- 最近几轮策略：\n${strategyTrailContext}`,
    `- 当前节奏状态：最近追问 ${rhythm.recentAskCount} 次；最近情绪支持 ${rhythm.recentSupportCount} 次；最近短回应 ${rhythm.recentThinCount} 次；本轮${rhythm.currentInfoRich ? '有新信息' : '信息较少'}。`,
    '',
    '# 可以参考的素材（按可信度排序）',
    '1. 【召回内容】（最可信，但不可编造）',
    memoryContext,
    '',
    '2. 【最近对话】（用于接续语境）',
    retrieval.recentConversation || '无',
    '',
    '3. 【待补问题】（若真的需要追问，只选其中一条）',
    pendingQuestionContext,
    '',
    '4. 【用户表达样本】（仅参考语气轻重和节奏）',
    voiceSamples || '无',
    '',
    '# 长期用户画像（辅助理解，不作为事实来源）',
    profileContext || '无',
    profileSignalContext || '无',
    '',
    '# 人生线摘要（辅助你理解“这是一条什么线”，但不能拿来编造细节）',
    lifeSummaryContext,
    '',
    '# 回复要求',
    '像人，不像客服。不列点，不机械。',
    '先准确确认用户刚说的话，再决定是否轻轻追问一句。',
    '如果这轮信息很少，就陪伴、接话，不借题发挥。',
    '不要只是换个说法重复用户原句。每次回复至少提供一种新价值：接住情绪、给出判断、帮她理顺、或提出一个具体小问题。',
    '如果你没有新的判断，就宁可简短陪伴，也不要复读。',
    '如果最近一两轮已经连续追问过，这一轮优先收一收，除非用户明显主动继续展开。',
    '如果最近两轮都更偏情绪支持，就不要突然切成分析或整理口气。',
    '如果最近连续是短回应，或者这一轮也没有多少新信息，就降低整理欲望，先当普通聊天接住。',
    '如果用户在纠正你，比如说“你没听懂”“我不是这个意思”，要立刻退回字面理解，先承认刚才理解偏了，再只根据用户刚说的内容回应。',
    '如果用户只是轻微吐槽或说“烦、无语、无聊”，先当普通聊天接住，最多顺手问一个非常具体的小问题，不要立刻进入安抚模式。',
    '你可以参考“人生线摘要”判断这句话更像人物线、时间线还是心绪线，但不能把摘要里的概括展开成用户没有说过的新事实。',
    '当回应策略是 small_talk 或 emotional_support 时，优先接话和情感支持，不要主动整理成记忆，也不要强行追问时间。',
    '当回应策略是 relationship_signal 时，可以顺着当前人物自然聊一句，但不要立刻当成完整回忆。',
    '当回应策略是 memory_narrative 或 memory_capture 时，才更适合轻轻整理和追问一个具体缺口。',
    '绝对不要编造用户没有明确说过的人名、地点、经历、衣服颜色、职业细节、往事场景。',
    '控制在 35 到 80 字。'
  ].filter(Boolean).join('\n');

  const response = await fetch('http://localhost:3001/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: prompt },
        ...history,
        { role: 'user', content: text }
      ]
    })
  });

  if (!response.ok) {
    throw new Error('AI 接口异常');
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim();
}

async function talk() {
  const input = document.getElementById('userInput');
  const text = input?.value.trim();
  if (!text) return;

  const history = getChatHistory();
  history.push({ role: 'user', content: text, createdAt: nowString() });
  setChatHistory(history);
  renderChatHistory();
  input.value = '';

  const emotion = detectEmotion(text);
  const retrieval = buildChatRetrieval(text);
  const memories = retrieval.memories;
  const replyPlan = await requestReplyPlan(text, retrieval);
  const responseMode = replyPlan.responseMode || retrieval.understanding?.responseMode || 'chatting';
  const rhythm = buildRhythmState(text, retrieval);
  setStageMode(emotion === '难过' ? 'comfort' : emotion === '怀念' ? 'reminisce' : 'listening');
  setCompanionStatus(
    responseMode === 'emotional_support'
      ? '她正轻轻接住你的情绪'
      : responseMode === 'small_talk'
        ? '她在安静接住你这句日常的话'
        : responseMode === 'relationship_signal'
          ? '她先记住了你提到的这个人'
          : responseMode === 'memory_narrative' || responseMode === 'memory_capture'
            ? '她正在顺着你的话慢慢理清这一段'
            : '她正在认真听你继续往下说'
  );
  setAmbientQuote(memories[0]?.title || '有些故事不急着说完，今天也可以只说一小段。');

  try {
    setStageMode('thinking');
    const reply = await requestAI(text, retrieval, replyPlan);
    const finalReply = sanitizeAssistantReply(reply, text, retrieval) || fallbackReply(text, emotion, memories);
    history.push({
      role: 'assistant',
      content: finalReply,
      createdAt: nowString()
    });
    setChatHistory(history);
    renderChatHistory();
    const recap = await requestChatRecap(text, finalReply, retrieval);
    const memoryCandidate = await requestMemoryFilter(text, retrieval, replyPlan);
    pushStrategyTrail({
      responseMode: replyPlan.responseMode,
      selfJudgment: replyPlan.selfJudgment,
      shouldAsk: replyPlan.shouldAsk,
      emotion,
      userText: text,
      infoRich: rhythm.currentInfoRich
    });
    setLastChatRecap(recap);
    if (memoryCandidate.memorySignal && memoryCandidate.summary) {
      upsertMemoryCandidate(memoryCandidate, recap);
      renderMemoryCueFloat();
    } else {
      renderMemoryCueFloat();
    }
    setCompanionStatus(recap.selfJudgment || replyPlan.selfJudgment || recap.status);
    setAmbientQuote(recap.quote || memories[0]?.title || '有些故事不急着说完，今天也可以只说一小段。');
  } catch (error) {
    const finalReply = fallbackReply(text, emotion, memories);
    history.push({
      role: 'assistant',
      content: finalReply,
      createdAt: nowString()
    });
    console.error(error);
    setChatHistory(history);
    renderChatHistory();
    const recap = buildConversationRecap(text, retrieval);
    const memoryCandidate = buildLocalMemoryFilter(text, retrieval, replyPlan);
    pushStrategyTrail({
      responseMode: replyPlan.responseMode,
      selfJudgment: replyPlan.selfJudgment,
      shouldAsk: false,
      emotion,
      userText: text,
      infoRich: rhythm.currentInfoRich
    });
    setLastChatRecap(recap);
    if (memoryCandidate.memorySignal && memoryCandidate.summary) {
      upsertMemoryCandidate(memoryCandidate, recap);
      renderMemoryCueFloat();
    } else {
      renderMemoryCueFloat();
    }
    setCompanionStatus(replyPlan.selfJudgment || recap.status);
    setAmbientQuote(recap.quote);
  }

  setChatHistory(history);
  renderChatHistory();
  setStageMode(emotion === '难过' ? 'comfort' : emotion === '怀念' ? 'reminisce' : 'idle');
  updateProfileInsights(text);
}

function exportLastToMemory() {
  const history = getChatHistory();
  if (history.length < 2) {
    alert('先和她说上一小段，再收进书里吧。');
    return;
  }
  const trigger = document.activeElement;
  if (trigger instanceof HTMLButtonElement) trigger.disabled = true;
  const candidate = getLatestActiveCandidate();
  const recent = candidate ? candidateToDraftText(candidate) : getMemoryExportText(history);
  requestMemoryDraft(recent, candidate ? '候选线索整理' : '温伴摘录')
    .then((draft) => {
      openMemoryDraftModal(candidate ? { ...draft, candidateId: candidate.id } : draft);
      setAmbientQuote('先看一眼这页草稿，再决定要不要留下。');
    })
    .finally(() => {
      if (trigger instanceof HTMLButtonElement) trigger.disabled = false;
    });
}

function clearChatHistory() {
  setChatHistory([]);
  setLastChatRecap({ suggestedMemory: '', status: '', quote: '' });
  setStrategyTrail([]);
  renderChatHistory();
  renderMemoryCueFloat();
  setCompanionStatus('她会在这里等你再次开口');
  setStageMode('idle');
}

function dismissMemoryCue(silent = false) {
  const latest = getLatestActiveCandidate();
  if (latest) {
    dismissMemoryCandidate(latest.id);
  }
  setLastChatRecap({ suggestedMemory: '', status: '', quote: '', personUnderstanding: '', missingInfo: '' });
  renderMemoryCueFloat();
  if (!silent) {
    setCompanionStatus('她会先把这一轮放下，等你继续往下说。');
  }
}

function goToMemoryCandidates() {
  window.location.href = 'memory.html';
}

function renderMemoryCandidates() {
  const list = document.getElementById('memoryCandidateList');
  if (!list) return;
  const candidates = getMemoryCandidates().filter((item) => !item.dismissed && item.memorySignal);
  if (!candidates.length) {
    list.innerHTML = '<div class="memory-empty">最近聊天里还没有提炼出适合整理的线索。</div>';
    syncMemoryCandidatePanel();
    return;
  }

  list.innerHTML = candidates.map((candidate) => `
    <article class="memory-candidate-card">
      <div class="memory-candidate-top">
        <div>
          <strong>${escapeHtml(candidate.summary || '一条待整理线索')}</strong>
          <span>${escapeHtml(candidate.createdAt)}</span>
        </div>
        <em>${escapeHtml(candidate.candidateType === 'person_clue' ? '人物线索' : candidate.candidateType === 'timeline_memory' ? '时间线索' : candidate.candidateType === 'daily_fragment' ? '今日片段' : candidate.candidateType === 'event_memory' ? '事件片段' : candidate.candidateType === 'emotion_note' ? '心情片段' : '待整理')}</em>
      </div>
      ${(candidate.narrative || candidate.filteredText) ? `<p>${escapeHtml(candidate.narrative || candidate.filteredText)}</p>` : ''}
      <div class="memory-candidate-meta">
        ${(candidate.people || []).map((name) => `<span><strong>人物</strong>${escapeHtml(name)}</span>`).join('')}
        ${candidate.timeType && candidate.timeType !== 'none' ? `<span><strong>时间</strong>${escapeHtml(candidate.timeType === 'present' ? '今天/刚刚' : candidate.timeType === 'relative' ? '相对时间' : candidate.timeType === 'exact' ? '确切时间' : '待补')}</span>` : ''}
      </div>
      ${(candidate.missingPieces || []).length ? `<div class="memory-candidate-missing">还缺：${escapeHtml(candidate.missingPieces.join('、'))}</div>` : ''}
      ${candidate.followUpHint ? `<div class="memory-follow-up">${escapeHtml(candidate.followUpHint)}</div>` : ''}
      <div class="memory-candidate-actions">
        <button class="ghost-btn" onclick="discardCandidate('${candidate.id}')">先删掉</button>
        <button onclick="promoteCandidateToDraft('${candidate.id}')">整理成草稿</button>
      </div>
    </article>
  `).join('');
  syncMemoryCandidatePanel();
}

function discardCandidate(candidateId) {
  removeMemoryCandidate(candidateId);
  renderMemoryCandidates();
  renderMemoryCueFloat();
}

function promoteCandidateToDraft(candidateId) {
  const candidate = getMemoryCandidates().find((item) => item.id === candidateId);
  if (!candidate) return;
  const sourceText = candidateToDraftText(candidate);
  requestMemoryDraft(sourceText, '聊天线索整理')
    .then((draft) => {
      openMemoryDraftModal({
        ...draft,
        candidateId: candidate.id
      });
    });
}

function renderMemories(filter = '') {
  const list = document.getElementById('memoryList');
  if (!list) return;
  const normalizedFilter = String(filter || '').trim().toLowerCase();
  const memories = getMemories().filter((memory) => !normalizedFilter || getMemorySearchText(memory).includes(normalizedFilter));
  if (!memories.length) {
    list.innerHTML = '<div class="memory-empty">这一页还没有写下内容。</div>';
    return;
  }
  list.innerHTML = memories.map((memory, index) => `
    <article class="memory-entry ${activeMemoryId === memory.id ? 'expanded' : ''}" style="animation-delay:${0.12 * index}s" onclick="toggleMemoryExpand('${memory.id}')">
      <div class="memory-ribbon">${escapeHtml(memory.mood)}</div>
      <div class="memory-body">
        <div class="memory-topline">
          <h3>${escapeHtml(memory.title)}</h3>
          <span>${escapeHtml(memory.createdAt)}</span>
        </div>
        <div class="memory-preview">${escapeHtml(memory.content)}</div>
        ${renderStructuredBadges(memory)}
        <div class="memory-details" onclick="event.stopPropagation()">
          <div class="memory-content">${escapeHtml(memory.content)}</div>
          ${(memory.tags || []).length ? `
            <div class="memory-tag-row">
              ${(memory.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
          <div class="memory-inline-editor">
            <label>
              <span>标题</span>
              <input id="memoryEditTitle-${memory.id}" type="text" value="${escapeHtml(memory.title)}" onclick="event.stopPropagation()" />
            </label>
            <label>
              <span>心绪</span>
              <input id="memoryEditMood-${memory.id}" type="text" value="${escapeHtml(memory.mood || '')}" onclick="event.stopPropagation()" />
            </label>
            <label class="wide">
              <span>标签</span>
              <input id="memoryEditTags-${memory.id}" type="text" value="${escapeHtml((memory.tags || []).join('、'))}" onclick="event.stopPropagation()" />
            </label>
            <label class="wide">
              <span>这一页写了什么</span>
              <textarea id="memoryEditContent-${memory.id}" onclick="event.stopPropagation()">${escapeHtml(memory.content)}</textarea>
            </label>
          </div>
          <div class="memory-bottomline">
            <button class="ghost-btn" onclick="event.stopPropagation(); toggleMemoryExpand('${memory.id}')">${activeMemoryId === memory.id ? '先收起' : '展开这一页'}</button>
            ${activeMemoryId === memory.id ? `<button onclick="event.stopPropagation(); saveMemoryEdit('${memory.id}')">保存修改</button>` : ''}
            <button onclick="event.stopPropagation(); reuseMemory('${memory.id}')">继续聊这一页</button>
            <button class="ghost-btn" onclick="event.stopPropagation(); deleteMemory('${memory.id}')">删除这一页</button>
          </div>
        </div>
        ${activeMemoryId !== memory.id ? `
          <div class="memory-collapsed-actions">
            <button class="ghost-btn" onclick="event.stopPropagation(); toggleMemoryExpand('${memory.id}')">展开这一页</button>
          </div>
        ` : ''}
      </div>
    </article>
  `).join('');
  autosizeMemoryEditors();
  syncMemoryCardHeights(list);
}

function deleteMemory(memoryId) {
  if (!window.confirm('要删除这一页记忆吗？删除后不会保留。')) return;
  setMemories(getMemories().filter((memory) => memory.id !== memoryId));
  if (activeMemoryId === memoryId) {
    activeMemoryId = null;
  }
  populateSharedCopy();
  renderCoverHighlights();
  renderCoverWidgets();
  renderMemoryCandidates();
  renderMemories(document.getElementById('memorySearch')?.value.trim() || '');
  renderMemoryMap();
}

function reuseMemory(memoryId) {
  const memory = getMemories().find((item) => item.id === memoryId);
  if (!memory) return;
  localStorage.setItem('life_book_memory_draft_v3', `我想继续聊聊这一页：${memory.title}。${memory.content}`);
  window.location.href = 'chat.html';
}

function toggleMemoryExpand(memoryId) {
  activeMemoryId = activeMemoryId === memoryId ? null : memoryId;
  renderMemories(document.getElementById('memorySearch')?.value.trim() || '');
}

function normalizeTags(raw) {
  const parsed = String(raw || '')
    .split(/[、，,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  return normalizeMeaningfulTags(parsed, 6);
}

async function saveMemoryEdit(memoryId = activeMemoryId) {
  if (!memoryId) return;

  const memories = getMemories();
  const index = memories.findIndex((item) => item.id === memoryId);
  const target = memories[index];
  if (!target) return;

  const nextContent = document.getElementById(`memoryEditContent-${memoryId}`)?.value.trim();
  const edited = normalizeMemory({
    ...target,
    title: document.getElementById(`memoryEditTitle-${memoryId}`)?.value.trim() || target.title,
    content: nextContent || target.content,
    mood: document.getElementById(`memoryEditMood-${memoryId}`)?.value.trim() || detectEmotion(nextContent || target.content),
    tags: normalizeTags(document.getElementById(`memoryEditTags-${memoryId}`)?.value)
  });

  memories[index] = await enrichMemory(edited);
  setMemories(memories);
  renderMemoryCandidates();
  renderMemories(document.getElementById('memorySearch')?.value.trim() || '');
  renderMemoryMap();
  renderCoverHighlights();
  renderCoverWidgets();
  populateSharedCopy();
  alert('这一页已经更新。');
}

function syncDraft() {
  const draft = localStorage.getItem('life_book_memory_draft_v3');
  const input = document.getElementById('userInput');
  if (draft && input) {
    input.value = draft;
    localStorage.removeItem('life_book_memory_draft_v3');
  }
}

async function generateMemory() {
  const textarea = document.getElementById('memoryInput');
  const text = textarea?.value.trim();
  if (!text) {
    alert('先写下一小段故事。');
    return;
  }
  const trigger = document.activeElement;
  if (trigger instanceof HTMLButtonElement) trigger.disabled = true;
  const draft = await requestMemoryDraft(text, '手动记录');
  textarea.value = '';
  openMemoryDraftModal(draft);
  if (trigger instanceof HTMLButtonElement) trigger.disabled = false;
}

async function aiGenerateMemory() {
  const textarea = document.getElementById('memoryInput');
  const text = textarea?.value.trim();
  if (!text) {
    alert('先写下一小段故事。');
    return;
  }

  const trigger = document.activeElement;
  if (trigger instanceof HTMLButtonElement) trigger.disabled = true;

  try {
    const response = await fetch('http://localhost:3001/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: [
              `你是“${getSettings().companionName}”。`,
              '请把用户刚说的内容整理成适合收进人生之书的一小段文字。',
              '只能重写和压缩用户已明确说过的事实，不能补充新的经历、人物细节、场景、颜色、职业或关系。',
              '如果原文信息很少，就简短保留，不要为了好看而扩写。',
              '不要写舞台说明，不要诗化表演，长度控制在 70 到 110 字。'
            ].join('\n')
          },
          {
            role: 'user',
            content: text
          }
        ]
      })
    });

    if (!response.ok) throw new Error('AI 接口异常');
    const data = await response.json();
    const polished = data.choices?.[0]?.message?.content?.trim() || text;
    const draft = await requestMemoryDraft(polished, '请她帮我整理');
    openMemoryDraftModal(draft);
  } catch (error) {
    const draft = await requestMemoryDraft(text, '手动记录');
    openMemoryDraftModal(draft);
    console.error(error);
    alert('没有成功接上整理模型，先给你一版原话草稿。');
  }

  textarea.value = '';
  if (trigger instanceof HTMLButtonElement) trigger.disabled = false;
}

function fillSettingsForm() {
  const profile = getProfile();
  const settings = getSettings();
  const mapping = {
    profileNameInput: profile.name,
    profileRoleInput: profile.role,
    profileFamilyInput: profile.family,
    profilePreferencesInput: profile.preferences,
    profileToneInput: profile.tone,
    profileSpeakingStyleInput: profile.speakingStyle,
    profileWorldviewInput: profile.worldview,
    profileLikesInput: (profile.likes || []).join('、'),
    profileHabitsInput: (profile.habits || []).join('、'),
    profileGoalsInput: (profile.goals || []).join('、'),
    profileDislikesInput: (profile.dislikes || []).join('、'),
    profilePeopleInput: (profile.importantPeople || []).join('、'),
    profileMemoriesInput: (profile.keyMemories || []).join('、'),
    companionNameInput: settings.companionName,
    accentInput: settings.accent,
    fontSizeInput: settings.fontSize
  };
  Object.entries(mapping).forEach(([id, value]) => {
    const node = document.getElementById(id);
    if (node) node.value = value;
  });
}

function saveSettingsForm() {
  setProfile({
    name: document.getElementById('profileNameInput')?.value.trim() || DEFAULT_PROFILE.name,
    role: document.getElementById('profileRoleInput')?.value.trim() || DEFAULT_PROFILE.role,
    family: document.getElementById('profileFamilyInput')?.value.trim() || DEFAULT_PROFILE.family,
    preferences: document.getElementById('profilePreferencesInput')?.value.trim() || DEFAULT_PROFILE.preferences,
    tone: document.getElementById('profileToneInput')?.value.trim() || DEFAULT_PROFILE.tone,
    speakingStyle: document.getElementById('profileSpeakingStyleInput')?.value.trim(),
    worldview: document.getElementById('profileWorldviewInput')?.value.trim(),
    likes: uniqueStrings((document.getElementById('profileLikesInput')?.value || '').split(/[、，,\n]+/), 8),
    habits: uniqueStrings((document.getElementById('profileHabitsInput')?.value || '').split(/[、，,\n]+/), 8),
    goals: uniqueStrings((document.getElementById('profileGoalsInput')?.value || '').split(/[、，,\n]+/), 8),
    dislikes: uniqueStrings((document.getElementById('profileDislikesInput')?.value || '').split(/[、，,\n]+/), 8),
    importantPeople: uniqueStrings((document.getElementById('profilePeopleInput')?.value || '').split(/[、，,\n]+/), 8),
    keyMemories: uniqueStrings((document.getElementById('profileMemoriesInput')?.value || '').split(/[、，,\n]+/), 8)
  });
  setSettings({
    companionName: document.getElementById('companionNameInput')?.value.trim() || DEFAULT_SETTINGS.companionName,
    accent: document.getElementById('accentInput')?.value || DEFAULT_SETTINGS.accent,
    fontSize: document.getElementById('fontSizeInput')?.value || DEFAULT_SETTINGS.fontSize
  });
  updateTheme();
  populateSharedCopy();
  renderCoverWidgets();
  fillSettingsForm();
  alert('书页气质已经更新。');
}

function installSearch() {
  const search = document.getElementById('memorySearch');
  if (!search) return;
  search.addEventListener('input', () => {
    renderMemories(search.value.trim());
  });
}

function installMemoryMapControls() {
  const search = document.getElementById('memoryMapSearch');
  const view = document.getElementById('memoryMapView');
  if (search) {
    search.addEventListener('input', renderMemoryMap);
  }
  if (view) {
    view.addEventListener('change', renderMemoryMap);
  }
}

function installInputSubmit() {
  const input = document.getElementById('userInput');
  if (!input) return;
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      talk();
    }
  });
  input.addEventListener('input', () => {
    setStageMode(input.value.trim() ? 'listening' : 'idle');
  });
}

function mountLive2D() {
  if (!window.L2Dwidget || !document.body.dataset.live2d) return;
  const mode = document.body.dataset.live2d;
  const book = document.querySelector('.open-book, .book-cover');
  const stage = document.querySelector('.companion-stage');
  const coverStage = document.getElementById('coverDollStage');
  const bookRect = book?.getBoundingClientRect();
  const stageRect = stage?.getBoundingClientRect();
  const coverRect = coverStage?.getBoundingClientRect();

  let display = {
    position: 'right',
    width: 180,
    height: 360,
    hOffset: 24,
    vOffset: 8
  };

  if (mode === 'chat' && stageRect && bookRect) {
    display = {
      position: 'left',
      width: Math.round(Math.min(220, Math.max(170, stageRect.width * LIVE2D_TUNE.chatWidthRatio))),
      height: Math.round(Math.min(410, Math.max(320, stageRect.height * LIVE2D_TUNE.chatHeightRatio))),
      hOffset: Math.round(stageRect.left + stageRect.width * 0.14 + LIVE2D_TUNE.chatOffsetX),
      vOffset: Math.max(0, Math.round(window.innerHeight - stageRect.bottom + LIVE2D_TUNE.chatOffsetY))
    };
  } else if (mode === 'cover' && coverRect) {
    display = {
      position: 'left',
      width: Math.round(Math.min(210, Math.max(160, coverRect.width * 0.34))),
      height: Math.round(Math.min(360, Math.max(280, coverRect.height * 0.7))),
      hOffset: Math.round(coverRect.left + coverRect.width * 0.31),
      vOffset: Math.max(0, Math.round(window.innerHeight - coverRect.bottom + 18))
    };
  }

  window.L2Dwidget.init({
    model: {
      jsonPath: 'https://unpkg.com/live2d-widget-model-hijiki/assets/hijiki.model.json'
    },
    display,
    mobile: {
      show: true,
      scale: 0.8
    },
    react: {
      opacityDefault: 0.96,
      opacityOnHover: 1
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  ensureSeedData();
  ensureMemoryDraftModal();
  updateTheme();
  populateSharedCopy();
  renderCoverHighlights();
  renderCoverWidgets();
  renderChatHistory();
  renderMemoryCueFloat();
  renderMemoryCandidates();
  renderMemories();
  renderMemoryMap();
  fillSettingsForm();
  installSearch();
  installMemoryMapControls();
  installInputSubmit();
  initSpeech();
  syncDraft();
  setCompanionStatus('她正在轻轻看着你');
  setAmbientQuote(getMemories()[0]?.title || '今天也许会翻开新的一页。');
  setStageMode('idle');
  window.setTimeout(mountLive2D, 120);
});

window.addEventListener('storage', (event) => {
  if (![STORAGE_KEYS.memories, STORAGE_KEYS.memoryCandidates, STORAGE_KEYS.profile, STORAGE_KEYS.lifeSummaries].includes(event.key)) return;
  personSummaryCache.clear();
  populateSharedCopy();
  renderCoverHighlights();
  renderCoverWidgets();
  renderMemoryCueFloat();
  renderMemoryCandidates();
  renderMemories(document.getElementById('memorySearch')?.value.trim() || '');
  renderMemoryMap();
});
