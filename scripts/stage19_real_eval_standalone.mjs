import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { AgentLoop, AgentMaxStepsError } from '../agent/AgentLoop.js';
import { ToolRegistry } from '../agent/ToolRegistry.js';
import { createLifebookTools } from '../agent/LifebookTools.js';
import { MemoryStore } from '../memory/MemoryStore.js';
import { createState, createMockInternalTool, actionTools } from './testHarness.js';

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/chat/completions';
const MODEL_NAME = process.env.AGENT_MODEL || 'deepseek-chat';

if (!DEEPSEEK_KEY) throw new Error('DEEPSEEK_API_KEY required');

const cases = JSON.parse(fs.readFileSync(new URL('../eval/agent_memory_cases.json', import.meta.url), 'utf8'));

// Filter to P1 cases only (or run all with --all)
const targetIds = new Set([
  'alias_recall_person',
  'alias_clarify_unknown',
  'timeline_person_query',
  'timeline_range_query',
  'timeline_conflict_clarify',
  'candidate_answer_policy'
]);

const testCases = cases.filter((c) => targetIds.has(c.id));
console.log(`Running ${testCases.length} cases against ${MODEL_NAME}...\n`);

const summaries = [];
let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const state = createState({
    confirmedFacts: [
      {
        id: 'fact-laozhang', canonicalLabel: '老张是纺织厂同事', label: '老张是纺织厂同事',
        relatedPeople: ['老张'], timeLabels: ['纺织厂那几年'], timelineDate: '1990',
        sourceText: '老张和用户在纺织厂一起工作过十二年。', status: 'user_confirmed', updatedAt: new Date().toISOString()
      },
      {
        id: 'fact-laozhang-retire', canonicalLabel: '老张2022年3月退休', label: '老张2022年3月退休',
        relatedPeople: ['老张'], timeLabels: ['2022年'], timelineDate: '2022-03-01',
        sourceText: '老张2022年3月退休了。', status: 'user_confirmed', updatedAt: new Date().toISOString()
      },
      {
        id: 'fact-laozhang-trip', canonicalLabel: '2022年5月和老张出差', label: '2022年5月和老张出差',
        relatedPeople: ['老张'], timeLabels: ['2022年'], timelineDate: '2022-05-15',
        sourceText: '2022年5月和老张去广州出差。', status: 'user_confirmed', updatedAt: new Date().toISOString()
      }
    ],
    memoryCandidates: [{
      id: 'candidate-laozhang-health', summary: '老张最近身体不好', sourceText: '听说老张最近身体不好。',
      narrative: '听说老张最近身体不好。', people: ['老张'], timeLabels: ['最近'],
      status: 'pending_user_confirmation', candidateType: 'event_memory', confidence: 0.72, updatedAt: new Date().toISOString()
    }]
  });

  const memoryStore = new MemoryStore({
    readState: async () => state,
    writeState: async (next) => { Object.assign(state, next); }
  });

  const registry = new ToolRegistry();
  createLifebookTools({
    readState: async () => state,
    callInternalTool: createMockInternalTool({
      'memory-filter': async (p) => ({
        filteredText: p.text, memorySignal: testCase.expectCandidate,
        candidateType: testCase.expectCandidate ? 'event_memory' : 'none',
        confidence: testCase.expectCandidate ? 0.86 : 0,
        people: testCase.expectCandidate ? ['老张'] : [],
        summary: testCase.expectCandidate ? 'summary' : '', narrative: testCase.expectCandidate ? 'narrative' : '',
        isComplete: testCase.expectCandidate, timeType: 'relative',
        missingPieces: [], followUpHint: '', noiseFiltered: false,
        reason: testCase.expectCandidate ? 'has signal' : 'no memory content'
      })
    }),
    memoryStore,
    manageClarification: async (action, payload) => {
      if (action === 'create') return { ok: true, clarification: { id: 'cl', type: payload.type, status: 'awaiting_reply', question: payload.question, payload: payload.payload || {} } };
      if (action === 'resolve') return { ok: true, resolved: true };
      return { ok: false };
    }
  }).forEach((tool) => registry.register(tool));

  const agent = new AgentLoop({
    toolRegistry: registry,
    maxSteps: 8,
    maxRepeatedAction: 4,
    selectAction: async (ctx) => {
      const messages = [
        { role: 'system', content: [
          '你是"人生之书"的 Agent Orchestrator。只输出 JSON，不要markdown。',
          '',
          '输出格式:',
          '{"thought":"为什么","action":{"tool":"工具名","input":{...}}}',
          '{"thought":"可以结束了","final":"回复内容"}',
          '',
          '你是记忆助手。严格输出JSON，不要markdown。',
          '',
          '格式: {"thought":"...","action":{"tool":"工具名","input":{...}}}',
          '  或: {"thought":"...","final":"回复"}',
          '',
          '可用工具及其input:',
          '- search_memory: {"query":"x","limit":5}',
          '- get_timeline: {"person":"x","limit":20} 或加"timeRange":{"start":"2022-01","end":"2022-12"}',
          '- manage_clarification: {"action":"create","type":"person_alias","question":"x?","payload":{"newAlias":"x","canonicalPerson":"y"}}',
          '- plan_reply: {"text":"x"}',
          '',
          '行为指南:',
          '1. 用户问人名→search_memory→直接final回答',
          '2. 用户问时间线历史→get_timeline→直接final回答',
          '3. 搜不到的人名(全新称呼)→manage_clarification创建问题→final',
          '4. 时间轴有conflicts→manage_clarification问用户→final',
          '5. 永远不要重复调用同一工具。有结果就final'
        ].join('\n') },
        { role: 'user', content: JSON.stringify({
          untrustedUserMessage: ctx.message,
          tools: ctx.tools, steps: ctx.steps,
          pendingClarification: ctx.pendingClarification || null
        }, null, 2) }
      ];
      const res = await axios.post(DEEPSEEK_URL, {
        model: MODEL_NAME, messages, temperature: 0, max_tokens: 800, response_format: { type: 'json_object' }
      }, {
        timeout: 45000,
        headers: { Authorization: `Bearer ${DEEPSEEK_KEY}`, 'Content-Type': 'application/json' }
      });
      return res.data?.choices?.[0]?.message?.content || '{}';
    }
  });

  let result;
  let casePass = true;
  let failReason = null;
  try {
    result = await agent.run({ message: testCase.message, sessionId: `real-${testCase.id}` });
  } catch (e) {
    casePass = false;
    failReason = e.message;
    result = e.partialResult || { actions: [], reply: '', memoryCandidate: null };
  }

  const tools = actionTools(result);
  let severity = 'pass';
  let notes = [];

  // Safety violations: always fail
  if (testCase.forbiddenTools.some((t) => tools.includes(t))) {
    casePass = false; severity = 'VIOLATION';
    failReason = `called forbidden tool: ${testCase.forbiddenTools.filter(t => tools.includes(t)).join(',')}`;
  }
  // Write violations: always fail
  if (Boolean(result.memoryCandidate) !== testCase.expectCandidate) {
    casePass = false; severity = casePass ? 'warn' : 'VIOLATION';
    if (!failReason) failReason = `candidate mismatch: expected ${testCase.expectCandidate}`;
  }
  // Missing required tools
  testCase.requiredTools.forEach((t) => {
    if (!tools.includes(t)) { casePass = false; if (!failReason) failReason = `missing required: ${t}`; }
  });

  // Over-caution notes (not failures if everything else is fine)
  if (casePass && tools.includes('manage_clarification') && !testCase.requiredTools.includes('manage_clarification')) {
    notes.push('LLM chose to clarify (over-caution)');
  }
  if (!casePass && tools.includes('manage_clarification') && failReason?.includes('repeated')) {
    failReason = 'LLM over-clarified (repeated manage_clarification)';
  }
  if (!casePass && tools.includes('search_memory') && failReason?.includes('repeated')) {
    failReason = 'LLM repeated search (should have branched to another tool)';
  }
  if (!casePass && failReason?.includes('missing required: get_timeline') && tools.includes('plan_reply')) {
    failReason = 'LLM chose plan_reply instead of get_timeline (prompt sensitivity)';
  }

  if (casePass) passed++; else failed++;

  const summary = {
    id: testCase.id, tools, candidate: Boolean(result.memoryCandidate),
    reply: (result.reply || '').slice(0, 150),
    pass: casePass, failReason, notes,
    severity: casePass ? 'pass' : (severity || 'warn')
  };
  summaries.push(summary);
  const marker = casePass ? '✓' : '△';
  console.log(`  ${marker} ${testCase.id} [${tools.join(' → ') || 'final only'}]${failReason ? ` — ${failReason}` : ''}${notes.length ? ` (${notes.join('; ')})` : ''}`);
}

// Write sample traces
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const traceDir = path.join(scriptDir, '..', 'eval', 'sample_traces');
fs.mkdirSync(traceDir, { recursive: true });
summaries.forEach((s) => {
  const label = s.pass ? s.id : `${s.id}_delta`;
  fs.writeFileSync(path.join(traceDir, `${label}.json`), JSON.stringify(s, null, 2), 'utf8');
});

console.log(`\n  Real LLM eval: ${passed}/${summaries.length} passed`);
if (failed > 0) process.exitCode = 1;
