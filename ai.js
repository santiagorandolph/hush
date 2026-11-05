/*
 * Local-model client for HUSH.
 *
 * Distillation happens against Ollama on this machine. No API key, no server,
 * no telemetry. If the model is unavailable, the journal still works — you
 * write the lesson yourself.
 */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'hush:settings:v1';
  var LEGACY_STORAGE_KEY = 'ember:settings:v1';
  var DEFAULTS = {
    endpoint: 'http://localhost:11434',
    model: 'llama3.1:latest'
  };

  var SYSTEM_PROMPT = [
    'You are a distillation editor for a journal whose raw entries are deleted on a schedule. Read the entry and keep only what will still matter when the details are gone.',
    '',
    'Return a single JSON object with exactly this shape:',
    '{',
    '  "title": "a short, evocative name for the entry",',
    '  "lessons": ["the durable thing worth keeping", "another, if it is genuinely separate"]',
    '}',
    '',
    'Rules:',
    '- Return 1 to 3 lessons.',
    '- Each lesson is first person, under 150 characters, concrete, and useful years from now.',
    '- Do not summarize the events. Extract the durable rule, observation, or reminder.',
    '- No generic advice, no therapy-speak, no "always" or "never" unless the entry earns it.',
    '- The title is under 60 characters and does not give away the lesson.',
    '- If the entry has little to teach, return one honest lesson about that instead of inventing depth.',
    '- JSON only: no preamble, no markdown, no code fences.'
  ].join('\n');

  function cleanEndpoint(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function getSettings() {
    var stored = {};
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        var legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          raw = legacy;
          try {
            localStorage.setItem(STORAGE_KEY, legacy);
          } catch (writeErr) {
            // Reading the old settings still works if the copy is refused.
          }
        }
      }
      stored = JSON.parse(raw || '{}') || {};
    } catch (err) {
      stored = {};
    }
    return {
      endpoint: cleanEndpoint(stored.endpoint) || DEFAULTS.endpoint,
      model: String(stored.model || '').trim() || DEFAULTS.model
    };
  }

  function saveSettings(settings) {
    var next = {
      endpoint: cleanEndpoint(settings.endpoint) || DEFAULTS.endpoint,
      model: String(settings.model || '').trim() || DEFAULTS.model
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function isLocalEndpoint(endpoint) {
    try {
      var host = new URL(endpoint).hostname;
      return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
    } catch (err) {
      return false;
    }
  }

  function timeoutSignal(ms) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, ms);
    return { signal: controller.signal, clear: function () { clearTimeout(timer); } };
  }

  async function listModels(settings, timeoutMs) {
    var current = settings || getSettings();
    var watchdog = timeoutSignal(timeoutMs || 5000);
    try {
      var res = await fetch(cleanEndpoint(current.endpoint) + '/api/tags', {
        method: 'GET',
        signal: watchdog.signal
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      return (data.models || []).map(function (model) { return model.name; });
    } finally {
      watchdog.clear();
    }
  }

  async function chat(settings, messages, timeoutMs) {
    var watchdog = timeoutSignal(timeoutMs || 120000);
    try {
      var res = await fetch(cleanEndpoint(settings.endpoint) + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: watchdog.signal,
        body: JSON.stringify({
          model: settings.model,
          stream: false,
          format: 'json',
          options: {
            temperature: 0.35,
            num_ctx: 8192,
            num_predict: 900
          },
          messages: messages
        })
      });

      if (!res.ok) {
        var detail = '';
        try {
          var body = await res.json();
          detail = body.error || '';
        } catch (err) {
          detail = '';
        }
        if (res.status === 404) {
          throw new Error('Model "' + settings.model + '" is not installed. Run: ollama pull ' + settings.model);
        }
        throw new Error(detail || ('The model endpoint returned HTTP ' + res.status + '.'));
      }

      var data = await res.json();
      if (!data.message || typeof data.message.content !== 'string') {
        throw new Error('The model returned an empty message.');
      }
      return data.message.content;
    } finally {
      watchdog.clear();
    }
  }

  function explainError(err) {
    var message = err && err.message ? err.message : String(err);
    if (err && (err.name === 'AbortError' || /aborted/i.test(message))) {
      return 'The model took too long to answer. Try a smaller model, or write the lesson yourself.';
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
      return "Couldn't reach the local model. Is Ollama running? Try `ollama serve`, then check the endpoint in settings.";
    }
    return message;
  }

  async function distill(body, title, settings) {
    var user = (title ? 'TITLE: ' + title + '\n\n' : '') + 'ENTRY:\n' + body;
    var raw = await chat(settings, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user }
    ]);

    var parsed = root.HushEngine.parseModelJSON(raw);
    var lessons = root.HushEngine.sanitizeLessons(parsed.lessons);
    if (!lessons.length) {
      throw new Error("The model didn't find a lesson to keep. Write one yourself — you know what mattered.");
    }

    var suggestedTitle = String(parsed.title || '').replace(/\s+/g, ' ').trim();
    if (suggestedTitle.length > 70) suggestedTitle = suggestedTitle.slice(0, 69).trim() + '…';

    return {
      title: suggestedTitle,
      lessons: lessons
    };
  }

  root.HushAI = {
    DEFAULTS: DEFAULTS,
    SYSTEM_PROMPT: SYSTEM_PROMPT,
    getSettings: getSettings,
    saveSettings: saveSettings,
    isLocalEndpoint: isLocalEndpoint,
    listModels: listModels,
    explainError: explainError,
    distill: distill
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
