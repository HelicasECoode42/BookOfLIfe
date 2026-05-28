import FACT_SEMANTICS from '../config/fact_semantics.json' with { type: 'json' };
import PERSON_ALIASES from '../config/person_aliases.json' with { type: 'json' };
import { normalizeMemoryCandidate, normalizeStringList } from './CandidateNormalizer.js';

function cleanText(value = '', limit = 240) {
  return String(value || '').trim().slice(0, limit);
}

function normalizeList(value, limit = 6) {
  return normalizeStringList(value, limit);
}

function asTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function tokenize(value = '') {
  return cleanText(value, 240)
    .toLowerCase()
    .split(/[\s,，。；;、|/]+/)
    .filter(Boolean);
}

function expandPersonAliases(terms = [], extraAliases = {}) {
  const expanded = new Set(terms);
  const aliasEntries = Object.entries(PERSON_ALIASES || {});
  const allEntries = [...aliasEntries, ...Object.entries(extraAliases || {})];
  allEntries.forEach(([canonical, aliases]) => {
    const aliasList = Array.isArray(aliases) ? aliases : [aliases];
    const allNames = [canonical, ...normalizeList(aliasList, 20)].map((item) => item.toLowerCase());
    const hit = terms.some((term) => allNames.some((name) => name === term || name.includes(term) || term.includes(name)));
    if (hit) allNames.forEach((name) => expanded.add(name));
  });
  return [...expanded];
}

function expandTerms(terms = [], extraAliases = {}) {
  const normalizedTerms = terms.map((item) => cleanText(item, 80).toLowerCase()).filter(Boolean);
  const aliasExpanded = expandPersonAliases(normalizedTerms, extraAliases);
  const expanded = new Set(aliasExpanded);
  const synonymGroups = [
    ...Object.values(FACT_SEMANTICS.predicateSynonyms || {}),
    ...Object.values(FACT_SEMANTICS.objectSynonyms || {})
  ];
  normalizedTerms.forEach((term) => {
    synonymGroups.forEach((group) => {
      const values = normalizeList(group, 20).map((item) => item.toLowerCase());
      if (values.some((value) => value === term || value.includes(term) || term.includes(value))) {
        values.forEach((value) => expanded.add(value));
      }
    });
  });
  return [...expanded];
}

function itemText(parts = []) {
  return parts.flat().filter(Boolean).map((part) => String(part).trim()).filter(Boolean).join(' ');
}

export class MemoryStore {
  constructor({
    readState,
    writeState = null,
    now = () => new Date()
  }) {
    if (typeof readState !== 'function') throw new Error('MemoryStore requires readState.');
    this.readState = readState;
    this.writeState = writeState;
    this.now = now;
  }

  async getState() {
    return this.readState();
  }

