function cleanText(value = '', limit = 240) {
  return String(value || '').trim().slice(0, limit);
}

function normalizeItem(item, charLimit = 80) {
  if (item === null || item === undefined) return '';
  if (typeof item === 'object') {
    const extracted = item.name || item.label || item.title || item.value || '';
    return cleanText(extracted, charLimit);
  }
  return cleanText(item, charLimit);
}

export function normalizeStringList(list, limit = 8) {
  if (!Array.isArray(list)) return [];
  return [...new Set(
    list
      .map((item) => normalizeItem(item, 80))
      .filter((value) => Boolean(value) && !/^\[object\s+\w+\]$/i.test(value))
  )].slice(0, limit);
}

export function normalizeMemoryCandidate(candidate = {}, context = {}) {
  const now = new Date().toISOString();
  return {
    id: cleanText(candidate.id || `agent_candidate_${Date.now()}`, 100),
    source: cleanText(candidate.source || 'agent', 80),
    sourceText: cleanText(candidate.sourceText || context.message || '', 1000),
    filteredText: cleanText(candidate.filteredText || candidate.sourceText || context.message || '', 1000),
    summary: cleanText(candidate.summary || candidate.label || '', 240),
    narrative: cleanText(candidate.narrative || candidate.content || '', 1000),
    candidateType: cleanText(candidate.candidateType || candidate.type || 'event_memory', 80),
    confidence: Number.isFinite(Number(candidate.confidence)) ? Number(candidate.confidence) : 0,
    people: normalizeStringList(candidate.people, 8),
    timeLabels: normalizeStringList(candidate.timeLabels || candidate.timeRefs, 8),
    tags: normalizeStringList(candidate.tags, 8),
    missingPieces: normalizeStringList(candidate.missingPieces, 8),
    followUpHint: cleanText(candidate.followUpHint || '', 240),
    draft: candidate.draft && typeof candidate.draft === 'object' ? candidate.draft : null,
    structure: candidate.structure && typeof candidate.structure === 'object' ? candidate.structure : null,
    status: 'pending_user_confirmation',
    createdAt: cleanText(candidate.createdAt || now, 80),
    updatedAt: now
  };
}

export function normalizeMemoryCandidateLight(candidate = {}) {
  return normalizeMemoryCandidate(candidate, {});
}
