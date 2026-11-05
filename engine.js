/*
 * Ember — pure decay and distillation logic.
 *
 * An entry has a body with a shelf life. When the shelf life ends, the body is
 * deleted for real; the lessons remain. No DOM, no network, so the rules can be
 * tested in Node with a fake clock.
 */
(function (root) {
  'use strict';

  var DAY = 86400000;

  var SPANS = {
    week: { key: 'week', label: 'One week', short: '1 week', days: 7 },
    month: { key: 'month', label: 'One month', short: '1 month', days: 30 },
    quarter: { key: 'quarter', label: 'Three months', short: '3 months', days: 90 },
    year: { key: 'year', label: 'One year', short: '1 year', days: 365 }
  };

  function cleanInline(value, max) {
    if (value == null) return '';
    var text = String(value).replace(/\s+/g, ' ').trim();
    if (max && text.length > max) text = text.slice(0, max - 1).trim() + '…';
    return text;
  }

  function cleanText(value, max) {
    if (value == null) return '';
    var text = String(value).replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
    if (max && text.length > max) text = text.slice(0, max).trim() + '…';
    return text;
  }

  function spanInfo(key) {
    return SPANS[key] || SPANS.month;
  }

  function spanMs(key) {
    return spanInfo(key).days * DAY;
  }

  function decayAt(createdAt, span) {
    return createdAt + spanMs(span);
  }

  function decayProgress(entry, now) {
    if (!entry || !entry.body) return 1;
    var end = entry.decayAt || decayAt(entry.createdAt, entry.span);
    var total = end - entry.createdAt;
    if (total <= 0) return 1;
    var progress = (now - entry.createdAt) / total;
    return Math.max(0, Math.min(1, progress));
  }

  function isForgotten(entry, now) {
    if (!entry) return false;
    if (!entry.body) return true;
    return now >= (entry.decayAt || decayAt(entry.createdAt, entry.span));
  }

  function plural(n, unit) {
    return n + ' ' + unit + (n === 1 ? '' : 's');
  }

  function humanize(ms) {
    if (ms <= 0) return 'forgotten';
    var minutes = Math.round(ms / 60000);
    if (minutes < 60) return plural(Math.max(1, minutes), 'minute');
    var hours = Math.round(ms / 3600000);
    if (hours < 36) return plural(hours, 'hour');
    var days = Math.round(ms / DAY);
    if (days < 14) return plural(days, 'day');
    var weeks = Math.round(days / 7);
    if (days < 60) return plural(weeks, 'week');
    var months = Math.round(days / 30);
    if (months < 18) return plural(months, 'month');
    var years = Math.round((days / 365) * 10) / 10;
    return years + ' years';
  }

  function decayLabel(entry, now) {
    if (!entry || !entry.body) return 'raw entry forgotten';
    var remaining = (entry.decayAt || decayAt(entry.createdAt, entry.span)) - now;
    if (remaining <= 0) return 'forgetting now';
    return 'forgets in ' + humanize(remaining);
  }

  function applyDecay(entries, now) {
    var changed = false;
    var next = entries.map(function (entry) {
      if (!entry.body) return entry;
      var end = entry.decayAt || decayAt(entry.createdAt, entry.span);
      if (now < end) return entry;
      changed = true;
      var copy = Object.assign({}, entry);
      copy.body = null;
      copy.forgottenAt = entry.forgottenAt || end;
      return copy;
    });
    return { entries: next, changed: changed };
  }

  function purgeNow(entry, now) {
    var copy = Object.assign({}, entry);
    copy.body = null;
    copy.forgottenAt = now;
    return copy;
  }

  function sanitizeLessons(input) {
    var source = Array.isArray(input) ? input : input ? [input] : [];
    var seen = {};
    var out = [];

    source.forEach(function (item) {
      var text = cleanInline(
        typeof item === 'string' ? item : item && (item.text || item.lesson),
        240
      );
      if (!text) return;
      var key = text.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(text);
    });

    return out.slice(0, 4);
  }

  function sanitizeTags(input) {
    var source = Array.isArray(input) ? input : String(input || '').split(',');
    var seen = {};
    var out = [];

    source.forEach(function (item) {
      var tag = cleanInline(item, 26).toLowerCase().replace(/^#/, '');
      if (!tag || seen[tag]) return;
      seen[tag] = true;
      out.push(tag);
    });

    return out.slice(0, 5);
  }

  function titleFromBody(body) {
    var firstLine = cleanText(body, 300).split('\n')[0] || '';
    var sentence = firstLine.split(/[.!?]/)[0] || firstLine;
    return cleanInline(sentence, 70) || 'Untitled entry';
  }

  function makeId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'e-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function makeEntry(input) {
    var source = input || {};
    var createdAt = Number(source.createdAt) || Date.now();
    var span = SPANS[source.span] ? source.span : 'month';
    var body = source.body === null ? null : cleanText(source.body, 50000);

    return {
      id: source.id || makeId(),
      createdAt: createdAt,
      decayAt: Number(source.decayAt) || decayAt(createdAt, span),
      span: span,
      title: cleanInline(source.title, 80) || titleFromBody(body),
      body: body,
      forgottenAt: Number(source.forgottenAt) || (body === null ? createdAt : null),
      lessons: sanitizeLessons(source.lessons),
      tags: sanitizeTags(source.tags),
      sample: !!source.sample
    };
  }

  function parseModelJSON(text) {
    if (!text) throw new Error('The model returned an empty response.');
    var source = String(text).trim();
    source = source.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

    try {
      return JSON.parse(source);
    } catch (err) {
      // Some models wrap JSON in prose.
    }

    var start = source.indexOf('{');
    var end = source.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(source.slice(start, end + 1));
      } catch (err) {
        // fall through
      }
    }

    throw new Error('The model did not return readable JSON.');
  }

  function searchEntries(entries, query) {
    var q = cleanInline(query, 80).toLowerCase();
    if (!q) return entries.slice();
    return entries.filter(function (entry) {
      var haystack = [
        entry.title,
        entry.tags.join(' '),
        entry.lessons.join(' '),
        entry.body || ''
      ].join(' ').toLowerCase();
      return haystack.indexOf(q) !== -1;
    });
  }

  function tagCounts(entries) {
    var counts = {};
    entries.forEach(function (entry) {
      entry.tags.forEach(function (tag) {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.keys(counts)
      .map(function (tag) { return { tag: tag, count: counts[tag] }; })
      .sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return a.tag.localeCompare(b.tag);
      });
  }

  function summarize(entries) {
    var lessons = 0;
    var forgotten = 0;
    entries.forEach(function (entry) {
      lessons += entry.lessons.length;
      if (!entry.body) forgotten++;
    });
    return {
      entries: entries.length,
      lessons: lessons,
      forgotten: forgotten,
      kept: entries.length - forgotten
    };
  }

  function exportPayload(entries, now) {
    return JSON.stringify({
      app: 'ember',
      version: 1,
      exportedAt: new Date(now || Date.now()).toISOString(),
      entries: entries.map(function (entry) {
        return {
          id: entry.id,
          createdAt: entry.createdAt,
          decayAt: entry.decayAt,
          span: entry.span,
          title: entry.title,
          body: entry.body,
          forgottenAt: entry.forgottenAt,
          lessons: entry.lessons,
          tags: entry.tags
        };
      })
    }, null, 2);
  }

  var EmberEngine = {
    SPANS: SPANS,
    spanInfo: spanInfo,
    spanMs: spanMs,
    decayAt: decayAt,
    decayProgress: decayProgress,
    isForgotten: isForgotten,
    humanize: humanize,
    decayLabel: decayLabel,
    applyDecay: applyDecay,
    purgeNow: purgeNow,
    sanitizeLessons: sanitizeLessons,
    sanitizeTags: sanitizeTags,
    titleFromBody: titleFromBody,
    makeEntry: makeEntry,
    parseModelJSON: parseModelJSON,
    searchEntries: searchEntries,
    tagCounts: tagCounts,
    summarize: summarize,
    exportPayload: exportPayload
  };

  root.EmberEngine = EmberEngine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EmberEngine;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