  rowsFromState(state = {}) {
    const LAYER_META = {
      confirmedFacts:  { memoryLayer: 'confirmed_fact',   trustLevel: 'verified',           answerPolicy: 'can_state_as_fact' },
      memories:        { memoryLayer: 'confirmed_memory', trustLevel: 'user_saved',          answerPolicy: 'can_reference' },
      memoryCandidates:{ memoryLayer: 'candidate',        trustLevel: 'pending',             answerPolicy: 'must_mark_unconfirmed' },
      dailyLogs:       { memoryLayer: 'daily_log',        trustLevel: 'lightweight',         answerPolicy: 'use_as_time_anchor' },
      photos:          { memoryLayer: 'photo',            trustLevel: 'media_context',       answerPolicy: 'can_reference_caption' },
      lifeSummaries:   { memoryLayer: 'summary',          trustLevel: 'derived',             answerPolicy: 'summarize_only' }
    };

    const rows = [];
    const push = (source, item, text, extra = {}) => {
      const normalizedText = cleanText(text, 1200);
      if (!normalizedText) return;
      const layer = LAYER_META[source] || {};
      rows.push({
        source,
        id: cleanText(item?.id || item?.cardId || item?.photoId || ''),
        title: cleanText(item?.title || item?.label || item?.canonicalLabel || item?.memoryTitle || item?.summary || '', 120),
        text: normalizedText,
        people: normalizeList(item?.people || item?.relatedPeople, 8),
        tags: normalizeList(item?.tags, 8),
        timeLabels: normalizeList(item?.timeLabels || item?.timeRefs, 8),
        timelineDate: cleanText(item?.timelineDate || '', 40),
        confirmed: source === 'confirmedFacts'
          || source === 'lifeSummaries'
          || item?.status === 'confirmed'
          || item?.status === 'user_confirmed',
        status: cleanText(item?.status || '', 80),
        updatedAt: cleanText(item?.updatedAt || item?.createdAt || '', 80),
        memoryLayer: layer.memoryLayer || source,
        trustLevel: layer.trustLevel || 'unknown',
        answerPolicy: layer.answerPolicy || 'must_verify',
        ...extra
      });
    };

    (Array.isArray(state.confirmedFacts) ? state.confirmedFacts : []).forEach((item) => {
      push('confirmedFacts', item, itemText([
        item.canonicalLabel,
        item.label,
        item.subject,
        item.predicate,
        item.object,
        item.sourceText,
        item.relatedPeople,
        item.timeLabels
      ]));
    });

    (Array.isArray(state.memoryCandidates) ? state.memoryCandidates : []).forEach((item) => {
      push('memoryCandidates', item, itemText([
        item.summary,
        item.narrative,
        item.filteredText,
        item.sourceText,
        item.people,
        item.timeLabels
      ]), {
        candidateType: cleanText(item.candidateType || item.type || '', 80)
      });
    });

    (Array.isArray(state.memories) ? state.memories : []).forEach((item) => {
      push('memories', item, itemText([
        item.title,
        item.summary,
        item.content,
        item.text,
        item.timelineLabel,
        item.people,
        item.tags
      ]));
    });

    (Array.isArray(state.dailyLogs) ? state.dailyLogs : []).forEach((item) => {
      push('dailyLogs', item, itemText([
        item.summary,
        item.sourceText,
        item.timelineKey,
        item.people,
        item.tags
      ]));
    });

    (Array.isArray(state.photos) ? state.photos : []).forEach((item) => {
      push('photos', item, itemText([
        item.memoryTitle,
        item.caption,
        item.note,
        item.createdAt
      ]), {
        url: cleanText(item.url || item.src || '', 200)
      });
    });

    (Array.isArray(state.lifeSummaries) ? state.lifeSummaries : []).forEach((item) => {
      push('lifeSummaries', item, itemText([
        item.label,
        item.summary,
        item.people,
        item.tags
      ]), {
        summaryType: cleanText(item.type || '', 80)
      });
    });

    return rows;
  }

  scoreRow(row, queryTerms, filters = {}) {
    const haystack = `${row.title} ${row.text} ${row.people.join(' ')} ${row.tags.join(' ')} ${row.timeLabels.join(' ')}`.toLowerCase();
    let score = 0;
    const reasons = [];
    const evidence = [];

    queryTerms.forEach((term) => {
      if (!term) return;
      if (row.title.toLowerCase().includes(term)) {
        score += 5;
        reasons.push(`title:${term}`);
        evidence.push({ type: 'title_match', field: 'title', matched: term, weight: 5 });
      }
      if (row.people.some((person) => person.toLowerCase().includes(term))) {
        score += 4;
        reasons.push(`person:${term}`);
        evidence.push({ type: 'entity_match', field: 'people', matched: term, weight: 4 });
      }
      if (row.timeLabels.some((label) => label.toLowerCase().includes(term))) {
        score += 3;
        reasons.push(`time:${term}`);
        evidence.push({ type: 'time_match', field: 'timeLabels', matched: term, weight: 3 });
      }
      if (row.tags.some((tag) => tag.toLowerCase().includes(term))) {
        score += 3;
        reasons.push(`tag:${term}`);
        evidence.push({ type: 'tag_match', field: 'tags', matched: term, weight: 3 });
      }
      if (haystack.includes(term)) {
        score += 1;
        reasons.push(`text:${term}`);
        evidence.push({ type: 'text_match', field: 'text', matched: term, weight: 1 });
      }
    });

    const people = normalizeList(filters.people, 8).map((item) => item.toLowerCase());
    people.forEach((person) => {
      if (row.people.some((rowPerson) => rowPerson.toLowerCase().includes(person)) || haystack.includes(person)) {
        score += 6;
        reasons.push(`filter_person:${person}`);
        evidence.push({ type: 'filter_person', matched: person, weight: 6 });
      }
    });

    const timeRefs = normalizeList(filters.timeRefs, 8).map((item) => item.toLowerCase());
    timeRefs.forEach((timeRef) => {
      if (row.timeLabels.some((label) => label.toLowerCase().includes(timeRef)) || haystack.includes(timeRef)) {
        score += 3;
        reasons.push(`filter_time:${timeRef}`);
        evidence.push({ type: 'filter_time', matched: timeRef, weight: 3 });
      }
    });

    const matched = score > 0;

    if (matched && row.confirmed) {
      score += 8;
      reasons.push('confirmed_boost');
      evidence.push({ type: 'trust_boost', basis: 'confirmed', source: row.source, weight: 8 });
    }

    const ageMs = Date.now() - asTime(row.updatedAt);
    if (matched && row.updatedAt && ageMs >= 0 && ageMs < 1000 * 60 * 60 * 24 * 14) {
      score += 0.5;
      reasons.push('recent_boost');
      evidence.push({ type: 'recency_boost', weight: 0.5 });
    }

    if (filters.source && row.source !== filters.source) {
      score -= 4;
      evidence.push({ type: 'source_penalty', expected: filters.source, actual: row.source, weight: -4 });
    }

    return { score, reasons: [...new Set(reasons)], evidence };
  }

