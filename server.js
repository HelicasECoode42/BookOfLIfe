import express from 'express';
import cors from 'cors';
import axios from 'axios';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const MODEL_NAME = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

function extractJsonBlock(content) {
  const text = String(content || '').trim();
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const direct = text.match(/\{[\s\S]*\}/);
  return direct ? direct[0] : text;
}

function sanitizeStringList(list, limit = 8) {
  if (!Array.isArray(list)) return [];
  return Array.from(new Set(
    list
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )).slice(0, limit);
}

function sanitizePeople(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => ({
      name: String(item?.name || '').trim(),
      relation: String(item?.relation || '').trim(),
      role: String(item?.role || '').trim()
    }))
    .filter((item) => item.name)
    .slice(0, 8);
}

function normalizeMemoryStructure(data = {}) {
  return {
    title: String(data.title || '').trim(),
    summary: String(data.summary || '').trim(),
    mood: String(data.mood || '').trim(),
    people: sanitizePeople(data.people),
    timeRefs: sanitizeStringList(data.timeRefs),
    timelineDate: String(data.timelineDate || '').trim(),
    timelineLabel: String(data.timelineLabel || '').trim(),
    timeAccuracy: String(data.timeAccuracy || '').trim(),
    followUpQuestion: String(data.followUpQuestion || '').trim(),
    locations: sanitizeStringList(data.locations),
    actions: sanitizeStringList(data.actions),
    tags: sanitizeStringList(data.tags, 10),
    retrievalText: String(data.retrievalText || '').trim(),
    embedding: null
  };
}

function normalizePersonSummary(data = {}) {
  return {
    summary: String(data.summary || '').trim(),
    relationLabel: String(data.relationLabel || '').trim(),
    personImpression: String(data.personImpression || '').trim(),
    sharedMoments: sanitizeStringList(data.sharedMoments, 4),
    userView: String(data.userView || '').trim(),
    personView: String(data.personView || '').trim(),
    openQuestions: sanitizeStringList(data.openQuestions, 3)
  };
}

function normalizeChapterCompose(data = {}) {
  return {
    title: String(data.title || '').trim(),
    narrative: String(data.narrative || '').trim(),
    timeline: String(data.timeline || '').trim(),
    anchors: sanitizeStringList(data.anchors, 5),
    openThreads: sanitizeStringList(data.openThreads, 4)
  };
}

function normalizeChatRecap(data = {}) {
  return {
    userUnderstanding: String(data.userUnderstanding || '').trim(),
    personUnderstanding: String(data.personUnderstanding || '').trim(),
    missingInfo: String(data.missingInfo || '').trim(),
    suggestedMemory: String(data.suggestedMemory || '').trim(),
    selfJudgment: String(data.selfJudgment || '').trim()
  };
}

function normalizeReplyPlan(data = {}) {
  return {
    responseMode: String(data.responseMode || '').trim(),
    selfJudgment: String(data.selfJudgment || '').trim(),
    replyGoal: String(data.replyGoal || '').trim(),
    memorySignal: Boolean(data.memorySignal),
    reason: String(data.reason || '').trim(),
    shouldAsk: Boolean(data.shouldAsk),
    suggestedQuestion: String(data.suggestedQuestion || '').trim()
  };
}

function normalizeMemoryFilter(data = {}) {
  return {
    filteredText: String(data.filteredText || '').trim(),
    memorySignal: Boolean(data.memorySignal),
    candidateType: String(data.candidateType || '').trim(),
    confidence: Math.max(0, Math.min(1, Number(data.confidence || 0) || 0)),
    people: sanitizeStringList(data.people, 6),
    timeType: String(data.timeType || '').trim(),
    isComplete: Boolean(data.isComplete),
    summary: String(data.summary || '').trim(),
    narrative: String(data.narrative || '').trim(),
    missingPieces: sanitizeStringList(data.missingPieces, 4),
    followUpHint: String(data.followUpHint || '').trim(),
    noiseFiltered: sanitizeStringList(data.noiseFiltered, 8),
    reason: String(data.reason || '').trim()
  };
}

