(function () {
  'use strict';

  var Engine = window.EmberEngine;
  var AI = window.EmberAI;
  var $ = function (id) { return document.getElementById(id); };

  var ENTRIES_KEY = 'ember:entries:v1';
  var MIN_BODY = 20;

  var state = {
    entries: [],
    query: '',
    tag: 'all',
    selectedId: null,
    editLessons: [],
    composerLessons: [''],
    distilling: false,
    settings: null
  };

  var els = {
    home: $('home'),
    aiChip: $('ai-chip'),
    aiLabel: $('ai-label'),
    settingsBtn: $('settings-btn'),
    hero: $('hero'),
    newEntry: $('new-entry'),
    sampleBtn: $('sample-btn'),
    archive: $('archive'),
    statsLine: $('stats-line'),
    archiveNew: $('archive-new'),
    sampleNote: $('sample-note'),
    removeSamples: $('remove-samples'),
    search: $('search'),
    tagFilters: $('tag-filters'),
    cards: $('cards'),
    noResults: $('no-results'),
    clearFilters: $('clear-filters'),
    composer: $('composer'),
    composerClose: $('composer-close'),
    entryTitle: $('entry-title'),
    entryBody: $('entry-body'),
    wordCount: $('word-count'),
    bodyHint: $('body-hint'),
    entryTags: $('entry-tags'),
    spanHelp: $('span-help'),
    distillBtn: $('distill-btn'),
    distillLabel: $('distill-label'),
    distillSpinner: $('distill-spinner'),
    distillStatus: $('distill-status'),
    lessonList: $('lesson-list'),
    addLesson: $('add-lesson'),
    composerCancel: $('composer-cancel'),
    sealBtn: $('seal-btn'),
    detail: $('detail'),
    detailEyebrow: $('detail-eyebrow'),
    detailDate: $('detail-date'),
    detailClose: $('detail-close'),
    detailTitle: $('detail-title'),
    detailSub: $('detail-sub'),
    detailBodyWrap: $('detail-body-wrap'),
    detailBody: $('detail-body'),
    decayBar: $('decay-bar'),
    decayNote: $('decay-note'),
    forgottenPanel: $('forgotten-panel'),
    forgottenText: $('forgotten-text'),
    detailLessons: $('detail-lessons'),
    editLessons: $('edit-lessons'),
    lessonEditor: $('lesson-editor'),
    editorList: $('editor-list'),
    addEditorLesson: $('add-editor-lesson'),
    cancelLessons: $('cancel-lessons'),
    saveLessons: $('save-lessons'),
    forgetNow: $('forget-now'),
    deleteEntry: $('delete-entry'),
    detailDone: $('detail-done'),
    settingsDialog: $('settings-dialog'),
    settingsClose: $('settings-close'),
    endpointInput: $('endpoint-input'),
    modelInput: $('model-input'),
    modelList: $('model-list'),
    settingsStatus: $('settings-status'),
    exportBtn: $('export-btn'),
    testBtn: $('test-btn'),
    settingsCancel: $('settings-cancel'),
    settingsSave: $('settings-save'),
    toast: $('toast')
  };

  var toastTimer = null;
  var tickTimer = null;

  /* ------------------------------------------------------------- helpers */

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
    }, 2800);
  }

  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }

  function plural(n, singular, pluralForm) {
    return n + ' ' + (n === 1 ? singular : (pluralForm || singular + 's'));
  }

  function shortDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function longDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function excerpt(text, max) {
    var flat = String(text || '').replace(/\s+/g, ' ').trim();
    if (flat.length <= max) return flat;
    return flat.slice(0, max - 1).trim() + '…';
  }

  function wordTotal(text) {
    var trimmed = String(text || '').trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  }

  function getSpan() {
    var checked = document.querySelector('input[name="span"]:checked');
    return checked ? checked.value : 'month';
  }

  function applyFade(el, progress) {
    el.style.setProperty('--decay-opacity', String(Math.max(0.55, 1 - progress * 0.38)));
    el.style.setProperty('--decay-blur', (progress * 0.45).toFixed(2) + 'px');
    if (progress > 0.12) {
      el.classList.add('is-fading');
    } else {
      el.classList.remove('is-fading');
    }
  }

  /* -------------------------------------------------------------- storage */

  function saveEntries() {
    try {
      localStorage.setItem(ENTRIES_KEY, JSON.stringify(state.entries));
    } catch (err) {
      // Private browsing can refuse writes. The session still works.
    }
  }

  function loadEntries() {
    var raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(ENTRIES_KEY) || '[]');
    } catch (err) {
      raw = null;
    }
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(function (entry) { return entry && typeof entry === 'object'; })
      .map(function (entry) { return Engine.makeEntry(entry); });
  }

  function findEntry(id) {
    for (var i = 0; i < state.entries.length; i++) {
      if (state.entries[i].id === id) return state.entries[i];
    }
    return null;
  }

  function replaceEntry(next) {
    state.entries = state.entries.map(function (entry) {
      return entry.id === next.id ? next : entry;
    });
  }

  /* ----------------------------------------------------------------- view */

  function showHero() {
    show(els.hero);
    hide(els.archive);
  }

  function showArchive(scroll) {
    hide(els.hero);
    show(els.archive);
    renderArchive();
    if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function renderArchive() {
    var summary = Engine.summarize(state.entries);
    els.statsLine.textContent =
      plural(summary.entries, 'entry', 'entries') + ' · ' +
      plural(summary.lessons, 'lesson') + ' kept · ' +
      (summary.forgotten ? plural(summary.forgotten, 'raw entry', 'raw entries') + ' forgotten' : 'nothing forgotten yet');

    if (state.entries.some(function (entry) { return entry.sample; })) {
      show(els.sampleNote);
    } else {
      hide(els.sampleNote);
    }

    renderTagFilters();
    renderCards();
  }

  function makeTagChip(tag, label, count) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag-chip';
    button.dataset.tag = tag;
    button.setAttribute('aria-pressed', String(state.tag === tag));
    button.appendChild(document.createTextNode(label));
    var countEl = document.createElement('span');
    countEl.className = 'count';
    countEl.textContent = String(count);
    button.appendChild(countEl);
    return button;
  }

  function renderTagFilters() {
    var counts = Engine.tagCounts(state.entries);
    if (state.tag !== 'all' && !counts.some(function (item) { return item.tag === state.tag; })) {
      state.tag = 'all';
    }

    els.tagFilters.replaceChildren();
    els.tagFilters.appendChild(makeTagChip('all', 'all', state.entries.length));
    counts.forEach(function (item) {
      els.tagFilters.appendChild(makeTagChip(item.tag, item.tag, item.count));
    });
  }

  function filteredEntries() {
    var list = Engine.searchEntries(state.entries, state.query);
    if (state.tag !== 'all') {
      list = list.filter(function (entry) { return entry.tags.indexOf(state.tag) !== -1; });
    }
    return list.sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  function renderCards() {
    var now = Date.now();
    var list = filteredEntries();
    els.cards.replaceChildren();

    if (!list.length) {
      show(els.noResults);
      return;
    }
    hide(els.noResults);

    list.forEach(function (entry) {
      els.cards.appendChild(makeCard(entry, now));
    });
  }

  function makeCard(entry, now) {
    var progress = entry.body ? Engine.decayProgress(entry, now) : 1;

    var card = document.createElement('article');
    card.className = 'card';
    card.dataset.id = entry.id;
    card.dataset.forgotten = String(!entry.body);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute(
      'aria-label',
      entry.title + ' — ' + (entry.body ? Engine.decayLabel(entry, now) : 'raw entry forgotten') + '. Open entry.'
    );

    var top = document.createElement('div');
    top.className = 'card-top';
    var date = document.createElement('span');
    date.className = 'card-date';
    date.textContent = shortDate(entry.createdAt);
    var span = document.createElement('span');
    span.className = 'span-chip';
    span.textContent = Engine.spanInfo(entry.span).short;
    top.appendChild(date);
    top.appendChild(span);

    var title = document.createElement('h2');
    title.className = 'card-title';
    title.textContent = entry.title;

    card.appendChild(top);
    card.appendChild(title);

    if (entry.body) {
      var body = document.createElement('p');
      body.className = 'card-body';
      body.textContent = excerpt(entry.body, 320);
      applyFade(body, progress);
      card.appendChild(body);
    } else {
      var gone = document.createElement('div');
      gone.className = 'card-forgotten';
      var flame = document.createElement('span');
      flame.className = 'forgotten-flame';
      flame.setAttribute('aria-hidden', 'true');
      var copy = document.createElement('div');
      var strong = document.createElement('strong');
      strong.textContent = 'Raw entry forgotten';
      var sub = document.createElement('span');
      sub.textContent = 'The details are gone. The lessons remain.';
      copy.appendChild(strong);
      copy.appendChild(sub);
      gone.appendChild(flame);
      gone.appendChild(copy);
      card.appendChild(gone);
    }

    var kept = document.createElement('div');
    kept.className = 'card-kept';
    var label = document.createElement('span');
    label.className = 'kept-label';
    label.textContent = 'Kept';
    kept.appendChild(label);

    if (entry.lessons.length) {
      var ul = document.createElement('ul');
      entry.lessons.slice(0, 2).forEach(function (lesson) {
        var li = document.createElement('li');
        li.textContent = lesson;
        ul.appendChild(li);
      });
      kept.appendChild(ul);
      if (entry.lessons.length > 2) {
        var more = document.createElement('span');
        more.className = 'card-more';
        more.textContent = '+' + (entry.lessons.length - 2) + ' more';
        kept.appendChild(more);
      }
    } else {
      var none = document.createElement('span');
      none.className = 'card-more';
      none.textContent = 'No lessons kept yet';
      kept.appendChild(none);
    }

    card.appendChild(kept);

    var foot = document.createElement('div');
    foot.className = 'card-foot';
    var left = document.createElement('div');
    left.className = 'card-foot-left';
    var status = document.createElement('span');
    status.className = 'card-status';
    status.textContent = entry.body
      ? Engine.decayLabel(entry, now)
      : 'forgotten ' + shortDate(entry.forgottenAt);
    left.appendChild(status);

    if (entry.body) {
      var track = document.createElement('span');
      track.className = 'card-progress';
      var fill = document.createElement('span');
      fill.style.width = Math.round(progress * 100) + '%';
      track.appendChild(fill);
      left.appendChild(track);
    }

    var tags = document.createElement('span');
    tags.className = 'card-tags';
    tags.textContent = entry.tags.length ? entry.tags.join(' · ') : 'untagged';

    foot.appendChild(left);
    foot.appendChild(tags);
    card.appendChild(foot);

    card.addEventListener('click', function () { openDetail(entry.id); });
    card.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetail(entry.id);
      }
    });

    return card;
  }

  /* --------------------------------------------------------------- decay */

  function runDecay(announce) {
    var result = Engine.applyDecay(state.entries, Date.now());
    if (!result.changed) return false;

    state.entries = result.entries;
    saveEntries();

    if (!els.archive.hidden) renderArchive();
    if (state.selectedId && els.detail.open) {
      var entry = findEntry(state.selectedId);
      if (entry) populateDetail(entry);
    }
    if (announce) toast('A memory window closed. The raw entry was deleted.');
    return true;
  }

  /* ------------------------------------------------------------ composer */

  function readComposerLessons() {
    return Array.prototype.map.call(
      els.lessonList.querySelectorAll('.lesson-input'),
      function (input) { return input.value; }
    );
  }

  function renderComposerLessons() {
    els.lessonList.replaceChildren();

    state.composerLessons.forEach(function (value, index) {
      var row = document.createElement('div');
      row.className = 'lesson-row';
      row.dataset.index = String(index);

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'lesson-input';
      input.maxLength = 240;
      input.autocomplete = 'off';
      input.value = value || '';
      input.placeholder = index === 0 ? 'What should survive this entry?' : 'Another thing worth keeping';
      input.setAttribute('aria-label', 'Lesson ' + (index + 1));

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'lesson-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove lesson ' + (index + 1));

      row.appendChild(input);
      row.appendChild(remove);
      els.lessonList.appendChild(row);
    });

    updateComposer();
  }

  function addComposerLesson() {
    state.composerLessons = readComposerLessons();
    state.composerLessons.push('');
    renderComposerLessons();
    var inputs = els.lessonList.querySelectorAll('.lesson-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  function removeComposerLesson(index) {
    state.composerLessons = readComposerLessons();
    if (state.composerLessons.length <= 1) {
      state.composerLessons = [''];
    } else {
      state.composerLessons.splice(index, 1);
    }
    renderComposerLessons();
  }

  function setSpanHelp() {
    var end = Engine.decayAt(Date.now(), getSpan());
    els.spanHelp.textContent = 'The raw entry is deleted on ' + longDate(end) + '. The lesson stays.';
  }

  function updateComposer() {
    var body = els.entryBody.value.trim();
    var words = wordTotal(body);
    var lessons = Engine.sanitizeLessons(readComposerLessons());

    els.wordCount.textContent = plural(words, 'word');

    if (!words) {
      els.bodyHint.textContent = 'A few honest sentences are enough.';
    } else if (words < 20) {
      els.bodyHint.textContent = 'Keep going — the details give the model something to work with.';
    } else {
      els.bodyHint.textContent = 'Good. Distill when you are ready, or write the lesson yourself.';
    }

    els.sealBtn.disabled = body.length < MIN_BODY || lessons.length === 0;
    els.distillBtn.disabled = state.distilling || body.length < MIN_BODY;
  }

  function openComposer() {
    if (els.composer.open) return;
    state.composerLessons = [''];
    state.distilling = false;
    els.entryTitle.value = '';
    els.entryBody.value = '';
    els.entryTags.value = '';
    var month = document.querySelector('input[name="span"][value="month"]');
    if (month) month.checked = true;
    els.distillLabel.textContent = 'Distill with AI';
    els.distillSpinner.hidden = true;
    els.distillStatus.hidden = true;
    els.distillStatus.textContent = '';
    els.distillStatus.className = 'distill-status';
    setSpanHelp();
    renderComposerLessons();
    updateComposer();
    els.composer.showModal();
    setTimeout(function () {
      if (els.composer.open) els.entryBody.focus();
    }, 40);
  }

  function distillEntry() {
    var body = els.entryBody.value.trim();
    if (state.distilling || body.length < MIN_BODY) return;

    if (endpointBlocked(state.settings.endpoint)) {
      els.distillStatus.hidden = false;
      els.distillStatus.className = 'distill-status bad';
      els.distillStatus.textContent = blockedMessage();
      return;
    }

    state.distilling = true;
    els.distillSpinner.hidden = false;
    els.distillLabel.textContent = 'Distilling…';
    els.distillStatus.hidden = false;
    els.distillStatus.className = 'distill-status';
    els.distillStatus.textContent = 'Reading the entry for what will still matter later…';
    updateComposer();

    AI.distill(body.slice(0, 12000), els.entryTitle.value.trim(), state.settings)
      .then(function (result) {
        if (!els.composer.open) return;
        if (!els.entryTitle.value.trim() && result.title) {
          els.entryTitle.value = result.title;
        }
        state.composerLessons = result.lessons.slice();
        renderComposerLessons();
        els.distillStatus.className = 'distill-status';
        els.distillStatus.textContent =
          'Kept ' + plural(result.lessons.length, 'lesson') + '. Edit anything that sounds wrong.';
      })
      .catch(function (err) {
        if (!els.composer.open) return;
        els.distillStatus.className = 'distill-status bad';
        els.distillStatus.textContent = AI.explainError(err);
      })
      .finally(function () {
        state.distilling = false;
        els.distillSpinner.hidden = true;
        els.distillLabel.textContent = 'Distill with AI';
        updateComposer();
      });
  }

  function sealEntry() {
    var body = els.entryBody.value.trim();
    var lessons = Engine.sanitizeLessons(readComposerLessons());
    if (body.length < MIN_BODY) {
      toast('Write a little more before sealing.');
      return;
    }
    if (!lessons.length) {
      toast('Keep at least one lesson — it is what survives.');
      return;
    }

    var entry = Engine.makeEntry({
      createdAt: Date.now(),
      span: getSpan(),
      title: els.entryTitle.value.trim(),
      body: body,
      lessons: lessons,
      tags: els.entryTags.value
    });

    state.entries.unshift(entry);
    saveEntries();
    els.composer.close();
    showArchive(true);
    toast('Sealed. The raw entry forgets on ' + longDate(entry.decayAt) + '.');
  }

  /* -------------------------------------------------------------- detail */

  function resetButtons() {
    disarm(els.forgetNow);
    disarm(els.deleteEntry);
  }

  function populateDetail(entry) {
    var now = Date.now();
    resetButtons();
    state.editLessons = [];
    els.lessonEditor.hidden = true;
    els.detailLessons.hidden = false;
    els.editLessons.hidden = false;
    els.editLessons.textContent = 'Edit';

    if (entry.body) {
      var progress = Engine.decayProgress(entry, now);
      els.detailEyebrow.textContent = 'Entry';
      els.detailDate.textContent = longDate(entry.createdAt) + ' · ' + Engine.spanInfo(entry.span).label;
      els.detailTitle.textContent = entry.title;
      els.detailSub.textContent =
        'Memory window: ' + Engine.spanInfo(entry.span).short + ' · ' + Engine.decayLabel(entry, now);
      show(els.detailBodyWrap);
      hide(els.forgottenPanel);
      els.detailBody.textContent = entry.body;
      applyFade(els.detailBody, progress);
      els.decayBar.style.width = Math.round(progress * 100) + '%';
      els.decayNote.textContent =
        Math.round(progress * 100) + '% faded · ' + Engine.decayLabel(entry, now);
      show(els.forgetNow);
    } else {
      els.detailEyebrow.textContent = 'Forgotten entry';
      els.detailDate.textContent = longDate(entry.createdAt);
      els.detailTitle.textContent = entry.title;
      els.detailSub.textContent = 'Forgotten on ' + longDate(entry.forgottenAt);
      hide(els.detailBodyWrap);
      show(els.forgottenPanel);
      els.forgottenText.textContent =
        'The memory window closed on ' + longDate(entry.forgottenAt) +
        '. The raw text was deleted from this browser. The lessons below are all that is left.';
      hide(els.forgetNow);
    }

    els.detailLessons.replaceChildren();
    if (entry.lessons.length) {
      entry.lessons.forEach(function (lesson) {
        var li = document.createElement('li');
        li.textContent = lesson;
        els.detailLessons.appendChild(li);
      });
    } else {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No lessons were kept. You can add one from memory.';
      els.detailLessons.appendChild(empty);
    }
  }

  function openDetail(id) {
    var entry = findEntry(id);
    if (!entry) return;
    state.selectedId = id;
    populateDetail(entry);
    els.detail.scrollTop = 0;
    els.detail.showModal();
  }

  function renderEditor() {
    els.editorList.replaceChildren();

    state.editLessons.forEach(function (value, index) {
      var row = document.createElement('div');
      row.className = 'lesson-edit-row';
      row.dataset.index = String(index);

      var input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 240;
      input.autocomplete = 'off';
      input.value = value || '';
      input.placeholder = 'The durable thing worth keeping';
      input.setAttribute('aria-label', 'Lesson ' + (index + 1));

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'lesson-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove lesson ' + (index + 1));

      row.appendChild(input);
      row.appendChild(remove);
      els.editorList.appendChild(row);
    });
  }

  function startEditingLessons() {
    var entry = findEntry(state.selectedId);
    if (!entry) return;
    state.editLessons = entry.lessons.length ? entry.lessons.slice() : [''];
    renderEditor();
    hide(els.detailLessons);
    hide(els.editLessons);
    show(els.lessonEditor);
    var first = els.editorList.querySelector('input');
    if (first) first.focus();
  }

  function readEditorLessons() {
    return Array.prototype.map.call(
      els.editorList.querySelectorAll('input'),
      function (input) { return input.value; }
    );
  }

  function addEditorLesson() {
    state.editLessons = readEditorLessons();
    state.editLessons.push('');
    renderEditor();
    var inputs = els.editorList.querySelectorAll('input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  function removeEditorLesson(index) {
    state.editLessons = readEditorLessons();
    if (state.editLessons.length <= 1) {
      state.editLessons = [''];
    } else {
      state.editLessons.splice(index, 1);
    }
    renderEditor();
  }

  function saveLessons() {
    var entry = findEntry(state.selectedId);
    if (!entry) return;

    var lessons = Engine.sanitizeLessons(readEditorLessons());
    if (!lessons.length) {
      toast('Keep at least one lesson, or cancel.');
      return;
    }

    entry.lessons = lessons;
    saveEntries();
    renderArchive();
    populateDetail(entry);
    toast('Lessons updated.');
  }

  function cancelLessonEdit() {
    var entry = findEntry(state.selectedId);
    if (entry) populateDetail(entry);
  }

  function forgetNow() {
    var entry = findEntry(state.selectedId);
    if (!entry || !entry.body) return;

    disarm(els.deleteEntry);
    if (els.forgetNow.dataset.armed === 'true') {
      disarm(els.forgetNow);
      var next = Engine.purgeNow(entry, Date.now());
      replaceEntry(next);
      saveEntries();
      renderArchive();
      populateDetail(next);
      toast('Raw entry deleted. The lesson remains.');
      return;
    }

    arm(els.forgetNow, 'Click again to forget for good');
  }

  function deleteEntry() {
    var entry = findEntry(state.selectedId);
    if (!entry) return;

    disarm(els.forgetNow);
    if (els.deleteEntry.dataset.armed === 'true') {
      disarm(els.deleteEntry);
      state.entries = state.entries.filter(function (item) { return item.id !== entry.id; });
      saveEntries();
      els.detail.close();
      if (state.entries.length) {
        showArchive(true);
      } else {
        showHero();
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      toast('Entry deleted.');
      return;
    }

    arm(els.deleteEntry, 'Click again to delete everything');
  }

  function arm(button, message) {
    disarm(els.forgetNow);
    disarm(els.deleteEntry);
    button.dataset.original = button.textContent;
    button.dataset.armed = 'true';
    button.textContent = message;
    button.classList.add('is-confirming');
    button._confirmTimer = setTimeout(function () { disarm(button); }, 5000);
  }

  function disarm(button) {
    if (!button) return;
    if (button._confirmTimer) {
      clearTimeout(button._confirmTimer);
      button._confirmTimer = null;
    }
    if (button.dataset.original) {
      button.textContent = button.dataset.original;
    }
    delete button.dataset.original;
    delete button.dataset.armed;
    button.classList.remove('is-confirming');
  }

  /* ------------------------------------------------------------- samples */

  function loadSamples() {
    var samples = window.buildEmberExample(Date.now());
    var existing = {};
    state.entries.forEach(function (entry) { existing[entry.id] = true; });

    var added = 0;
    samples.forEach(function (entry) {
      if (existing[entry.id]) return;
      state.entries.push(entry);
      added++;
    });

    if (!added) {
      toast('The sample journal is already here.');
      showArchive(true);
      return;
    }

    saveEntries();
    showArchive(true);
    toast('Sample journal added. Open a card to see how it works.');
  }

  function removeSamples() {
    state.entries = state.entries.filter(function (entry) { return !entry.sample; });
    saveEntries();
    if (state.entries.length) {
      renderArchive();
      toast('Sample entries removed.');
    } else {
      showHero();
      toast('Sample entries removed.');
    }
  }

  /* -------------------------------------------------------------- settings */

  function setSettingsStatus(message, kind) {
    els.settingsStatus.textContent = message;
    els.settingsStatus.className = 'settings-status' + (kind ? ' ' + kind : '');
  }

  function endpointBlocked(endpoint) {
    return window.location.protocol === 'https:' &&
      !AI.isLocalEndpoint(window.location.href) &&
      AI.isLocalEndpoint(endpoint);
  }

  function blockedMessage() {
    return "This hosted page can't reach Ollama on your computer. Browsers block HTTPS pages from calling localhost. Run the app locally for live AI — you can still write the lesson yourself.";
  }

  function fillModelList(models) {
    els.modelList.replaceChildren();
    models.forEach(function (name) {
      var option = document.createElement('option');
      option.value = name;
      els.modelList.appendChild(option);
    });
  }

  function openSettings() {
    els.endpointInput.value = state.settings.endpoint;
    els.modelInput.value = state.settings.model;
    setSettingsStatus('', '');
    els.settingsDialog.showModal();
  }

  function settingsFromForm() {
    var endpoint = els.endpointInput.value.trim() || AI.DEFAULTS.endpoint;
    if (!/^https?:\/\//i.test(endpoint)) endpoint = 'http://' + endpoint;
    return {
      endpoint: endpoint,
      model: els.modelInput.value.trim() || AI.DEFAULTS.model
    };
  }

  function testConnection() {
    var settings = settingsFromForm();
    if (endpointBlocked(settings.endpoint)) {
      setSettingsStatus(blockedMessage(), 'bad');
      return;
    }
    els.testBtn.disabled = true;
    els.testBtn.textContent = 'Testing…';
    setSettingsStatus('Contacting ' + settings.endpoint + '…', '');

    AI.listModels(settings, 8000)
      .then(function (models) {
        fillModelList(models);
        setSettingsStatus(
          'Connected. ' + plural(models.length, 'model') + ' available.',
          'ok'
        );
        if (!AI.isLocalEndpoint(settings.endpoint)) {
          setSettingsStatus(
            'Connected, but this endpoint is not on your machine. Your entries will leave this device.',
            'bad'
          );
        }
      })
      .catch(function (err) {
        setSettingsStatus(AI.explainError(err), 'bad');
      })
      .finally(function () {
        els.testBtn.disabled = false;
        els.testBtn.textContent = 'Test connection';
      });
  }

  function saveSettings() {
    state.settings = AI.saveSettings(settingsFromForm());
    els.settingsDialog.close();
    toast('Model settings saved.');
    checkAI();
  }

  function checkAI() {
    if (endpointBlocked(state.settings.endpoint)) {
      els.aiChip.dataset.state = 'offline';
      els.aiLabel.textContent = 'AI: local only';
      els.aiChip.title = blockedMessage();
      return;
    }
    els.aiChip.dataset.state = 'checking';
    els.aiLabel.textContent = 'AI: checking…';
    els.aiChip.title = 'Checking ' + state.settings.endpoint;

    AI.listModels(state.settings, 3000)
      .then(function (models) {
        els.aiChip.dataset.state = 'online';
        els.aiLabel.textContent = 'AI ready';
        els.aiChip.title = 'Connected to ' + state.settings.endpoint + ' · ' + state.settings.model;
        fillModelList(models);
      })
      .catch(function (err) {
        els.aiChip.dataset.state = 'offline';
        els.aiLabel.textContent = 'AI off';
        els.aiChip.title = AI.explainError(err);
      });
  }

  function exportJournal() {
    if (!state.entries.length) {
      toast('There is nothing to export yet.');
      return;
    }

    var payload = Engine.exportPayload(state.entries, Date.now());
    var blob = new Blob([payload], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    var stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = 'ember-journal-' + stamp + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('Journal exported.');
  }

  /* ---------------------------------------------------------------- bind */

  function bind() {
    els.home.addEventListener('click', function (event) {
      event.preventDefault();
      if (state.entries.length) showArchive(true);
      else {
        showHero();
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    });

    els.newEntry.addEventListener('click', openComposer);
    els.archiveNew.addEventListener('click', openComposer);
    els.sampleBtn.addEventListener('click', loadSamples);
    els.removeSamples.addEventListener('click', removeSamples);

    els.search.addEventListener('input', function () {
      state.query = els.search.value;
      renderCards();
    });

    els.tagFilters.addEventListener('click', function (event) {
      var chip = event.target.closest('.tag-chip');
      if (!chip) return;
      state.tag = chip.dataset.tag;
      renderTagFilters();
      renderCards();
    });

    els.clearFilters.addEventListener('click', function () {
      state.query = '';
      state.tag = 'all';
      els.search.value = '';
      renderTagFilters();
      renderCards();
      els.search.focus();
    });

    els.composerClose.addEventListener('click', function () { els.composer.close(); });
    els.composerCancel.addEventListener('click', function () { els.composer.close(); });
    els.entryBody.addEventListener('input', updateComposer);
    els.entryTitle.addEventListener('input', updateComposer);
    els.entryTags.addEventListener('input', updateComposer);

    document.querySelectorAll('input[name="span"]').forEach(function (radio) {
      radio.addEventListener('change', setSpanHelp);
    });

    els.addLesson.addEventListener('click', addComposerLesson);
    els.lessonList.addEventListener('input', updateComposer);
    els.lessonList.addEventListener('click', function (event) {
      var remove = event.target.closest('.lesson-remove');
      if (!remove) return;
      var row = remove.closest('.lesson-row');
      if (row) removeComposerLesson(Number(row.dataset.index));
    });

    els.distillBtn.addEventListener('click', distillEntry);
    els.sealBtn.addEventListener('click', sealEntry);

    els.detailClose.addEventListener('click', function () { els.detail.close(); });
    els.detailDone.addEventListener('click', function () { els.detail.close(); });
    els.detail.addEventListener('close', function () {
      state.selectedId = null;
      state.editLessons = [];
      resetButtons();
      els.lessonEditor.hidden = true;
      els.detailLessons.hidden = false;
      els.editLessons.hidden = false;
      els.editLessons.textContent = 'Edit';
    });

    els.editLessons.addEventListener('click', startEditingLessons);
    els.cancelLessons.addEventListener('click', cancelLessonEdit);
    els.saveLessons.addEventListener('click', saveLessons);
    els.addEditorLesson.addEventListener('click', addEditorLesson);
    els.editorList.addEventListener('click', function (event) {
      var remove = event.target.closest('.lesson-remove');
      if (!remove) return;
      var row = remove.closest('.lesson-edit-row');
      if (row) removeEditorLesson(Number(row.dataset.index));
    });

    els.forgetNow.addEventListener('click', forgetNow);
    els.deleteEntry.addEventListener('click', deleteEntry);

    els.aiChip.addEventListener('click', openSettings);
    els.settingsBtn.addEventListener('click', openSettings);
    els.settingsClose.addEventListener('click', function () { els.settingsDialog.close(); });
    els.settingsCancel.addEventListener('click', function () { els.settingsDialog.close(); });
    els.settingsSave.addEventListener('click', saveSettings);
    els.testBtn.addEventListener('click', testConnection);
    els.exportBtn.addEventListener('click', exportJournal);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) runDecay(true);
    });
  }

  /* ---------------------------------------------------------------- init */

  function init() {
    if (!Engine || !AI) {
      toast('Ember failed to load. Reload the page.');
      return;
    }

    state.settings = AI.getSettings();
    state.entries = loadEntries();

    var result = Engine.applyDecay(state.entries, Date.now());
    if (result.changed) {
      state.entries = result.entries;
      saveEntries();
    }

    bind();
    els.endpointInput.value = state.settings.endpoint;
    els.modelInput.value = state.settings.model;

    if (state.entries.length) {
      showArchive(false);
    } else {
      showHero();
    }

    // Catch a window that closes while the tab is open.
    tickTimer = setInterval(function () { runDecay(true); }, 30000);
    checkAI();
  }

  init();
})();
