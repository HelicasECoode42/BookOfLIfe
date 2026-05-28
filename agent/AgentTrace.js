export function sanitizeAgentTrace(trace = {}) {
  return {
    traceId: String(trace.traceId || '').trim(),
    sessionId: String(trace.sessionId || 'default').trim() || 'default',
    createdAt: String(trace.createdAt || '').trim(),
    userText: String(trace.userText || '').trim(),
    reply: String(trace.reply || '').trim(),
    actions: Array.isArray(trace.actions) ? trace.actions.slice(0, 12).map((step, index) => ({
      index,
      thought: String(step.thought || '').trim(),
      action: step.action && typeof step.action === 'object' ? step.action : {},
      observation: step.observation ?? null
    })) : [],
    memoryCandidate: trace.memoryCandidate || null
  };
}