function normalizeLifeSummary(data = {}) {
  return {
    id: String(data.id || '').trim(),
    type: String(data.type || '').trim(),
    label: String(data.label || '').trim(),
    summary: String(data.summary || '').trim(),
    evidenceCount: Math.max(0, Number(data.evidenceCount || 0) || 0),
    people: sanitizeStringList(data.people, 6),
    tags: sanitizeStringList(data.tags, 6),
    updatedAt: String(data.updatedAt || '').trim()
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: MODEL_NAME,
    hasApiKey: Boolean(DEEPSEEK_KEY)
  });
});

app.post('/api/ai', async (req, res) => {
  if (!DEEPSEEK_KEY) {
    res.status(500).json({
      error: 'Missing DEEPSEEK_API_KEY in environment.'
    });
    return;
  }

  try {
    const { messages } = req.body;
    const response = await axios.post(
      DEEPSEEK_URL,
      {
        model: MODEL_NAME,
        messages,
        temperature: 0.28,
        max_tokens: 400
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    const detail = error.response?.data || error.message;
    res.status(500).json({
      error: 'DeepSeek request failed.',
      detail
    });
  }
});

app.post('/api/memory-summary', async (req, res) => {
  if (!DEEPSEEK_KEY) {
    res.status(500).json({
      error: 'Missing DEEPSEEK_API_KEY in environment.'
    });
    return;
  }

  try {
    const { personName, memories = [] } = req.body || {};
    if (!String(personName || '').trim()) {
      res.status(400).json({ error: 'Missing personName.' });
      return;
    }

    const normalizedMemories = Array.isArray(memories) ? memories.slice(0, 8) : [];
    const content = normalizedMemories.map((item, index) => [
      `第${index + 1}段`,
      `标题：${String(item.title || '').trim()}`,
      `时间：${String(item.timelineLabel || item.createdAt || '').trim()}`,
      `事件：${Array.isArray(item.actions) ? item.actions.join('、') : ''}`,
      `内容：${String(item.content || '').trim()}`
    ].join('\n')).join('\n\n');

    const messages = [
      {
        role: 'system',
        content: [
          '你是一个中文记忆整理助手。',
          '请根据同一人物相关的多段回忆，生成一份朴素、真实、不煽情的人物整理。',
          '不能编造没有出现过的细节。',
          '不要使用括号说明，不要诗化表演，不要像角色扮演。',
          '语气像产品里的整理说明，温和但克制。',
          '输出 JSON，字段必须包含 summary, relationLabel, personImpression, sharedMoments, userView, personView, openQuestions。',
          'summary 控制在 60 到 100 字。',
          'relationLabel 是一句很短的关系概括，比如“常一起跳舞的朋友”“工作里常提到的同事”。',
          'personImpression 用一句话概括这个人在回忆里呈现出的样子。',
          'sharedMoments 是 1 到 4 条短句，写你们一起做过什么或发生过什么。',
          'userView 用一句话写用户通常怎么看她，只能基于回忆里能确认的内容。',
          'personView 用一句话写这个人通常怎么对用户，只有有依据才写，没有就留空。',
          'openQuestions 是 0 到 3 条字符串数组，只在信息明显不够时提出具体追问。'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          personName,
          memories: normalizedMemories,
          context: content
        }, null, 2)
      }
    ];

    const response = await axios.post(
      DEEPSEEK_URL,
      {
        model: MODEL_NAME,
        messages,
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const raw = response.data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(extractJsonBlock(raw));
    res.json(normalizePersonSummary(parsed));
  } catch (error) {
    const detail = error.response?.data || error.message;
    res.status(500).json({
      error: 'Memory summary request failed.',
      detail
    });
  }
});

app.post('/api/profile-insights', async (req, res) => {
  if (!DEEPSEEK_KEY) {
    res.status(500).json({
      error: 'Missing DEEPSEEK_API_KEY in environment.'
    });
    return;
  }

  try {
    const { text = '', history = [], memories = [] } = req.body || {};
    if (!String(text || '').trim()) {
      res.status(400).json({ error: 'Missing text.' });
      return;
    }

    const messages = [
      {
        role: 'system',
        content: [
          '你是一个中文用户画像整理助手。',
          '请从用户刚说的话、用户本人最近对话和用户确认保留的相关记忆中，提炼“适合长期保存”的稳定偏好和个人信息。',
          '不要编造；如果不确定，就留空。',
          '绝对不要把助手自己说过的话、猜测过的话，当成用户事实。',
          '只提炼相对稳定的信息，不要把一次性情绪当成人设。',
          '输出 JSON，字段必须包含：speakingStyle, worldview, likes, dislikes, habits, goals, importantPeople, keyMemories, userStyle。',
          'speakingStyle 和 worldview 是简短字符串。',
          'userStyle 是对象，字段包含 talkingPace, reactsWellTo, reactsPoorlyTo, anchorTopics, humorStyle。',
          'likes, dislikes, habits, goals, importantPeople, keyMemories 都是字符串数组。',
          'importantPeople 只保留明确、具体的人名或称呼。',
          'keyMemories 只保留适合长期记住的回忆主题，不要复述整段聊天。',
          '不要输出 markdown，不要解释。'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          text,
          history,
          memories
        }, null, 2)
      }
    ];

    const response = await axios.post(
      DEEPSEEK_URL,
      {
        model: MODEL_NAME,
        messages,
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const raw = response.data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(extractJsonBlock(raw));
    res.json({
      speakingStyle: String(parsed.speakingStyle || '').trim(),
      worldview: String(parsed.worldview || '').trim(),
      userStyle: {
        talkingPace: String(parsed.userStyle?.talkingPace || '').trim(),
        reactsWellTo: sanitizeStringList(parsed.userStyle?.reactsWellTo, 6),
        reactsPoorlyTo: sanitizeStringList(parsed.userStyle?.reactsPoorlyTo, 6),
        anchorTopics: sanitizeStringList(parsed.userStyle?.anchorTopics, 6),
        humorStyle: String(parsed.userStyle?.humorStyle || '').trim()
      },
      likes: sanitizeStringList(parsed.likes, 8),
      dislikes: sanitizeStringList(parsed.dislikes, 8),
      habits: sanitizeStringList(parsed.habits, 8),
      goals: sanitizeStringList(parsed.goals, 8),
      importantPeople: sanitizeStringList(parsed.importantPeople, 8),
      keyMemories: sanitizeStringList(parsed.keyMemories, 8)
    });
  } catch (error) {
    const detail = error.response?.data || error.message;
    res.status(500).json({
      error: 'Profile insights request failed.',
      detail
    });
  }
});

app.post('/api/life-summary-compose', async (req, res) => {
  if (!DEEPSEEK_KEY) {
    res.status(500).json({
      error: 'Missing DEEPSEEK_API_KEY in environment.'
    });
    return;
  }

  try {
    const { memories = [], candidates = [], localSummaries = [] } = req.body || {};
    const normalizedMemories = Array.isArray(memories) ? memories.slice(0, 18) : [];
    const normalizedCandidates = Array.isArray(candidates) ? candidates.slice(0, 12) : [];
    const normalizedLocalSummaries = Array.isArray(localSummaries) ? localSummaries.slice(0, 8) : [];

    if (!normalizedMemories.length && !normalizedCandidates.length && !normalizedLocalSummaries.length) {
      res.json({ summaries: [] });
      return;
    }

    const messages = [
      {
        role: 'system',
        content: [
          '你是一个中文人生线整理助手。',
          '请根据正式记忆、候选线索和已有本地摘要，整理出几条更自然的长期线摘要。',
          '产品目标不是做人格分身，而是把人物、时间、情绪和生活片段慢慢整理成“人生之书”的脉络。',
          '不要编造没有出现过的新事实，不要把概括展开成具体场景，不要诗化，不要表演。',
          '优先整理三类线：person_line, timeline_line, emotion_line。',
          '输出 JSON，字段必须包含 summaries。summaries 是数组，每项字段必须包含 id, type, label, summary, evidenceCount, people, tags, updatedAt。',
          'summary 控制在 40 到 90 字，像产品里的长期整理说明，要朴素、稳定、可回看。',
          '如果信息不够，不要硬凑满；宁可少输出，也不要空想。',
          'timeline_line 可以使用“待补人生阶段”这类标签，但不要编造具体年份。',
          'emotion_line 只有在某种心绪明显反复出现时才输出。',
          'people 和 tags 都只保留有意义的词，不要分词堆砌。',
          'updatedAt 直接原样返回输入里的时间，或留空。'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          memories: normalizedMemories,
          candidates: normalizedCandidates,
          localSummaries: normalizedLocalSummaries
        }, null, 2)
      }
    ];

    const response = await axios.post(
      DEEPSEEK_URL,
      {
        model: MODEL_NAME,
        messages,
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const raw = response.data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(extractJsonBlock(raw));
    const summaries = Array.isArray(parsed.summaries) ? parsed.summaries.map(normalizeLifeSummary).filter((item) => item.type && item.label && item.summary) : [];
    res.json({ summaries });
  } catch (error) {
    const detail = error.response?.data || error.message;
    res.status(500).json({
      error: 'Life summary compose request failed.',
      detail
    });
  }
});

app.post('/api/chapter-compose', async (req, res) => {
  if (!DEEPSEEK_KEY) {
    res.status(500).json({
      error: 'Missing DEEPSEEK_API_KEY in environment.'
    });
    return;
  }

  try {
    const { personName, memories = [] } = req.body || {};
    if (!String(personName || '').trim()) {
      res.status(400).json({ error: 'Missing personName.' });
      return;
    }

    const normalizedMemories = Array.isArray(memories) ? memories.slice(0, 12) : [];
    const content = normalizedMemories.map((item, index) => [
      `第${index + 1}段`,
      `标题：${String(item.title || '').trim()}`,
      `时间：${String(item.timelineLabel || item.createdAt || '').trim()}`,
      `人物：${Array.isArray(item.people) ? item.people.join('、') : ''}`,
      `事件：${Array.isArray(item.actions) ? item.actions.join('、') : ''}`,
      `摘要：${String(item.summary || '').trim()}`,
      `正文：${String(item.content || '').trim()}`
    ].join('\n')).join('\n\n');

    const messages = [
      {
        role: 'system',
        content: [
          '你是一个中文记忆篇章整理助手。',
          '请围绕一个人物，把多段记忆整理成一个“人物篇”的第一版。',
          '不要编造没有出现过的事实，不要表演，不要诗化，不要像散文朗诵。',
          '输出 JSON，字段必须包含：title, narrative, timeline, anchors, openThreads。',
          'title 是简短篇章标题，例如“赵姐篇”。',
          'narrative 是 120 到 220 字的一段叙述，要把这个人物在用户记忆里是什么样、你们发生过什么、这条线目前呈现出什么，整理清楚。',
          'timeline 是一句话，概括这些记忆大致集中在哪个阶段；如果时间不足，就老实写“时间还在慢慢补”。',
          'anchors 是 2 到 5 条短短的锚点，写关键片段，不要分词。',
          'openThreads 是 0 到 4 条还值得以后补充的线索，只在确实缺信息时写。',
          '语气像产品里的整理页说明，低姿态、清楚、朴素。'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          personName,
          memories: normalizedMemories,
          context: content
        }, null, 2)
      }
    ];

    const response = await axios.post(
      DEEPSEEK_URL,
      {
        model: MODEL_NAME,
        messages,
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const raw = response.data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(extractJsonBlock(raw));
    res.json(normalizeChapterCompose(parsed));
  } catch (error) {
    const detail = error.response?.data || error.message;
    res.status(500).json({
      error: 'Chapter compose request failed.',
      detail
    });
  }
});

app.post('/api/chat-recap', async (req, res) => {
  if (!DEEPSEEK_KEY) {
    res.status(500).json({
      error: 'Missing DEEPSEEK_API_KEY in environment.'
    });
    return;
  }

  try {
    const { text = '', reply = '', retrieval = {}, history = [] } = req.body || {};
    if (!String(text || '').trim()) {
      res.status(400).json({ error: 'Missing text.' });
      return;
    }

    const messages = [
      {
        role: 'system',
        content: [
          '你是一个中文对话复盘助手。',
          '请根据这一轮用户的话、助手回复、命中的记忆线索和最近聊天，生成一份很克制的本轮复盘。',
          '不要编造没有明确出现过的事实。',
          '不要写得像夸赞用户，也不要写系统炫技说明。',
          '输出 JSON，字段必须包含：userUnderstanding, personUnderstanding, missingInfo, suggestedMemory, selfJudgment。',
          'userUnderstanding: 一句话，写这轮又更了解了用户什么。',
          'personUnderstanding: 一句话，写这轮又更了解了用户提到的人什么；如果没有明确人物就留空。',
          'missingInfo: 一句话，写这轮还缺什么关键细节，优先时间、关系、事件经过。',
          'suggestedMemory: 一句话，把这一轮最值得记下来的点整理成自然短句，像记忆库里的暂存摘要。',
          'selfJudgment: 一句话，写这轮助手自己的判断，例如“这轮更适合接话，不适合追问”或“这轮是人物线索，不是完整回忆”。',
          '五个字段都要尽量朴素、具体、短，不要列点，不要 markdown。'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          text,
          reply,
          retrieval,
          history: Array.isArray(history) ? history.slice(-6) : []
        }, null, 2)
      }
    ];

    const response = await axios.post(
      DEEPSEEK_URL,
      {
        model: MODEL_NAME,
        messages,
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const raw = response.data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(extractJsonBlock(raw));
    res.json(normalizeChatRecap(parsed));
  } catch (error) {
    const detail = error.response?.data || error.message;
    res.status(500).json({
      error: 'Chat recap request failed.',
      detail
    });
  }
});

app.post('/api/reply-plan', async (req, res) => {
  if (!DEEPSEEK_KEY) {
    res.status(500).json({
      error: 'Missing DEEPSEEK_API_KEY in environment.'
    });
    return;
  }

  try {
    const { text = '', retrieval = {}, history = [] } = req.body || {};
    if (!String(text || '').trim()) {
      res.status(400).json({ error: 'Missing text.' });
      return;
    }

    const messages = [
      {
        role: 'system',
        content: [
          '你是一个中文对话决策助手。',
          '请在正式回复用户前，先判断这一轮最合适的回应策略。',
          '不要编造事实，不要把用户短句扩写成回忆。',
          '输出 JSON，字段必须包含：responseMode, selfJudgment, replyGoal, memorySignal, reason, shouldAsk, suggestedQuestion。',
          'responseMode 只能是 small_talk, emotional_support, chatting, relationship_signal, memory_narrative, memory_capture 之一。',
          'selfJudgment: 一句话，写这轮你自己的判断，例如“这轮更适合接话，不适合追问”。',
          'replyGoal: 一句话，写这轮回复最该完成什么，例如“先接住情绪”“先顺着这个人聊一句”。',
          'memorySignal: true 或 false，表示这一轮是否值得进入“候选记忆线索”处理。只有当用户提供了相对明确、可沉淀的内容时才为 true。',
          'reason: 一句话，说明为什么这轮该或不该进入候选记忆，例如“用户只是在闲聊”或“这轮出现了明确人物和事件”。',
          'shouldAsk: true 或 false。',
          'suggestedQuestion: 如果 shouldAsk 为 true，给出一个非常具体的小问题；否则留空。',
          '规则：寒暄、短回应、附和句，优先设为 small_talk 或 chatting；情绪明显时优先 emotional_support；提到人物但还不成段时优先 relationship_signal；成段往事才可用 memory_narrative。',
          '轻微吐槽、嫌烦、无语、说“别分析我”或纠正助手，不要直接判成 emotional_support，通常更适合 chatting。',
          '如果用户在纠正你，比如“你没听懂”“我不是这个意思”，优先设为 chatting，目标是收回理解、按字面重来。',
          '只提到一个人物名字，且没有形成可追溯片段时，可以是 relationship_signal，但 memorySignal 仍然可以是 false。',
          'memorySignal 的门槛要比 responseMode 更高。能顺着聊，不代表值得进入候选记忆池。',
          'shouldAsk 只有在补一个小问题明显能帮助理解当前片段时才为 true；寒暄、短句、轻吐槽、纠正场景一律尽量 false。',
          '还要参考 recentStrategyTrail：如果最近一两轮已经连续追问，这一轮优先收住；如果最近连续是 emotional_support，就不要突然切成分析口气。',
          '对于“你好”“嗯”“对啊”“无聊”“在吗”这类内容，memorySignal 必须是 false。'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          text,
          retrieval,
          history: Array.isArray(history) ? history.slice(-6) : []
        }, null, 2)
      }
    ];

    const response = await axios.post(
      DEEPSEEK_URL,
      {
        model: MODEL_NAME,
        messages,
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const raw = response.data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(extractJsonBlock(raw));
    res.json(normalizeReplyPlan(parsed));
  } catch (error) {
    const detail = error.response?.data || error.message;
    res.status(500).json({
      error: 'Reply plan request failed.',
      detail
    });
  }
});

app.post('/api/memory-filter', async (req, res) => {
  if (!DEEPSEEK_KEY) {
    res.status(500).json({
      error: 'Missing DEEPSEEK_API_KEY in environment.'
    });
    return;
  }

  try {
    const { text = '', history = [], retrieval = {}, replyPlan = {} } = req.body || {};
    if (!String(text || '').trim()) {
      res.status(400).json({ error: 'Missing text.' });
      return;
    }

    const messages = [
      {
        role: 'system',
        content: [
          '你是一个中文记忆筛选助手。',
          '你的任务不是直接生成正式记忆，而是判断这轮用户输入里是否存在“值得进入候选记忆池”的有效内容。',
          '要先去噪，再判断，再给出一条朴素的候选摘要。',
          '不要把抱怨模型、打招呼、附和、口头禅、纠错、对系统的吐槽，当成回忆内容。',
          '不要把“你傻啊”“不是刚开始聊天吗”“闲聊而已”这种元对话写进记忆。',
          '如果只是短句闲聊、情绪陪伴、测试问句、寒暄，memorySignal 必须是 false。',
          '如果只是轻微吐槽、嫌烦、无语、对助手的纠正，或者“别分析我”“别乱安慰”，memorySignal 也必须是 false。',
          '如果出现了相对明确的人物、时间、地点、行为，或者已经形成一个可追溯的小片段，可以设为 true。',
          '输出 JSON，字段必须包含：filteredText, memorySignal, candidateType, confidence, people, timeType, isComplete, summary, narrative, missingPieces, followUpHint, noiseFiltered, reason。',
          'candidateType 只能是 daily_fragment, person_clue, event_memory, timeline_memory, emotion_note, none 之一。',
          'confidence 是 0 到 1 之间的小数。',
          'people 只保留明确人物称呼，不要把“和赵姐”写进去，要写成“赵姐”。',
          'timeType 只能是 exact, relative, missing, present, none 之一。',
          'isComplete 表示这段内容是否已经足够成为一条相对完整的候选记忆。',
          '只有当“想念、怀念、挂念”明确指向一个人或一段生活线索时，candidateType 才能是 emotion_note；普通烦躁、抱怨、吐槽不要进这个类型。',
          'summary 要写成一句自然短句，像“今天和赵姐一起看漫画，是一个刚发生的小片段”，不要分词罗列。',
          'narrative 要写成 50 到 90 字的一小段整理文字，像温和的记忆暂存卡片，只能根据已有事实整理，不要编造。',
          'missingPieces 是还缺的关键信息列表，优先时间、地点、事件经过。',
          'followUpHint 是一句内部提示，不是直接质问用户；要非常克制，只有真的缺关键口子才写。轻吐槽、闲聊、纠正场景一律留空。',
          'filteredText 是去掉噪声后保留下来的有效内容；如果没有，就留空。',
          'reason 用一句话解释判断。',
          '不要输出 markdown，不要解释。'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          text,
          history: Array.isArray(history) ? history.slice(-8) : [],
          retrieval,
          replyPlan
        }, null, 2)
      }
    ];

    const response = await axios.post(
      DEEPSEEK_URL,
      {
        model: MODEL_NAME,
        messages,
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const raw = response.data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(extractJsonBlock(raw));
    res.json(normalizeMemoryFilter(parsed));
  } catch (error) {
    const detail = error.response?.data || error.message;
    res.status(500).json({
      error: 'Memory filter request failed.',
      detail
    });
  }
});

app.post('/api/memory-draft', async (req, res) => {
  if (!DEEPSEEK_KEY) {
    res.status(500).json({
      error: 'Missing DEEPSEEK_API_KEY in environment.'
    });
    return;
  }

  try {
    const { text = '', source = '' } = req.body || {};
    if (!String(text || '').trim()) {
      res.status(400).json({ error: 'Missing text.' });
      return;
    }

    const messages = [
      {
        role: 'system',
        content: [
          '你是一个中文记忆整理助手。',
          '请把用户提供的原始内容整理成一页可保存的记忆草稿。',
          '输出 JSON，字段必须包含：title, content, summary, mood, tags。',
          'title 简短自然，像记忆页标题。',
          'content 要整理成一小段自然的日记式文字，像把刚说的内容轻轻记下来；只保留用户原文里已有的事实，不编造，不扩写，不写舞台说明，不要诗化。',
          '如果原文只是一句很短的话或一个线索，也先把它整理成“当前记下了什么、还可以往哪里继续说”的自然短段落，不要只回几个分词。',
          'summary 是 30 到 50 字的简短概括，应该概括成一个点，而不是拆词罗列。',
          'mood 是一个简短情绪词。',
          'tags 是字符串数组，最多 4 个，只保留有意义的主题词，不要把“平静”“赵姐说话”“跳舞”这种碎片凑成回忆本身。',
          '不要输出 markdown，不要解释。'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({ text, source }, null, 2)
      }
    ];

    const response = await axios.post(
      DEEPSEEK_URL,
      {
        model: MODEL_NAME,
        messages,
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const raw = response.data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(extractJsonBlock(raw));
    res.json({
      title: String(parsed.title || '').trim(),
      content: String(parsed.content || '').trim(),
      summary: String(parsed.summary || '').trim(),
      mood: String(parsed.mood || '').trim(),
      tags: sanitizeStringList(parsed.tags, 6)
    });
  } catch (error) {
    const detail = error.response?.data || error.message;
    res.status(500).json({
      error: 'Memory draft request failed.',
      detail
    });
  }
});

app.post('/api/memory-structure', async (req, res) => {
  if (!DEEPSEEK_KEY) {
    res.status(500).json({
      error: 'Missing DEEPSEEK_API_KEY in environment.'
    });
    return;
  }

  try {
    const { text, title = '', mood = '', source = '' } = req.body || {};
    if (!String(text || '').trim()) {
      res.status(400).json({ error: 'Missing memory text.' });
      return;
    }

    const messages = [
      {
        role: 'system',
        content: [
          '你是一个中文记忆整理助手。',
          '请从用户提供的一段回忆中抽取结构化信息，并且只返回 JSON。',
          '不要输出解释，不要输出 markdown，不要输出多余文字。',
          'JSON 必须包含这些字段：',
          'title, summary, mood, people, timeRefs, timelineDate, timelineLabel, timeAccuracy, followUpQuestion, locations, actions, tags, retrievalText',
          'people 是对象数组，每项包含 name, relation, role。',
          '只有明确的人物才放进 people，不要把普通称呼、泛指词或分词碎片当成人物。',
          '例如“一个人”“大家”“有人”“医生”“老师”这类泛指，除非上下文明确到特定人物，否则不要抽取。',
          '像“赵姐”“王老师”“外孙”“老伴”这种指向明确的人物，可以抽取。',
          'timeRefs, locations, actions, tags 都是字符串数组。',
          'timelineDate 只接受 YYYY、YYYY-MM 或 YYYY-MM-DD，不能填“以前”“那时候”这种模糊词。',
          'timelineLabel 是适合展示的时间文本，例如“1984年秋天”或“上小学那几年”。',
          'timeAccuracy 只能是 exact、approx、unknown 三种之一。',
          '如果时间不够明确，timelineDate 留空，timeAccuracy 填 unknown 或 approx，并给出一句像助手在接话的 followUpQuestion，引导用户补充大概年龄、年份或人生阶段。',
          '如果没有把握，字段留空字符串或空数组，不要编造具体事实。',
          'title 应该是简短书页标题，summary 应该是一句概括。',
          'retrievalText 需要把人物、地点、时间、行为、摘要和原文整合成一段便于后续检索的文本。',
          'mood 优先使用原文可判断出的情绪词，例如：温暖、怀念、难过、平静、安心、自豪、焦虑。'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({ text, title, mood, source }, null, 2)
      }
    ];

    const response = await axios.post(
      DEEPSEEK_URL,
      {
        model: MODEL_NAME,
        messages,
        temperature: 0.2,
        max_tokens: 600,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const raw = response.data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(extractJsonBlock(raw));
    res.json(normalizeMemoryStructure(parsed));
  } catch (error) {
    const detail = error.response?.data || error.message;
    res.status(500).json({
      error: 'Memory structure request failed.',
      detail
    });
  }
});

app.listen(PORT, () => {
  console.log(`AI proxy listening on http://localhost:${PORT}`);
});
