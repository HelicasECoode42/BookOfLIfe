import assert from 'assert';
import { AgentMaxStepsError } from '../agent/AgentLoop.js';
import { createHarness, createState } from './testHarness.js';

const state = createState({
  confirmedFacts: [
    {
      id: 'fact-laozhang',
      canonicalLabel: '老张是纺织厂同事',
      relatedPeople: ['老张'],
      sourceText: '老张和用户在纺织厂一起工作过十二年。'
    }
  ]
});

const decisions = [
  {
    thought: '先查老张。',
    action: { tool: 'search_memory', input: { query: '老张 纺织厂', limit: 5 } }
  },
  {
    thought: '写候选但故意不 final，用于验证 partial result。',
    action: {
      tool: 'append_candidate_memory',
      input: {
        candidate: {
          sourceText: '今天碰到老张了',
          filteredText: '今天碰到老张了',
          summary: '今天碰到老张',
          narrative: '今天碰到老张，是一条新近人物线索。',
          candidateType: 'event_memory',
          confidence: 0.7,
          people: ['老张']
        }
      }
    }
  }
];

const { agent } = createHarness({ state, decisions, maxSteps: 2 });

try {
  await agent.run({
    message: '今天碰到老张了',
    sessionId: 'stage20-partial'
  });
  assert.fail('Expected AgentMaxStepsError.');
} catch (error) {
  assert.equal(error instanceof AgentMaxStepsError, true);
  assert.equal(error.partialResult.actions.length, 2);
  assert.equal(error.partialResult.memoryCandidate.status, 'pending_user_confirmation');
  assert.equal(state.memoryCandidates.length, 1);
  assert.equal(state.confirmedFacts.length, 1);
}

console.log('stage20 maxsteps partial smoke passed');
