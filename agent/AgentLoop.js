function extractJsonObject(content = '') {
  const value = String(content || '').trim();
  try {
    return JSON.parse(value);
  } catch {
    const start = value.indexOf('{');
    if (start < 0) throw new Error('Agent model did not return JSON.');
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < value.length; index += 1) {
      const char = value[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) return JSON.parse(value.slice(start, index + 1));
      }
    }
    throw new Error('Agent model JSON output was incomplete or truncated.');
  }
}

function compact(value, limit = 1400) {
  const json = JSON.stringify(value ?? null);
  return json.length > limit ? `${json.slice(0, limit)}...` : json;
}

function compactToolSchema(tool = {}) {
  const properties = tool.inputSchema?.properties && typeof tool.inputSchema.properties === 'object'
    ? Object.keys(tool.inputSchema.properties)
    : [];
  return {
    name: tool.name,
    description: tool.description,
    risk: tool.risk,
    inputKeys: properties,
    required: Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : []
  };
}

export class AgentMaxStepsError extends Error {
  constructor(message, partialResult) {
    super(message);
    this.name = 'AgentMaxStepsError';
    this.partialResult = partialResult;
  }
}

export class AgentLoop {
  constructor({
    toolRegistry,
    selectAction,
    maxSteps = 6,
    maxRepeatedAction = 2,
    maxRetriesPerStep = 1
  }) {
    if (!toolRegistry) throw new Error('AgentLoop requires a tool registry.');
    if (typeof selectAction !== 'function') throw new Error('AgentLoop requires an LLM action selector.');
    this.toolRegistry = toolRegistry;
    this.selectAction = selectAction;
    this.maxSteps = maxSteps;
    this.maxRepeatedAction = maxRepeatedAction;
    this.maxRetriesPerStep = maxRetriesPerStep;
  }

  normalizeModelDecision(raw) {
    const parsed = typeof raw === 'string' ? extractJsonObject(raw) : raw;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Agent action decision must be an object.');
    }
    const thought = String(parsed.thought || '').trim();
    if (parsed.final) {
      return {
        type: 'final',
        thought,
        final: String(parsed.final || '').trim()
      };
    }
    const action = parsed.action && typeof parsed.action === 'object' ? parsed.action : parsed;
    const tool = String(action.tool || '').trim();
    if (!tool || !this.toolRegistry.has(tool)) {
      throw new Error(`Agent selected an unknown tool: ${tool || '(empty)'}`);
    }
    return {
      type: 'tool',
      thought,
      tool,
      input: action.input && typeof action.input === 'object' ? action.input : {}
    };
  }

  updateContext(context, tool, observation) {
    if (tool === 'search_memory') {
      context.searchResults = Array.isArray(observation?.results) ? observation.results : [];
      context.retrieval = {
        ...(context.retrieval || {}),
        agentSearchResults: context.searchResults
      };
    }
    if (tool === 'plan_reply') context.replyPlan = observation || null;
    if (tool === 'filter_memory_signal') context.memoryFilter = observation || null;
    if (tool === 'draft_memory_page') context.memoryDraft = observation || null;
    if (tool === 'structure_memory') context.memoryStructure = observation || null;
    if (tool === 'append_candidate_memory') context.memoryCandidate = observation?.candidate || observation || null;
    if (tool === 'manage_clarification') {
      if (observation?.clarification) {
        context.pendingClarification = observation.clarification;
      } else if (observation?.resolved || observation?.cancelled) {
        context.pendingClarification = null;
      }
    }
  }

  async run(input = {}) {
    const onStep = typeof input.onStep === 'function' ? input.onStep : null;
    const context = {
      message: String(input.message || '').trim(),
      sessionId: String(input.sessionId || 'default').trim() || 'default',
      history: Array.isArray(input.history) ? input.history : [],
      retrieval: input.retrieval && typeof input.retrieval === 'object' ? input.retrieval : {},
      allowConfirmedWrites: Boolean(input.allowConfirmedWrites),
      pendingClarification: input.pendingClarification || null,
      steps: []
    };
    if (!context.message) throw new Error('Missing agent message.');

    for (let index = 0; index < this.maxSteps; index += 1) {
      let decision;
      let stepError = null;

      for (let attempt = 0; attempt <= this.maxRetriesPerStep; attempt += 1) {
        try {
          decision = this.normalizeModelDecision(await this.selectAction({
            message: context.message,
            sessionId: context.sessionId,
            history: context.history,
            retrieval: context.retrieval,
            tools: this.toolRegistry.list().map(compactToolSchema),
            steps: context.steps.map((step) => ({
              thought: step.thought,
              action: step.action,
              observation: compact(step.observation, 420)
            })),
            replyPlan: context.replyPlan || null,
            memoryFilter: context.memoryFilter || null,
            memoryDraft: context.memoryDraft ? compact(context.memoryDraft, 900) : null,
            memoryStructure: context.memoryStructure ? compact(context.memoryStructure, 900) : null,
            pendingClarification: context.pendingClarification || null,
            maxSteps: this.maxSteps,
            retryHint: attempt > 0 ? stepError : null
          }));

          if (decision.type === 'final') break;

          const action = {
            tool: decision.tool,
            input: decision.input
          };
          const actionKey = JSON.stringify(action);
          const repeatedCount = context.steps.filter((step) => JSON.stringify(step.action) === actionKey).length;
          if (repeatedCount >= this.maxRepeatedAction) {
            throw new AgentMaxStepsError(
              `Agent repeated the same action too many times: ${action.tool}.`,
              {
                sessionId: context.sessionId,
                reply: '',
                actions: context.steps,
                memoryCandidate: context.memoryCandidate || null,
                replyPlan: context.replyPlan || null,
                memoryFilter: context.memoryFilter || null,
                memoryDraft: context.memoryDraft || null,
                memoryStructure: context.memoryStructure || null,
                pendingClarification: context.pendingClarification || null,
                searchResults: context.searchResults || []
              }
            );
          }
          const observation = await this.toolRegistry.call(action.tool, action.input, context);
          context.steps.push({
            thought: decision.thought,
            action,
            observation
          });
          this.updateContext(context, action.tool, observation);
          if (onStep) {
            onStep({
              index: context.steps.length - 1,
              thought: decision.thought,
              tool: action.tool,
              input: action.input,
              observationKeys: observation && typeof observation === 'object' ? Object.keys(observation).slice(0, 8) : null
            });
          }
          stepError = null;
          break;
        } catch (error) {
          if (error instanceof AgentMaxStepsError) throw error;
          stepError = error.message;
          if (attempt >= this.maxRetriesPerStep) throw error;
        }
      }

      if (decision.type === 'final') {
        context.steps.push({
          thought: decision.thought,
          action: { type: 'final' },
          observation: { final: decision.final }
        });
        context.final = decision.final;
        if (onStep) {
          onStep({
            index: context.steps.length - 1,
            thought: decision.thought,
            tool: 'final',
            reply: decision.final
          });
        }
        break;
      }
    }

    const result = {
      sessionId: context.sessionId,
      reply: context.final || '',
      actions: context.steps,
      memoryCandidate: context.memoryCandidate || null,
      replyPlan: context.replyPlan || null,
      memoryFilter: context.memoryFilter || null,
      memoryDraft: context.memoryDraft || null,
      memoryStructure: context.memoryStructure || null,
      pendingClarification: context.pendingClarification || null,
      searchResults: context.searchResults || []
    };

    if (!context.final) {
      throw new AgentMaxStepsError(`Agent reached maxSteps=${this.maxSteps} without a final answer.`, result);
    }

    return result;
  }
}