  async search(query = '', filters = {}) {
    const queryTerms = tokenize(query);
    const peopleTerms = normalizeList(filters.people, 8);
    const timeTerms = normalizeList(filters.timeRefs, 8);
    const state = await this.getState();
    const sessionAliases = state.sessionAliases && typeof state.sessionAliases === 'object' ? state.sessionAliases : {};
    const terms = expandTerms([...new Set([
      ...queryTerms,
      ...peopleTerms.map((item) => item.toLowerCase()),
      ...timeTerms.map((item) => item.toLowerCase())
    ])], sessionAliases);
    if (!terms.length) return { query, filters, results: [] };

    const limit = Math.max(1, Math.min(Number(filters.limit) || 5, 12));
    const results = this.rowsFromState(state)
      .map((row) => {
        const scored = this.scoreRow(row, terms, filters);
        return {
          ...row,
          score: Number(scored.score.toFixed(3)),
          reasons: scored.reasons,
          evidence: scored.evidence
        };
      })
      .filter((row) => row.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);

    return { query, filters, results };
  }

  async queryTimeline({ person = '', limit = 20, timeRange = null } = {}) {
    const state = await this.getState();
    const allRows = this.rowsFromState(state);
    const sessionAliases = state.sessionAliases && typeof state.sessionAliases === 'object' ? state.sessionAliases : {};
    const personTerms = person ? expandTerms([person], sessionAliases).map((t) => t.toLowerCase()) : [];
    const timelineSources = ['confirmedFacts', 'memories', 'dailyLogs', 'lifeSummaries'];
    const filtered = allRows.filter((row) => {
      if (!timelineSources.includes(row.source)) return false;
      if (personTerms.length) {
        const rowPeople = row.people.map((p) => p.toLowerCase());
        const haystack = `${row.title} ${row.text}`.toLowerCase();
        return rowPeople.some((p) => personTerms.some((t) => p.includes(t) || t.includes(p)))
          || personTerms.some((t) => haystack.includes(t));
      }
      return true;
    });

    const rangeStart = timeRange?.start ? String(timeRange.start).trim() : '';
    const rangeEnd = timeRange?.end ? String(timeRange.end).trim() : '';
    const hasTimeRange = Boolean(rangeStart || rangeEnd);

    const dated = [];
    const fuzzy = [];
    filtered.forEach((row) => {
      const hasDate = row.timelineDate && /^\d{4}/.test(row.timelineDate);
      const entry = {
        id: row.id,
        source: row.source,
        title: row.title,
        text: row.text.slice(0, 200),
        timeLabels: row.timeLabels,
        timelineDate: row.timelineDate || null,
        people: row.people,
        trustLevel: row.trustLevel,
        memoryLayer: row.memoryLayer,
        answerPolicy: row.answerPolicy,
        status: row.status
      };
      if (hasDate) {
        if (hasTimeRange) {
          const dateStr = (row.timelineDate || '').slice(0, 10);
          if (rangeStart && dateStr < rangeStart.slice(0, 10)) return;
          if (rangeEnd && dateStr > rangeEnd.slice(0, 10)) return;
        }
        dated.push(entry);
      } else {
        if (hasTimeRange) entry.no_exact_date = true;
        fuzzy.push(entry);
      }
    });

    dated.sort((a, b) => (a.timelineDate || '').localeCompare(b.timelineDate || ''));
    const items = dated.slice(0, limit);
    const fuzzyItems = fuzzy.slice(0, Math.max(0, limit - items.length));

    const potentialConflicts = [];
    const allTimelineItems = [...items, ...fuzzyItems];
    const LIFE_CHANGE = /(退休|离职|去世|搬家|离开|搬走|不在了|过世)/;
    const RELATION_WORDS = /(同事|邻居|朋友|家人|亲戚|同学|工友|领导|老师|学生|合伙人)/;

    for (let i = 0; i < allTimelineItems.length; i += 1) {
      for (let j = i + 1; j < allTimelineItems.length; j += 1) {
        const a = allTimelineItems[i];
        const b = allTimelineItems[j];
        const sharedPeople = a.people.filter((p) => b.people.some((q) => q === p || p.includes(q) || q.includes(p)));
        if (!sharedPeople.length) continue;

        const aMonth = (a.timelineDate || '').slice(0, 7);
        const bMonth = (b.timelineDate || '').slice(0, 7);
        const aYear = (a.timelineDate || '').slice(0, 4);
        const bYear = (b.timelineDate || '').slice(0, 4);
        const sameMonth = aMonth && bMonth && aMonth === bMonth;
        const sameYear = aYear && bYear && aYear === bYear;
        const fuzzyOverlap = !a.timelineDate || !b.timelineDate;
        if (!sameMonth && !sameYear && !fuzzyOverlap) continue;

        const sharedTimeLabels = fuzzyOverlap
          ? a.timeLabels.filter((tl) => b.timeLabels.some((other) => other === tl || other.includes(tl) || tl.includes(other)))
          : [];
        if (fuzzyOverlap && !sharedTimeLabels.length) continue;

        const aHasLifeChange = LIFE_CHANGE.test(`${a.title} ${a.text}`);
        const bHasLifeChange = LIFE_CHANGE.test(`${b.title} ${b.text}`);
        if (aHasLifeChange !== bHasLifeChange) {
          const lifeChangeItem = aHasLifeChange ? a : b;
          const normalItem = aHasLifeChange ? b : a;
          potentialConflicts.push({
            type: 'needs_clarification',
            severity: fuzzyOverlap ? 'low' : 'medium',
            person: sharedPeople[0],
            items: [
              { id: a.id, title: a.title, source: a.source },
              { id: b.id, title: b.title, source: b.source }
            ],
            reason: `${sharedPeople[0]} 在相近时间段内既有"${lifeChangeItem.title}"的记录，又有"${normalItem.title}"的记录，可能需要确认时间先后或记混了`,
            suggestedQuestion: `我记得${sharedPeople[0]}好像${LIFE_CHANGE.test(lifeChangeItem.title) ? lifeChangeItem.title : '在那段时间有变化'}，但这里又提到${normalItem.title}。是时间记混了吗？`
          });
        }

        const aRelations = a.title.match(RELATION_WORDS);
        const bRelations = b.title.match(RELATION_WORDS);
        if (aRelations && bRelations && aRelations[0] !== bRelations[0] && a.source === 'confirmedFacts' && b.source === 'confirmedFacts') {
          potentialConflicts.push({
            type: 'needs_clarification',
            severity: fuzzyOverlap ? 'low' : 'low',
            person: sharedPeople[0],
            items: [
              { id: a.id, title: a.title, source: a.source },
              { id: b.id, title: b.title, source: b.source }
            ],
            reason: `${sharedPeople[0]} 被标记为"${aRelations[0]}"，同时又被标记为"${bRelations[0]}"，可能需要确认`,
            suggestedQuestion: `${sharedPeople[0]} 是你的${aRelations[0]}还是${bRelations[0]}呀？还是两个身份都有？`
          });
        }
      }
    }

    return {
      person: person || null,
      items,
      fuzzyItems,
      potentialConflicts: potentialConflicts.slice(0, 3)
    };
  }

  async appendCandidate(candidate = {}, context = {}) {
    if (typeof this.writeState !== 'function') {
      throw new Error('MemoryStore appendCandidate requires writeState.');
    }
    const state = await this.getState();
    const normalized = normalizeMemoryCandidate(candidate, context);

    const nextState = {
      ...state,
      memoryCandidates: [
        normalized,
        ...(Array.isArray(state.memoryCandidates) ? state.memoryCandidates : [])
      ].slice(0, 40)
    };
    await this.writeState(nextState);
    return {
      ok: true,
      candidate: normalized,
      requiresUserConfirmation: true
    };
  }

  async confirmCandidate() {
    throw new Error('Confirmed fact writes are intentionally not exposed to Agent. Use the user confirmation flow.');
  }
}
