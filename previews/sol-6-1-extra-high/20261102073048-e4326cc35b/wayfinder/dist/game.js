(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../src/wayfinder.js'));
  else root.LastSignal = factory(root.Wayfinder);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(Wayfinder) {
  'use strict';

  function create() {
    const engine = new Wayfinder.Engine({id: 'last-signal-v1', title: 'The Last Signal', variables: {lens: false, tuned: false, won: false, hints: 0}});
    const objects = [
      {id: 'landing', name: 'The landing', room: true, description: 'The last ferry has gone. Rain needles the black water, and somewhere beyond the breakwater a ship sounds its horn. Above you, the signal station stands dark. A narrow path runs north to its door; the sea wall lies east.', exits: {north: 'watch', east: 'seawall'}, sounds: 'A ship sounds three low notes. Too close to the rocks.'},
      {id: 'watch', name: 'The watch room', room: true, description: e => `A stove ticks in the corner. Charts cover the walls, their coastlines worn pale by generations of anxious fingers. Mara, the station keeper, sits beside a writing desk.${e.children('desk').some(object => object.id.endsWith('key')) ? ' A key catches the light on its surface.' : ''} To the west is the store; an iron hatch guards the stairs up to the lantern.`, exits: {south: 'landing', west: 'store', up: {to: 'lantern', door: 'hatch'}}, sounds: 'Rain on the roof. Mara counting seconds under her breath.'},
      {id: 'store', name: 'The store', room: true, description: 'Salt has found its way into everything. Rope hangs from pegs, and a tall supply cabinet occupies the far wall. Its iron lock has survived the damp. The watch room is east.', exits: {east: 'watch'}},
      {id: 'lantern', name: 'The lantern room', room: true, description: e => `The sea turns slowly behind rain-streaked glass. At the center of the room stands the signal lamp, ${e.get('lamp').on ? 'casting a steady white light' : e.get('clear-lens').parent === 'lamp' ? 'its clear lens fitted and ready' : 'its lens housing empty'}. Beside it, a brass dial controls the flash interval. A doorway leads east onto the gallery; the stairs descend through the hatch.`, exits: {down: {to: 'watch', door: 'hatch'}, east: 'gallery'}, sounds: 'The slow click of the clockwork mechanism.'},
      {id: 'gallery', name: 'The signal gallery', room: true, description: e => `Wind presses your coat against the railing. Heavy storm shutters ${e.get('shutters').open ? 'stand open beside' : 'cover'} the seaward face of the lamp. A bronze bell hangs beside them, its rope dark with rain. ${e.vars.won ? 'In the distance, the ship’s lights follow the safe channel home.' : 'Beyond the glass, a running light drifts toward the shoals.'} The lantern room is west.`, exits: {west: 'lantern'}, sounds: 'The sea keeps its own time beneath the gallery.'},
      {id: 'seawall', name: 'The sea wall', room: true, description: 'White water breaks against the granite. A half-submerged marker reads: “CHANNEL THREE — THREE FLASHES.” The station’s gallery is a black outline above you. The landing lies west.', exits: {west: 'landing'}, sounds: 'Surf rolls loose stones beneath the wall.'},
      {id: 'player', name: 'yourself', actor: true, parent: 'landing', proper: true, capacity: 12, description: 'A relief keeper, one night into the job. Your coat is wet through.'},
      {id: 'mara', name: 'Mara', aliases: ['keeper', 'station keeper', 'woman'], nouns: ['keeper', 'woman'], proper: true, actor: true, parent: 'watch', pronoun: 'her', description: 'Mara cradles a bandaged wrist. Her eyes keep returning to the dark lantern above.', converse: context => {
        const topic = context.slots.topic.toLowerCase();
        if (/key|hatch|cabinet/.test(topic)) context.say('“Brass for the hatch, iron for the cabinet,” Mara says. “My hands aren’t much use tonight. Take both.”');
        else if (/lens|lamp|light/.test(topic)) context.say('“A clear spare lens is in the supply cabinet. Fit it into the lamp, then switch the lamp on. Leave the cracked one.”');
        else if (/dial|signal|channel|ship|flash/.test(topic)) context.say('“Channel three. Set the dial to three, open the storm shutters, then ring the gallery bell. They’ll see the safe passage.”');
        else context.say('“The lamp failed an hour ago,” Mara says. “A ship is coming in blind. My logbook is on the desk. It tells you how to bring the signal back.”');
      }},
      {id: 'desk', name: 'writing desk', aliases: ['desk', 'table'], parent: 'watch', supporter: true, scenery: true, description: 'A scarred oak desk. The logbook is open beside two very different keys.'},
      {id: 'brass-key', name: 'small brass key', aliases: ['brass key'], nouns: ['key'], adjectives: ['small', 'brass', 'yellow'], parent: 'desk', description: 'A small brass key. A tag on its bow reads LANTERN HATCH.'},
      {id: 'iron-key', name: 'heavy iron key', aliases: ['iron key'], nouns: ['key'], adjectives: ['heavy', 'iron', 'grey'], parent: 'desk', description: 'A heavy iron key, marked SUPPLY.'},
      {id: 'logbook', name: 'keeper’s logbook', aliases: ['logbook', 'log', 'book', 'journal'], parent: 'desk', text: 'LAST WATCH / 23:40\n\nPrimary lens fractured. Clear spare in the supply cabinet; iron key on desk. Brass key opens the lantern hatch.\n\nTo restore the channel signal: fit the clear lens in the lamp and switch it on. Set the brass dial to 3. Open the storm shutters on the gallery, then ring the bell.\n\nThree flashes. A way home.', description: 'The keeper’s logbook, open to tonight’s entry. You can read it.'},
      {id: 'hatch', name: 'iron hatch', nouns: ['hatch', 'door'], adjectives: ['iron', 'locked'], parent: null, door: true, fixed: true, rooms: ['watch', 'lantern'], openable: true, lockable: true, locked: true, key: 'brass-key', description: e => `A heavy hatch leading to the lantern stairs. Its brass lock is ${e.get('hatch').locked ? 'fastened' : 'unfastened'}.`},
      {id: 'cabinet', name: 'supply cabinet', aliases: ['cabinet', 'cupboard'], adjectives: ['supply', 'tall'], parent: 'store', container: true, scenery: true, lockable: true, locked: true, key: 'iron-key', description: 'A tall cabinet with an iron lock. The faded label reads OPTICAL SPARES.'},
      {id: 'clear-lens', name: 'clear glass lens', aliases: ['clear lens', 'spare lens'], nouns: ['lens'], adjectives: ['clear', 'glass', 'spare', 'unbroken'], plurals: ['lenses'], parent: 'cabinet', description: 'An unbroken lens of beautifully clear glass. Three small notches match the lamp’s empty housing.'},
      {id: 'cracked-lens', name: 'cracked glass lens', aliases: ['cracked lens', 'broken lens'], nouns: ['lens'], adjectives: ['cracked', 'glass', 'broken'], plurals: ['lenses'], parent: 'cabinet', description: 'A crack runs straight through the center. It would scatter a signal into meaningless light.'},
      {id: 'lamp', name: 'signal lamp', aliases: ['lamp', 'lantern', 'housing'], parent: 'lantern', container: true, open: true, fixed: true, scenery: true, capacity: 1, light: true, switchable: true, description: e => e.get('clear-lens').parent === 'lamp' ? `The clear lens sits perfectly in its housing. The lamp is ${e.get('lamp').on ? 'burning with a steady white light' : 'ready to be switched on'}.` : 'A powerful electric lamp with an empty lens housing. Fit a clear lens in it before switching it on.'},
      {id: 'dial', name: 'brass dial', aliases: ['dial', 'wheel', 'control'], parent: 'lantern', fixed: true, scenery: true, state: {setting: 1}, description: e => `The brass dial has five numbered positions. It is set to ${e.get('dial').state.setting}. The logbook calls for channel three.`},
      {id: 'shutters', name: 'storm shutters', aliases: ['shutters', 'shutter', 'storm shutter'], nouns: ['shutter'], adjectives: ['storm', 'heavy'], parent: 'gallery', fixed: true, scenery: true, openable: true, description: e => e.get('shutters').open ? 'The shutters are open to the sea.' : 'The shutters are closed, protecting the lamp from the storm and hiding its light from the sea.'},
      {id: 'bell', name: 'bronze bell', aliases: ['bell', 'rope', 'bell rope'], adjectives: ['bronze'], parent: 'gallery', fixed: true, scenery: true, description: 'A deep bronze bell. Ringing it releases the signal mechanism and tells the incoming ship to watch the lamp.'},
      {id: 'charts', name: 'coastal charts', aliases: ['chart', 'maps', 'map'], parent: 'watch', scenery: true, description: 'The channel bends east of the shoals. Three flashes mark the safe approach.'},
      {id: 'stove', name: 'iron stove', aliases: ['stove'], parent: 'watch', scenery: true, description: 'A small fire, almost out. It has done its best.'},
      {id: 'marker', name: 'channel marker', aliases: ['marker', 'sign'], parent: 'seawall', scenery: true, text: 'CHANNEL THREE — THREE FLASHES. Keep east of the shoals.', description: 'A tide-worn marker. The inscription is still readable.'},
      {id: 'railing', name: 'gallery railing', aliases: ['railing', 'rail'], parent: 'gallery', scenery: true, description: 'Cold iron, solid beneath your hands. You are grateful for it.'}
    ];
    for (const object of objects) engine.add(object);
    engine.define('(set|tune|adjust) <item:noun> to <value:number>', 'set');
    engine.action('set', context => {
      if (context.slots.item !== 'dial') return context.fail('Only the brass dial can be set to a number.');
      if (context.slots.value < 1 || context.slots.value > 5) return context.fail('The dial is numbered from 1 to 5.');
      engine.get('dial').state.setting = context.slots.value;
      engine.vars.tuned = context.slots.value === 3;
      context.say(context.slots.value === 3 ? 'You turn the dial to three. The clockwork settles into a patient rhythm: three clicks, a pause, three clicks.' : `You set the dial to ${context.slots.value}. The mechanism ticks an unfamiliar pattern.`);
    });
    engine.define('(ring|sound) <item:noun>', 'ring');
    engine.action('ring', context => {
      if (context.slots.item !== 'bell') return context.fail('That cannot be rung.');
      if (engine.vars.won) return context.say('The bell’s last note has faded. The ship is safely in the channel.');
      if (!engine.get('lamp').on) return context.fail('The bell sounds once into the storm. Above it, the lamp remains dark. You need to restore its light first.');
      if (!engine.vars.tuned) return context.fail('The bell releases a confused pattern of light. You need to set the brass dial to the right channel.');
      if (!engine.get('shutters').open) return context.fail('The bell sounds, but the storm shutters swallow the signal. Open them to the sea.');
      engine.vars.won = true;
      engine.score = 3;
      context.say('You pull the rope. One deep note rolls across the water.');
      context.say('The lamp answers. Three white flashes cut through the rain. A pause. Three more.');
      context.say('For a long moment, nothing. Then the ship’s running light turns. Slowly, unmistakably, it clears the shoals and follows the channel home.');
      context.say('Below you, Mara opens the station door. Warm light falls across the landing.');
      context.say('Somewhere before dawn, the rain stops.', 'ending');
      context.emit('ending', {title: 'A way home', score: 3});
    });
    engine.rule('instead', 'pull', context => {
      if (context.slots.item === 'bell') {
        return engine.actions.get('ring').handler(context) ?? true;
      }
    });
    engine.rule('check', 'put', context => {
      if (context.slots.target !== 'lamp') return;
      if (context.slots.items.length !== 1 || context.slots.items[0] !== 'clear-lens') return context.fail('Only the unbroken clear lens will fit the lamp’s housing.');
    });
    engine.rule('check', 'close', context => {
      if (context.slots.item === 'lamp') return context.fail('The lens housing is designed to stay open.');
    });
    engine.rule('check', 'switchOn', context => {
      if (context.slots.item === 'lamp' && engine.get('clear-lens').parent !== 'lamp') return context.fail('The empty housing gives back a dull spark. Fit the clear lens first.');
    });
    engine.rule('check', 'take', context => {
      if (context.slots.items.includes('clear-lens') && engine.get('clear-lens').parent === 'lamp' && engine.get('lamp').on) return context.fail('Switch off the lamp before handling its lens.');
    });
    engine.rule('turn', '*', () => {
      engine.vars.lens = engine.get('clear-lens').parent === 'lamp' && engine.get('lamp').on;
      if (!engine.vars.won) engine.score = Number(engine.vars.lens) + Number(engine.vars.tuned);
    });
    engine.get('landing').visited = true;
    engine.seal();
    return engine;
  }

  const hints = [
    'Start in the watch room to the north. Read the logbook on the desk, or ask Mara about the signal.',
    'The brass key opens the lantern hatch. The iron key opens the supply cabinet in the store. If “key” is ambiguous, reply “brass,” “iron,” or a number.',
    'Unlock and open the supply cabinet. Take the clear lens. Unlock the hatch, go up, and PUT CLEAR LENS IN LAMP.',
    'SWITCH ON LAMP. SET DIAL TO 3. Go east, OPEN SHUTTERS, then RING BELL.'
  ];

  return Object.freeze({create, hints});
});
