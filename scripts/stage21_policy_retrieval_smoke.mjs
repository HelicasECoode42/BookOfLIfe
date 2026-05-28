import assert from 'assert';
import { AgentLoop, AgentMaxStepsError } from '../agent/AgentLoop.js';
import { ToolRegistry } from '../agent/ToolRegistry.js';
import { MemoryStore } from '../memory/MemoryStore.js';

const registry = new ToolRegistry();
registry.register({
  name: 'read_secret',
  risk: 'secret',
  execute: async () => ({ secret: 'nope' })
});

await assert.rejects(
  () => registry.call('read_secret', {}, {}),
  /Secret-bearing tools/
);

const repeatRegistry = new ToolRegistry();
repeatRegistry.register({
  name: 'search_memory',
  risk: 'read',
  execute: async () => ({ results: [] })
});

let repeatStep = 0;
const repeatAgent = new AgentLoop({
  toolRegistry: repeatRegistry,
  maxSteps: 5,
  maxRepeatedAction: 1,
  selectAction: async () => {
    repeatStep += 1;
    return {
      thought: `repeat ${repeatStep}`,
      action: { tool: 'search_memory', input: { query: '昨天', limit: 5 } }
    };
  }
});

await assert.rejects(
  () => repeatAgent.run({ message: '不是今天，是昨天' }),
  AgentMaxStepsError
);

const state = {
  confirmedFacts: [
    {
      id: 'fact-game',
      canonicalLabel: '老徐是一起打游戏的朋友',
      relatedPeople: ['老徐'],
      sourceText: '老徐经常陪我打游戏。',
      status: 'user_confirmed'
    }
  ],
  memoryCandidates: [
    {
      id: 'candidate-game',
      summary: '老徐特别肝',
      sourceText: '老徐特别肝，经常陪我打游戏。',
      people: ['老徐'],
      status: 'pending_user_confirmation'
    }
  ],
  lifeSummaries: [
    {
      id: 'life-game',
      label: '游戏伙伴',
      summary: '老徐是经常一起开黑的朋友。',
      people: ['老徐'],
      status: 'confirmed'
    }
  ]
};

const store = new MemoryStore({ readState: async () => state });
const who = await store.search('老徐是谁', { limit: 3 });
assert.equal(who.results[0].source, 'confirmedFacts');
assert.equal(who.results[0].confirmed, true);

const synonym = await store.search('老徐开黑', { limit: 3 });
assert.equal(
  synonym.results.some((row) => row.id === 'fact-game'),
  true,
  JSON.stringify(synonym.results)
);

console.log('stage21 policy retrieval smoke passed');
