/*
 * Sample entries for the empty state. They are dated relative to now so the
 * decay states always look real: fresh, fading, and fully forgotten.
 */
(function (root) {
  'use strict';

  function buildExampleEntries(now) {
    var DAY = 86400000;
    var current = Number(now) || Date.now();
    var Engine = root.EmberEngine;

    return [
      Engine.makeEntry({
        id: 'sample-meeting',
        createdAt: current - 2 * DAY,
        span: 'month',
        title: 'The meeting that did not need me',
        body: [
          'I spent forty minutes in the Tuesday status meeting, mostly listening to people read their updates out loud. I was there to report, not to decide. Nadia asked me one question near the end, I answered it in a sentence, and the meeting moved on.',
          'I could have sent that sentence in a message. The strange part is that I felt useful afterward. Busy is not the same as needed.',
          'Next time I get the invite, I am going to ask what decision the meeting is making before I accept.'
        ].join('\n\n'),
        lessons: [
          'If I am only reporting, the meeting does not need me.',
          'Ask what decision the meeting is making before I accept.'
        ],
        tags: ['work'],
        sample: true
      }),
      Engine.makeEntry({
        id: 'sample-boat',
        createdAt: current - 12 * DAY,
        span: 'year',
        title: 'The second half of the boat story',
        body: [
          'Dad told the story about the boat again at dinner. I had heard the first half a dozen times: the engine dying, the coast guard radio, the long tow back. I usually nod at the same places.',
          'This time I asked what happened after the engine died. He talked for twenty minutes. The part I had never heard was about the man in the other boat who stayed with them until dawn and refused to take any money.',
          'He had been waiting for someone to ask. I had been waiting for the story to end.'
        ].join('\n\n'),
        lessons: [
          'Ask the follow-up question while they are still here.'
        ],
        tags: ['family'],
        sample: true
      }),
      Engine.makeEntry({
        id: 'sample-conference',
        createdAt: current - 19 * DAY,
        span: 'month',
        title: 'The conference I said no to',
        body: [
          'The invitation arrived in March and I said yes before I had even opened the calendar. Two weeks later I was dreading a three-day event I had no reason to attend except that being invited felt like proof I was still in the conversation.',
          'I wrote back and declined. Nobody was upset. The organizer said she understood. The relief was immediate and a little embarrassing.',
          'I had been protecting a version of myself who goes to things.'
        ].join('\n\n'),
        lessons: [
          'A no I choose early costs me less than a yes I resent.',
          'I am allowed to decline things that only flatter me.'
        ],
        tags: ['work', 'boundaries'],
        sample: true
      }),
      Engine.makeEntry({
        id: 'sample-sunday',
        createdAt: current - 50 * DAY,
        span: 'month',
        forgottenAt: current - 20 * DAY,
        body: null,
        title: 'The Sunday reset',
        lessons: [
          'A slow Sunday is maintenance, not laziness.'
        ],
        tags: ['health'],
        sample: true
      })
    ];
  }

  root.buildEmberExample = buildExampleEntries;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildExampleEntries: buildExampleEntries };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
