(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Wayfinder = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const VERSION = '1.0.0';
  const ARTICLES = new Set(['a', 'an', 'the', 'some']);
  const PRONOUNS = new Set(['it', 'them', 'him', 'her', 'me', 'myself', 'yourself', 'itself', 'themselves']);
  const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
  const DIRECTIONS = {n: 'north', s: 'south', e: 'east', w: 'west', ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest', u: 'up', d: 'down', in: 'in', out: 'out', north: 'north', south: 'south', east: 'east', west: 'west', northeast: 'northeast', northwest: 'northwest', southeast: 'southeast', southwest: 'southwest', up: 'up', down: 'down', inside: 'in', outside: 'out'};
  const DYNAMIC = ['parent', 'open', 'locked', 'on', 'lit', 'worn', 'hidden', 'visited', 'moved', 'state'];
  const PHASES = new Set(['before', 'check', 'instead', 'after', 'report', 'turn']);
  const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);
  const unique = values => [...new Set(values)];
  const clone = value => JSON.parse(JSON.stringify(value));
  const normalize = text => String(text).normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'");
  const list = values => values.length < 2 ? values.join('') : `${values.slice(0, -1).join(', ')}${values.length > 2 ? ',' : ''} and ${values[values.length - 1]}`;
  const words = text => normalize(text).match(/[\p{L}\p{N}_]+(?:['-][\p{L}\p{N}_]+)*/gu) || [];
  const plural = word => /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : /(?:s|x|z|ch|sh)$/.test(word) ? `${word}es` : `${word}s`;
  const number = word => /^-?\d+$/.test(word) ? Number(word) : NUMBERS.indexOf(word) >= 0 ? NUMBERS.indexOf(word) : null;

  function tokenize(input) {
    if (typeof input !== 'string') throw new TypeError('Commands must be strings.');
    if (input.length > 2048) throw new RangeError('Keep commands under 2,049 characters.');
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      if (/\s/u.test(input[i])) {
        i++;
        continue;
      }
      const start = i;
      const char = input[i];
      if (char === '"' || char === '“' || char === "'") {
        const end = char === '“' ? '”' : char;
        let value = '';
        i++;
        while (i < input.length && input[i] !== end) {
          if (input[i] === '\\' && i + 1 < input.length) i++;
          value += input[i++];
        }
        if (input[i] !== end) throw new SyntaxError('Close the quotation marks first.');
        i++;
        tokens.push({text: value, value: normalize(value), kind: 'string', start, end: i});
      } else if (/[.,;!?]/.test(char)) {
        i++;
        tokens.push({text: char, value: char, kind: 'punctuation', start, end: i});
      } else {
        const match = input.slice(i).match(/^-?[\p{L}\p{N}_]+(?:['’\-][\p{L}\p{N}_]+)*(?:['’](?![\p{L}\p{N}_]))?/u);
        if (!match) throw new SyntaxError(`I cannot read the character “${char}”.`);
        i += match[0].length;
        tokens.push({text: match[0], value: normalize(match[0]), kind: 'word', start, end: i});
      }
      if (tokens.length > 96) throw new RangeError('Keep commands under 97 tokens.');
    }
    return tokens;
  }

  function compile(pattern) {
    if (typeof pattern !== 'string') throw new TypeError('Grammar patterns must be strings.');
    if (pattern.length > 8192) throw new RangeError('Grammar patterns may contain at most 8,192 characters.');
    const tokens = [];
    const scanner = /<[^<>]+>|[()[\]|]|[^\s()[\]|<>]+/gy;
    let cursor = 0;
    while (cursor < pattern.length) {
      if (/\s/.test(pattern[cursor])) {
        cursor++;
        continue;
      }
      scanner.lastIndex = cursor;
      const match = scanner.exec(pattern);
      if (!match) throw new SyntaxError(`Invalid grammar at character ${cursor + 1}.`);
      tokens.push(match[0]);
      cursor = scanner.lastIndex;
    }
    let at = 0;
    function expression(end) {
      const choices = [];
      let paths = [[]];
      while (at < tokens.length && tokens[at] !== end) {
        const token = tokens[at++];
        if (token === '|') {
          choices.push(...paths);
          paths = [[]];
          continue;
        }
        let next;
        if (token === '(' || token === '[') {
          const close = token === '(' ? ')' : ']';
          next = expression(close);
          if (tokens[at++] !== close) throw new SyntaxError(`Unclosed grammar group in ${pattern}`);
          if (token === '[') next.push([]);
        } else if (token === ')' || token === ']') {
          throw new SyntaxError(`Unexpected ${token} in ${pattern}`);
        } else if (token.startsWith('<')) {
          const match = token.match(/^<([a-zA-Z][\w]*):([a-zA-Z][\w]*)>$/);
          if (!match || RESERVED.has(match[1])) throw new SyntaxError(`Invalid capture ${token}`);
          next = [[{name: match[1], type: match[2]}]];
        } else {
          next = [[normalize(token)]];
        }
        paths = paths.flatMap(path => next.map(part => path.concat(part)));
        if (paths.length + choices.length > 256) throw new RangeError('A grammar may expand to at most 256 productions.');
      }
      return choices.concat(paths);
    }
    const paths = expression(null);
    if (at !== tokens.length || !paths.length || paths.some(path => !path.length)) throw new SyntaxError('Empty grammar production.');
    for (const path of paths) {
      const names = path.filter(part => typeof part !== 'string').map(part => part.name);
      if (new Set(names).size !== names.length) throw new SyntaxError('Capture names must be unique within a production.');
    }
    return paths;
  }

  class Grammar {
    constructor() {
      this.rules = [];
      this.index = new Map();
      this.wildcards = [];
      this.dictionary = new Set();
    }

    add(pattern, action, options = {}) {
      for (const parts of compile(pattern)) {
        const rule = {pattern, action, options, parts, order: this.rules.length};
        this.rules.push(rule);
        for (const part of parts) if (typeof part === 'string') this.dictionary.add(part);
        if (typeof parts[0] === 'string') {
          if (!this.index.has(parts[0])) this.index.set(parts[0], []);
          this.index.get(parts[0]).push(rule);
        } else this.wildcards.push(rule);
      }
      return this;
    }

    starts(tokens, at = 0) {
      return !!tokens[at] && (this.index.has(tokens[at].value) || !!DIRECTIONS[tokens[at].value]);
    }

    match(tokens) {
      const results = [];
      let budget = 12000;
      for (const rule of [...(this.index.get(tokens[0]?.value) || []), ...this.wildcards]) {
        const walk = (partAt, tokenAt, captures, literals, missing) => {
          if (--budget < 0) return;
          if (partAt === rule.parts.length) {
            if (tokenAt === tokens.length) results.push({rule, captures, literals, missing, tokens});
            return;
          }
          const part = rule.parts[partAt];
          if (typeof part === 'string') {
            if (tokens[tokenAt]?.kind !== 'string' && tokens[tokenAt]?.value === part) walk(partAt + 1, tokenAt + 1, captures, literals + 1, missing);
            else if (tokenAt === tokens.length && rule.parts.slice(partAt + 1).some(p => typeof p !== 'string')) walk(partAt + 1, tokenAt, captures, literals, missing + 1);
            return;
          }
          if (tokenAt === tokens.length) {
            walk(partAt + 1, tokenAt, {...captures, [part.name]: {...part, tokens: []}}, literals, missing + 1);
            return;
          }
          const single = ['direction', 'number', 'word'].includes(part.type);
          const max = single ? Math.min(tokenAt + 1, tokens.length) : tokens.length;
          for (let end = tokenAt + 1; end <= max; end++) {
            const next = rule.parts[partAt + 1];
            if (typeof next === 'string' && end < tokens.length && tokens[end].value !== next) continue;
            walk(partAt + 1, end, {...captures, [part.name]: {...part, tokens: tokens.slice(tokenAt, end)}}, literals, missing);
          }
        };
        walk(0, 0, {}, 0, 0);
      }
      return results;
    }
  }

  function nounTree(tokens, names) {
    const exact = tokens.slice();
    while (exact.length && ['the', 'a', 'an'].includes(exact[0].value)) exact.shift();
    const full = normalize(exact.map(token => token.text).join(' '));
    if (names?.has(full)) return {kind: 'noun', tokens: [{text: full, value: full, kind: 'string'}], owner: null, quantifier: null, count: null, ordinal: null, relation: null};
    const values = tokens.map(token => token.value);
    let at = values.findIndex(value => value === 'except' || value === 'but');
    if (at >= 0) return {kind: 'except', base: nounTree(tokens.slice(0, at), names), omit: nounTree(tokens.slice(at + 1), names)};
    const groups = [];
    let current = [];
    for (const token of tokens) {
      if (token.kind !== 'string' && [',', 'and'].includes(token.value)) {
        if (!current.length) return {kind: 'invalid'};
        groups.push(nounTree(current, names));
        current = [];
      } else current.push(token);
    }
    if (groups.length) {
      if (!current.length) return {kind: 'invalid'};
      return {kind: 'list', children: [...groups, nounTree(current, names)]};
    }
    let rest = tokens.slice();
    while (rest.length && ['the', 'a', 'an', 'some'].includes(rest[0].value)) rest.shift();
    if (!rest.length) return {kind: 'invalid'};
    let owner = null;
    if (rest[0].value === 'my' || rest[0].value === 'your') {
      const pronoun = rest[0].value === 'your' ? 'yourself' : 'me';
      owner = [{value: pronoun, text: pronoun, kind: 'word'}];
      rest.shift();
    } else {
      at = rest.findIndex(token => token.kind !== 'string' && /'s?$/.test(token.value));
      if (at >= 0) {
        owner = rest.slice(0, at + 1).map((token, index) => index === at ? {...token, value: token.value.replace(/'s?$/, '')} : token);
        rest = rest.slice(at + 1);
      }
    }
    let quantifier = null;
    let count = null;
    let ordinal = null;
    if (['all', 'every', 'everything', 'both', 'any', 'either'].includes(rest[0]?.value)) {
      quantifier = rest.shift().value;
      if (rest[0]?.value === 'of') rest.shift();
      if (rest[0]?.value === 'the') rest.shift();
    }
    if (number(rest[0]?.value) !== null && rest.length > 1) {
      count = number(rest.shift().value);
      if (rest[0]?.value === 'of') rest.shift();
      if (rest[0]?.value === 'the') rest.shift();
    }
    if (ORDINALS.includes(rest[0]?.value)) ordinal = ORDINALS.indexOf(rest.shift().value);
    else if (/^\d+(st|nd|rd|th)$/.test(rest[0]?.value)) ordinal = parseInt(rest.shift().value, 10) - 1;
    at = rest.findIndex(token => token.kind !== 'string' && ['in', 'inside', 'on', 'from', 'under'].includes(token.value));
    const relation = at >= 0 ? {word: rest[at].value, target: nounTree(rest.slice(at + 1), names)} : null;
    if (at >= 0) rest = rest.slice(0, at);
    return {kind: 'noun', tokens: rest, owner: owner ? nounTree(owner, names) : null, quantifier, count, ordinal, relation};
  }

  class Engine {
    constructor(options = {}) {
      this.id = options.id || 'wayfinder';
      this.title = options.title || 'An untitled story';
      this.player = options.player || 'player';
      this.grammar = new Grammar();
      this.entities = new Map();
      this.vocabulary = new Map();
      this.lexicons = new Map();
      this.phrases = new Set();
      this.actions = new Map();
      this.types = new Map();
      this.rules = [];
      this.listeners = new Map();
      this.vars = clone(options.variables || {});
      this.turn = 0;
      this.score = 0;
      this.pronouns = {};
      this.pending = null;
      this.lastCommand = null;
      this.lastAction = null;
      this.lastFailure = null;
      this.history = [];
      this.future = [];
      this.historyLimit = options.historyLimit ?? 100;
      if (!Number.isSafeInteger(this.historyLimit) || this.historyLimit < 0 || this.historyLimit > 10000) throw new RangeError('historyLimit must be an integer from 0 to 10,000.');
      this._output = null;
      this._events = null;
      this._busy = false;
      this._initial = null;
      this._depth = 0;
      this._install();
      for (const object of options.objects || []) this.add(object);
    }

    add(spec) {
      if (this._busy || this.turn || this.history.length) throw new Error('Define the world before play begins.');
      if (!spec || !/^[\w-]+$/.test(spec.id) || RESERVED.has(spec.id) || this.entities.has(spec.id)) throw new TypeError('Objects need unique alphanumeric IDs.');
      if (!spec.name) throw new TypeError(`Object ${spec.id} needs a name.`);
      const entity = {parent: null, portable: !spec.room && !spec.actor && !spec.scenery && !spec.fixed, open: false, locked: false, on: false, lit: false, worn: false, hidden: false, visited: false, moved: false, state: {}, ...spec};
      entity.state = clone(spec.state || {});
      this.entities.set(spec.id, entity);
      this._index(entity);
      this._initial = null;
      return entity;
    }

    _index(entity) {
      const names = unique([entity.name, ...(entity.aliases || [])].map(normalize));
      for (const name of names) this.phrases.add(name);
      const nouns = unique([...(entity.nouns || []), ...names.map(name => words(name).at(-1)).filter(Boolean)].flatMap(words));
      const plurals = unique([...(entity.plurals || []), ...nouns.map(plural)].flatMap(words));
      const lexicon = new Set([...names.flatMap(words), ...nouns, ...plurals, ...(entity.adjectives || []).flatMap(words)]);
      this.lexicons.set(entity.id, {names, nouns: new Set(nouns), plurals: new Set(plurals), words: lexicon});
      for (const word of lexicon) {
        if (!this.vocabulary.has(word)) this.vocabulary.set(word, new Set());
        this.vocabulary.get(word).add(entity.id);
      }
    }

    get(id) {
      return this.entities.get(id);
    }

    children(id) {
      return [...this.entities.values()].filter(object => object.parent === id);
    }

    roomOf(id = this.player) {
      const seen = new Set();
      let object = this.get(id);
      while (object && !object.room && !seen.has(object.id)) {
        seen.add(object.id);
        object = this.get(object.parent);
      }
      return object?.room ? object : null;
    }

    contains(parent, child) {
      const seen = new Set();
      let object = this.get(child);
      while (object && !seen.has(object.id)) {
        if (object.parent === parent) return true;
        seen.add(object.id);
        object = this.get(object.parent);
      }
      return false;
    }

    move(id, parent) {
      const object = this.get(id);
      if (!object || (parent !== null && !this.get(parent))) throw new TypeError('Move requires existing object IDs.');
      if (id === parent || this.contains(id, parent)) throw new RangeError('Containment cannot form a cycle.');
      object.parent = parent;
      object.moved = true;
      if (parent !== this.player) object.worn = false;
      return object;
    }

    scope(actor = this.player) {
      const room = this.roomOf(actor);
      if (!room) return [];
      const byParent = new Map();
      for (const object of this.entities.values()) {
        if (!byParent.has(object.parent)) byParent.set(object.parent, []);
        byParent.get(object.parent).push(object);
      }
      const visible = new Set([room.id, actor]);
      const visit = id => {
        for (const object of byParent.get(id) || []) {
          if (object.hidden || visible.has(object.id)) continue;
          visible.add(object.id);
          if (!object.container || object.open || object.transparent) visit(object.id);
        }
      };
      visit(room.id);
      visit(actor);
      for (const object of this.entities.values()) {
        if (object.door && object.rooms?.includes(room.id) && !object.hidden) visible.add(object.id);
      }
      if (room.dark && ![...visible].some(id => {
        const object = this.get(id);
        return object.lit || object.light && object.on;
      })) return [room.id, actor, ...[...visible].filter(id => this.contains(actor, id))];
      return [...visible];
    }

    reachable(id, actor = this.player, visible) {
      if (visible ? !visible.has(id) : !this.scope(actor).includes(id)) return false;
      const object = this.get(id);
      if (object.door) return true;
      let parent = this.get(object.parent);
      const seen = new Set();
      while (parent && !parent.room && parent.id !== actor && !seen.has(parent.id)) {
        seen.add(parent.id);
        if (parent.actor || parent.container && !parent.open) return false;
        parent = this.get(parent.parent);
      }
      return true;
    }

    held(id, actor = this.player) {
      return this.contains(actor, id);
    }

    define(pattern, action, options = {}) {
      this.grammar.add(pattern, action, options);
      return this;
    }

    action(name, handler, options = {}) {
      this.actions.set(name, {handler, ...options});
      return this;
    }

    type(name, parser) {
      this.types.set(name, parser);
      return this;
    }

    rule(phase, action, handler, priority = 0) {
      if (!PHASES.has(phase)) throw new TypeError(`Unknown rule phase ${phase}`);
      this.rules.push({phase, action, handler, priority, order: this.rules.length});
      this.rules.sort((a, b) => b.priority - a.priority || a.order - b.order);
      return this;
    }

    on(event, listener) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event).add(listener);
      return () => this.listeners.get(event)?.delete(listener);
    }

    say(text, type = 'narrative', data = {}) {
      if (text !== undefined && text !== null && text !== '') this._output?.push({type, text: String(text), ...data});
    }

    emit(type, data = {}) {
      this._events?.push({type, ...clone(data)});
    }

    name(id) {
      const object = this.get(id);
      return object ? `${object.proper ? '' : 'the '}${object.name}` : String(id);
    }

    description(id) {
      const object = this.get(id);
      if (!object) return '';
      return typeof object.description === 'function' ? object.description(this, object) : object.description || `You notice nothing unusual about ${this.name(id)}.`;
    }

    look(actor = this.player) {
      const room = this.roomOf(actor);
      if (!room) return;
      const visible = this.scope(actor);
      const dark = room.dark && !visible.some(id => this.get(id).lit || this.get(id).light && this.get(id).on);
      this.say(dark ? 'Darkness' : room.name, 'heading', {room: room.id});
      if (dark) {
        this.say('It is too dark to make out your surroundings.');
        return;
      }
      this.say(this.description(room.id));
      const loose = this.children(room.id).filter(object => object.id !== actor && !object.hidden && !object.scenery && !object.door);
      if (loose.length) this.say(`Here: ${list(loose.map(object => object.name))}.`, 'objects', {objects: loose.map(object => object.id)});
      const exits = Object.keys(room.exits || {});
      if (exits.length) this.say(`Exits: ${list(exits)}.`, 'exits', {directions: exits});
    }

    _noun(node, context, key) {
      if (Object.prototype.hasOwnProperty.call(context.overrides, key)) return {ids: context.overrides[key]};
      if (node.kind === 'invalid') return {error: 'That noun phrase is incomplete.'};
      if (node.kind === 'list') {
        let ids = [];
        for (let i = 0; i < node.children.length; i++) {
          const result = this._noun(node.children[i], context, `${key}.${i}`);
          if (!result.ids) return result;
          ids.push(...result.ids);
        }
        return {ids: unique(ids)};
      }
      if (node.kind === 'except') {
        const base = this._noun(node.base, {...context, multiple: true}, `${key}.base`);
        if (!base.ids) return base;
        const omit = this._noun(node.omit, {...context, multiple: true, universe: base.ids}, `${key}.omit`);
        if (!omit.ids) return omit;
        const ids = base.ids.filter(id => !omit.ids.includes(id));
        return ids.length ? {ids} : {error: 'There is nothing left after that exception.'};
      }
      const phrase = node.tokens.map(token => token.text).join(' ');
      const significant = node.tokens.flatMap(token => words(token.value));
      const visible = context.visible || new Set(this.scope(context.actor));
      let universe = context.universe || [...visible];
      if (context.source) universe = universe.filter(id => this.contains(context.source, id));
      if (context.creature) universe = universe.filter(id => this.get(id).actor);
      if (context.held) universe = universe.filter(id => this.held(id, context.actor));
      let ids;
      if (significant.length === 1 && PRONOUNS.has(significant[0])) {
        const word = significant[0];
        ids = ['me', 'myself', 'yourself'].includes(word) ? [word === 'yourself' ? context.actor : this.player] : this.pronouns[word] || this.pronouns[word === 'itself' ? 'it' : word === 'themselves' ? 'them' : word];
        if (!ids?.length) return {error: `I do not know what “${word}” refers to.`};
        ids = ids.filter(id => universe.includes(id));
        if (!ids.length) return {error: 'That is no longer in scope.'};
      } else if (!significant.length && node.quantifier) {
        ids = universe.filter(id => {
          const object = this.get(id);
          return object.portable && !object.scenery && id !== context.actor && this.reachable(id, context.actor, visible) && (context.action !== 'take' || !this.held(id, context.actor));
        });
        if (context.action === 'take') {
          const selected = new Set(ids);
          ids = ids.filter(id => {
            let parent = this.get(id).parent;
            while (parent) {
              if (selected.has(parent)) return false;
              parent = this.get(parent)?.parent;
            }
            return true;
          });
        }
      } else {
        if (!significant.length) return {error: 'Name an object first.'};
        const sets = significant.map(word => this.vocabulary.get(word));
        if (sets.some(set => !set)) {
          const unknown = significant.find(word => !this.vocabulary.has(word));
          return {error: `I do not recognize “${unknown}” as an object word.`, unknown};
        }
        const smallest = sets.reduce((a, b) => a.size <= b.size ? a : b);
        const allowed = new Set(universe);
        ids = [...smallest].filter(id => allowed.has(id) && sets.every(set => set.has(id)));
      }
      if (node.owner) {
        const owner = this._noun(node.owner, {...context, held: false, creature: false, multiple: false, source: null, universe: undefined}, `${key}.owner`);
        if (!owner.ids) return owner;
        ids = ids.filter(id => owner.ids.some(parent => this.contains(parent, id)));
      }
      if (node.relation) {
        const target = this._noun(node.relation.target, {...context, held: false, creature: false, multiple: false, source: null, universe: undefined}, `${key}.relation`);
        if (!target.ids) return target;
        ids = ids.filter(id => target.ids.some(parent => node.relation.word === 'on' ? this.get(id).parent === parent && this.get(parent).supporter : node.relation.word === 'under' ? this.get(id).state.under === parent : this.contains(parent, id)));
      }
      if (!ids.length) return {error: context.held ? `You are not carrying anything matching “${phrase || 'that'}”.` : `You cannot see anything matching “${phrase || 'that'}” here.`};
      if (node.ordinal !== null) return ids[node.ordinal] ? {ids: [ids[node.ordinal]]} : {error: `There are only ${ids.length} matching objects.`};
      if (node.count !== null) return node.count > 0 && ids.length >= node.count ? {ids: ids.slice(0, node.count)} : {error: `You can select between 1 and ${ids.length} matching objects.`};
      const isPlural = significant.some(word => ids.some(id => this.lexicons.get(id).plurals.has(word)));
      if (node.quantifier === 'any' || node.quantifier === 'either') return {ids: [ids[0]]};
      if (node.quantifier === 'both' && ids.length !== 2) return {error: `“Both” needs two matching objects; there are ${ids.length}.`};
      if (node.quantifier || isPlural && context.multiple || significant[0] === 'them' || significant[0] === 'themselves') return {ids};
      if (ids.length === 1) return {ids};
      const rank = id => {
        let score = this.lexicons.get(id).names.includes(normalize(phrase)) ? 4 : 0;
        const object = this.get(id);
        if (context.action === 'take' && !this.held(id, context.actor)) score += 2;
        if (context.action === 'open' && !object.open) score++;
        if (context.action === 'close' && object.open) score++;
        if (typeof context.preference === 'function') score += context.preference(object, context.slot, this) || 0;
        return score;
      };
      const scores = ids.map(rank);
      const max = Math.max(...scores);
      ids = ids.filter((id, index) => scores[index] === max);
      if (ids.length === 1) return {ids};
      return {question: {kind: 'ambiguous', key, phrase, candidates: ids, slot: context.slot}};
    }

    _resolve(syntax, overrides = {}) {
      const slots = {};
      const visibility = new Map();
      let actor = this.player;
      const entries = Object.values(syntax.captures).sort((a, b) => (a.name === 'actor' ? -10 : a.name === 'source' ? -5 : 0) - (b.name === 'actor' ? -10 : b.name === 'source' ? -5 : 0));
      for (const capture of entries) {
        const {name, type, tokens} = capture;
        let value;
        if (!tokens.length && !Object.prototype.hasOwnProperty.call(overrides, name)) return {status: 'clarification', question: {kind: 'missing', key: name, slot: name, captureType: type}, syntax, overrides};
        if (['noun', 'held', 'multi', 'multiheld', 'creature'].includes(type)) {
          const multiple = type === 'multi' || type === 'multiheld';
          if (!visibility.has(actor)) visibility.set(actor, new Set(this.scope(actor)));
          const universe = typeof syntax.rule.options.scope === 'function' ? syntax.rule.options.scope(this, name, actor) : undefined;
          const result = this._noun(nounTree(tokens, this.phrases), {actor, overrides, action: syntax.rule.action, slot: name, multiple, universe, visible: visibility.get(actor), held: ['held', 'multiheld'].includes(type), creature: type === 'creature', source: name === 'items' ? slots.source : null, preference: syntax.rule.options.prefer}, name);
          if (result.error) return {status: 'error', ...result};
          if (result.question) return {status: 'clarification', question: result.question, syntax, overrides};
          if (!multiple && result.ids.length > 1) return {status: 'error', error: 'That action requires one object at a time.'};
          value = multiple ? result.ids : result.ids[0];
        } else if (type === 'direction') value = DIRECTIONS[tokens[0]?.value];
        else if (type === 'number') value = number(tokens[0]?.value);
        else if (type === 'word') value = tokens[0]?.text;
        else if (type === 'topic') value = tokens.map(token => token.text).join(' ');
        else if (this.types.has(type)) {
          const parsed = this.types.get(type)(tokens, this);
          value = parsed?.value;
        } else throw new TypeError(`Unknown capture type ${type}`);
        if (value === undefined || value === null) return {status: 'error', error: `That is not a valid ${type}.`};
        slots[name] = value;
        if (name === 'actor') actor = value;
      }
      return {status: 'ready', action: syntax.rule.action, actor, slots, syntax};
    }

    parse(input) {
      let tokens;
      try {
        tokens = tokenize(input);
        if (!(tokens.length === 1 && tokens[0].value === '?')) tokens = tokens.filter(token => !['.', '!', '?'].includes(token.value) || token.kind === 'string');
      } catch (error) {
        return {status: 'error', error: error.message};
      }
      if (!tokens.length) return {status: 'error', error: 'Enter a command.'};
      let actorCapture;
      const comma = tokens.findIndex(token => token.value === ',' && token.kind !== 'string');
      if (comma > 0 && !this.grammar.starts(tokens)) {
        actorCapture = {name: 'actor', type: 'creature', tokens: tokens.slice(0, comma)};
        tokens = tokens.slice(comma + 1);
      }
      const matches = this.grammar.match(tokens).filter(syntax => typeof syntax.rule.parts[0] === 'string' || !this.grammar.index.has(tokens[0]?.value));
      const candidates = matches.map(syntax => {
        if (actorCapture) syntax.captures = {actor: actorCapture, ...syntax.captures};
        const resolved = this._resolve(syntax);
        return {...resolved, weight: (resolved.status === 'ready' ? 10000 : resolved.status === 'clarification' ? 5000 : 0) + syntax.literals * 20 - syntax.missing * 100000 + (syntax.rule.options.priority || 0), order: syntax.rule.order};
      }).sort((a, b) => b.weight - a.weight || a.order - b.order);
      if (candidates.length && (candidates[0].status !== 'error' || this.grammar.index.has(tokens[0]?.value) || DIRECTIONS[tokens[0]?.value])) return candidates[0];
      const unknown = !this.grammar.starts(tokens) ? tokens[0].value : null;
      return {status: 'error', error: unknown ? `I do not recognize the verb “${tokens[0].text}”.` : 'I could not fit that command to a grammar. Try VERB OBJECT, or HELP.', unknown};
    }

    _question(question) {
      if (question.kind === 'missing') return `What ${question.slot === 'items' || question.slot === 'item' ? 'object' : question.slot === 'target' ? 'destination' : question.slot} do you mean?`;
      return `Which do you mean: ${list(question.candidates.map((id, index) => `${index + 1}) ${this.name(id)}`))}?`;
    }

    _clarify(input) {
      const pending = this.pending;
      let tokens;
      try {
        tokens = tokenize(input).filter(token => !['.', '?', '!'].includes(token.value));
      } catch (error) {
        this.say(error.message, 'error');
        return null;
      }
      if (tokens[0]?.value === 'cancel') {
        this.pending = null;
        this.say('Command cancelled.', 'system');
        return null;
      }
      if (this.grammar.starts(tokens) && pending.question.kind !== 'missing' && this.parse(input).status === 'ready') {
        this.pending = null;
        return {newCommand: true};
      }
      const syntax = {...pending.syntax, captures: {...pending.syntax.captures}};
      const overrides = {...pending.overrides};
      if (pending.question.kind === 'missing') {
        if (this.grammar.starts(tokens) && !['direction', 'topic', 'word'].includes(pending.question.captureType) && this.parse(input).status === 'ready') {
          this.pending = null;
          return {newCommand: true};
        }
        syntax.captures[pending.question.key] = {...syntax.captures[pending.question.key], tokens};
      } else {
        if (tokens.length > 1 && tokens.at(-1).value === 'one') tokens.pop();
        const plain = tokens.map(token => token.value).filter(value => !ARTICLES.has(value));
        const numeric = number(plain[0]) !== null ? number(plain[0]) - 1 : ORDINALS.indexOf(plain[0]);
        let ids;
        if (plain.length === 1 && numeric >= 0) ids = pending.question.candidates[numeric] ? [pending.question.candidates[numeric]] : [];
        else {
          const result = this._noun(nounTree(tokens, this.phrases), {actor: this.player, overrides: {}, universe: pending.question.candidates, multiple: false, slot: pending.question.slot}, 'answer');
          ids = result.ids;
        }
        if (!ids || ids.length !== 1) {
          this.say(`Please choose one of those objects. ${this._question(pending.question)}`, 'question');
          return null;
        }
        overrides[pending.question.key] = ids;
      }
      const parsed = this._resolve(syntax, overrides);
      this.pending = null;
      return {...parsed, queue: pending.queue, command: pending.command};
    }

    _split(input) {
      const tokens = tokenize(input);
      const commands = [];
      let start = 0;
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.kind === 'string') continue;
        const separator = ['.', ';', 'then'].includes(token.value) || token.value === 'and' && (this.grammar.starts(tokens, i + 1) || tokens[i + 1]?.value === 'then');
        if (separator) {
          const command = input.slice(start, token.start).trim();
          if (command) commands.push(command);
          start = token.end;
        }
      }
      const tail = input.slice(start).trim();
      if (tail) commands.push(tail);
      if (commands.length > 32) throw new RangeError('Use at most 32 commands in one input.');
      return commands;
    }

    _remember(parsed) {
      const ordered = [parsed.slots.items, parsed.slots.item, ...Object.entries(parsed.slots).filter(([key]) => !['items', 'item'].includes(key)).map(([, value]) => value)];
      const ids = unique(ordered.flat().filter(value => typeof value === 'string' && this.get(value) && value !== parsed.actor));
      if (!ids.length) return;
      this.pronouns.them = ids;
      const objects = ids.filter(id => !this.get(id).actor);
      if (objects.length) this.pronouns.it = [objects[0]];
      for (const id of ids.filter(id => this.get(id).actor)) {
        const pronoun = this.get(id).pronoun || 'them';
        this.pronouns[pronoun] = [id];
      }
    }

    _context(parsed) {
      const context = {engine: this, actor: parsed.actor, action: parsed.action, slots: parsed.slots, syntax: parsed.syntax, relation: parsed.relation, implicit: !!parsed.implicit, cancelled: false, say: (text, type, data) => this.say(text, type, data), emit: (type, data) => this.emit(type, data), get: id => this.get(id), perform: (action, slots) => this._invoke(context, action, slots), fail: text => {
        context.cancelled = true;
        this.say(text, 'failure');
        return false;
      }};
      return context;
    }

    _runRules(phase, context) {
      let handled = false;
      for (const rule of this.rules) {
        if (rule.phase !== phase || rule.action !== '*' && rule.action !== context.action) continue;
        const result = rule.handler(context);
        if (result && typeof result.then === 'function') throw new TypeError('Action rules must be synchronous.');
        if (result === false || context.cancelled) return {blocked: true, handled};
        if (phase === 'instead' && result !== undefined) {
          handled = true;
          break;
        }
      }
      return {blocked: false, handled};
    }

    _pipeline(context, action) {
      for (const phase of ['before', 'check']) if (this._runRules(phase, context).blocked) return false;
      const instead = this._runRules('instead', context);
      if (instead.blocked) return false;
      if (!instead.handled) {
        const result = action.handler(context);
        if (result && typeof result.then === 'function') throw new TypeError('Action handlers must be synchronous.');
        if (result === false || context.cancelled) return false;
      }
      this._runRules('after', context);
      this._runRules('report', context);
      return !context.cancelled;
    }

    _invoke(parent, name, slots) {
      if (this._depth >= 16) throw new RangeError('Implicit actions exceeded the recursion limit.');
      const action = this.actions.get(name);
      if (!action) throw new TypeError(`No handler for implicit action ${name}.`);
      const context = this._context({actor: parent.actor, action: name, slots, implicit: true});
      this._depth++;
      try {
        const success = this._pipeline(context, action);
        this.emit('implicit-action', {action: name, actor: parent.actor, slots, success});
        if (!success) parent.cancelled = true;
        return success;
      } finally {
        this._depth--;
      }
    }

    _perform(parsed, command) {
      const action = this.actions.get(parsed.action);
      if (!action) {
        this.say(`No handler is registered for ${parsed.action}.`, 'error');
        return false;
      }
      const before = this.snapshot();
      const outputAt = this._output.length;
      const eventsAt = this._events.length;
      const context = this._context(parsed);
      let success = true;
      try {
        if (parsed.actor !== this.player && !this.get(parsed.actor).obedient) {
          const orders = this.get(parsed.actor).orders;
          if (!orders || orders(context) !== true) {
            this.say(`${this.name(parsed.actor)} declines the instruction.`, 'failure');
            return false;
          }
        }
        success = this._pipeline(context, action);
        if (success) {
          this._remember(parsed);
        }
        if (action.turn !== false) {
          this.turn++;
          this.lastCommand = command;
          const objectSlots = Object.values(parsed.syntax?.captures || {}).filter(capture => ['noun', 'held', 'multi', 'multiheld', 'creature'].includes(capture.type)).map(capture => capture.name);
          this.lastAction = {action: parsed.action, actor: parsed.actor, slots: clone(parsed.slots), relation: context.relation || null, objectSlots: parsed.objectSlots || objectSlots};
          this._runRules('turn', context);
          this.history.push(before);
          if (this.history.length > this.historyLimit) this.history.shift();
          this.future = [];
        }
        this.emit('action', {action: parsed.action, actor: parsed.actor, slots: parsed.slots, success});
        return success;
      } catch (error) {
        this._apply(before);
        this._output.length = outputAt;
        this._events.length = eventsAt;
        this.say('The action could not be completed. The world has been restored.', 'error');
        this.emit('exception', {action: parsed.action, message: error.message});
        return false;
      }
    }

    execute(input) {
      if (this._busy) throw new Error('execute() cannot be called recursively.');
      if (!this._initial) this.seal();
      this._busy = true;
      this._output = [];
      this._events = [];
      let status = 'ok';
      let ok = true;
      try {
        let queue;
        let continued = null;
        if (this.pending) {
          continued = this._clarify(input);
          if (!continued) queue = [];
          else if (continued.newCommand) queue = this._split(input);
          else queue = continued.queue || [];
        } else queue = this._split(input);
        if (!continued && !queue.length && !this._output.length) this.say('Enter a command.', 'system');
        while (continued && !continued.newCommand || queue.length) {
          const command = continued?.command || queue.shift();
          let parsed = continued && !continued.newCommand ? continued : this.parse(command);
          continued = null;
          if (parsed.status === 'ready' && parsed.action === 'again') {
            if (!this.lastAction) {
              this.say('There is no previous action to repeat.', 'system');
              break;
            }
            const last = this.lastAction;
            const scope = this.scope(last.actor);
            if (!this.scope().includes(last.actor) || last.objectSlots.some(key => [last.slots[key]].flat().some(id => !scope.includes(id)))) parsed = {status: 'error', error: 'An object from that action is no longer in scope.'};
            else parsed = {...last, slots: clone(last.slots), status: 'ready', repeat: true};
          }
          if (parsed.status === 'ready' && parsed.action === 'oops') {
            const replacement = parsed.slots.replacement;
            if (!this.lastFailure?.unknown) {
              this.say('There is no unknown word to correct.', 'system');
              break;
            }
            const failed = this.lastFailure;
            const bad = tokenize(failed.command).find(token => words(token.value).includes(failed.unknown));
            if (bad) {
              queue.unshift(failed.command.slice(0, bad.start) + replacement + failed.command.slice(bad.end));
              this.lastFailure = null;
              continue;
            }
          }
          if (parsed.status === 'clarification') {
            this.pending = {...parsed, queue, command};
            this.say(this._question(parsed.question), 'question');
            status = 'clarification';
            break;
          }
          if (parsed.status === 'error') {
            this.lastFailure = {command, unknown: parsed.unknown};
            let error = parsed.error;
            if (parsed.unknown) {
              const suggestion = this.suggest(parsed.unknown);
              if (suggestion) error += ` Did you mean “${suggestion}”? Try OOPS ${suggestion}.`;
            }
            this.say(error, 'error');
            status = 'error';
            ok = false;
            break;
          }
          this.lastFailure = null;
          if (!this._perform(parsed, parsed.repeat ? this.lastCommand : command)) {
            ok = false;
            status = 'failure';
            break;
          }
        }
        if (this.pending) status = 'clarification';
      } catch (error) {
        this.say(error.message, 'error');
        status = 'error';
        ok = false;
      }
      const result = {ok, status, messages: this._output, events: this._events, turn: this.turn, score: this.score, location: this.roomOf()?.id || null, clarification: this.pending ? {kind: this.pending.question.kind, slot: this.pending.question.slot, options: (this.pending.question.candidates || []).map(id => ({id, name: this.get(id).name}))} : null};
      this._output = null;
      this._events = null;
      this._busy = false;
      for (const event of result.events.slice()) for (const listener of this.listeners.get(event.type) || []) {
        try {
          listener(event, result);
        } catch (error) {
          result.events.push({type: 'listener-error', message: error.message});
        }
      }
      return result;
    }

    suggest(word) {
      let best = null;
      let distance = 3;
      for (const candidate of new Set([...this.grammar.dictionary, ...this.vocabulary.keys()])) {
        if (Math.abs(word.length - candidate.length) > 2) continue;
        let row = Array.from({length: candidate.length + 1}, (_, index) => index);
        let prior = null;
        for (let i = 1; i <= word.length; i++) {
          const next = [i];
          for (let j = 1; j <= candidate.length; j++) {
            next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (word[i - 1] === candidate[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && word[i - 1] === candidate[j - 2] && word[i - 2] === candidate[j - 1]) next[j] = Math.min(next[j], prior[j - 2] + 1);
          }
          prior = row;
          row = next;
        }
        if (row[candidate.length] < distance) {
          distance = row[candidate.length];
          best = candidate;
        }
      }
      return distance <= (word.length < 5 ? 1 : 2) ? best : null;
    }

    snapshot() {
      const objects = {};
      for (const object of this.entities.values()) objects[object.id] = Object.fromEntries(DYNAMIC.map(key => [key, clone(object[key] ?? null)]));
      return {format: 'wayfinder', version: 1, game: this.id, player: this.player, turn: this.turn, score: this.score, variables: clone(this.vars), objects, pronouns: clone(this.pronouns), lastCommand: this.lastCommand, lastAction: clone(this.lastAction)};
    }

    serialize() {
      return JSON.stringify(this.snapshot());
    }

    _validate(snapshot) {
      if (!snapshot || snapshot.format !== 'wayfinder' || snapshot.version !== 1 || snapshot.game !== this.id || snapshot.player !== this.player) throw new TypeError('This save belongs to a different story or format.');
      if (!Number.isSafeInteger(snapshot.turn) || snapshot.turn < 0 || !Number.isFinite(snapshot.score) || !snapshot.variables || typeof snapshot.variables !== 'object' || Array.isArray(snapshot.variables)) throw new TypeError('Invalid save state.');
      if (!snapshot.objects || Object.keys(snapshot.objects).length !== this.entities.size) throw new TypeError('The saved world does not match this story.');
      for (const [id] of this.entities) {
        const object = snapshot.objects[id];
        if (!object || !Object.prototype.hasOwnProperty.call(snapshot.objects, id)) throw new TypeError(`Missing saved object ${id}.`);
        if (object.parent !== null && !this.entities.has(object.parent)) throw new TypeError(`Invalid parent for ${id}.`);
        for (const key of DYNAMIC.filter(key => !['parent', 'state'].includes(key))) if (typeof object[key] !== 'boolean') throw new TypeError(`Invalid ${key} on ${id}.`);
        if (!object.state || typeof object.state !== 'object' || Array.isArray(object.state)) throw new TypeError(`Invalid custom state on ${id}.`);
        const seen = new Set([id]);
        let parent = object.parent;
        while (parent !== null) {
          if (seen.has(parent)) throw new TypeError('Saved containment contains a cycle.');
          seen.add(parent);
          parent = snapshot.objects[parent]?.parent;
          if (parent === undefined) throw new TypeError('Invalid containment in save.');
        }
      }
      if (!this.get(this.player)?.actor) throw new TypeError('The player must be an actor.');
      let parent = this.player;
      while (parent !== null && !this.get(parent).room) parent = snapshot.objects[parent].parent;
      if (parent === null) throw new TypeError('The saved player has no room.');
      if (!snapshot.pronouns || Object.values(snapshot.pronouns).some(ids => !Array.isArray(ids) || ids.some(id => !this.get(id)))) throw new TypeError('Invalid saved pronouns.');
      if (snapshot.lastCommand !== null && (typeof snapshot.lastCommand !== 'string' || snapshot.lastCommand.length > 2048)) throw new TypeError('Invalid saved command.');
      if (snapshot.lastAction !== null) {
        const last = snapshot.lastAction;
        if (!last || !this.actions.has(last.action) || !this.get(last.actor)?.actor || !last.slots || !Array.isArray(last.objectSlots) || last.objectSlots.some(key => !Object.prototype.hasOwnProperty.call(last.slots, key) || [last.slots[key]].flat().some(id => !this.get(id)))) throw new TypeError('Invalid saved action.');
      }
    }

    _apply(snapshot) {
      this.turn = snapshot.turn;
      this.score = snapshot.score;
      this.vars = clone(snapshot.variables);
      this.pronouns = clone(snapshot.pronouns);
      this.lastCommand = snapshot.lastCommand;
      this.lastAction = clone(snapshot.lastAction);
      for (const [id, object] of this.entities) for (const key of DYNAMIC) object[key] = clone(snapshot.objects[id][key]);
    }

    restore(data) {
      if (typeof data === 'string' && data.length > 4 * 1024 * 1024) throw new RangeError('The save is too large.');
      const snapshot = clone(typeof data === 'string' ? JSON.parse(data) : data);
      this._validate(snapshot);
      this._apply(snapshot);
      this.pending = null;
      this.lastFailure = null;
      this.history = [];
      this.future = [];
      return this.snapshot();
    }

    seal() {
      const snapshot = this.snapshot();
      this._validate(snapshot);
      this._initial = snapshot;
      return this;
    }

    restart() {
      if (!this._initial) this.seal();
      this.restore(this._initial);
      return this;
    }

    _touch(context, id) {
      if (!this.reachable(id, context.actor, context.visible)) return context.fail(`You cannot reach ${this.name(id)}.`);
      return true;
    }

    _take(context, id) {
      const object = this.get(id);
      if (object.parent === context.actor) return context.fail(`You already have ${this.name(id)}.`);
      if (!object.portable || object.actor || object.room) return context.fail(`You cannot take ${this.name(id)}.`);
      if (!this._touch(context, id)) return false;
      const actor = this.get(context.actor);
      if (actor.capacity !== undefined && this.children(context.actor).length >= actor.capacity) return context.fail('You cannot carry anything else.');
      if (this.contains(id, context.actor)) return context.fail('You cannot take something you are inside.');
      this.move(id, context.actor);
      this.say(context.implicit ? `(First taking ${this.name(id)}.)` : `Taken: ${object.name}.`, context.implicit ? 'implicit' : 'narrative');
      return true;
    }

    _ensureHeld(context, id) {
      if (this.get(id).parent === context.actor) return this._touch(context, id);
      return this._invoke(context, 'take', {items: [id]});
    }

    _each(context, callback) {
      const ids = context.slots.items || [context.slots.item];
      context.visible = new Set(this.scope(context.actor));
      let succeeded = false;
      let failed = false;
      for (const id of ids) {
        context.cancelled = false;
        const success = callback(id) !== false;
        succeeded ||= success;
        failed ||= !success;
      }
      context.cancelled = !succeeded;
      context.visible = undefined;
      return succeeded && !failed;
    }

    _install() {
      const bind = (pattern, name, handler, options = {}) => {
        this.define(pattern, name);
        if (handler) this.action(name, handler, options);
      };
      bind('(look|l) [around]', 'look', context => this.look(context.actor), {turn: false});
      bind('(inventory|inv|i)', 'inventory', context => {
        const objects = this.children(context.actor);
        this.say(objects.length ? `You are carrying ${list(objects.map(object => `${object.name}${object.worn ? ' (worn)' : ''}`))}.` : 'You are carrying nothing.');
      }, {turn: false});
      bind('(examine|inspect|x|look at|look in|look inside|look on) <item:noun>', 'examine', context => {
        const id = context.slots.item;
        const object = this.get(id);
        this.say(this.description(id));
        if (object.container || object.supporter) {
          if (object.container && !object.open && !object.transparent) this.say(`${this.name(id)} is closed.`);
          else {
            const contents = this.children(id).filter(item => !item.hidden);
            this.say(contents.length ? `${object.supporter ? 'On' : 'Inside'} ${this.name(id)}: ${list(contents.map(item => item.name))}.` : `${this.name(id)} is empty.`);
          }
        }
      });
      bind('(go|walk|head|move) <direction:direction>', 'go', context => {
        const room = this.roomOf(context.actor);
        let exit = room.exits?.[context.slots.direction];
        if (typeof exit === 'function') exit = exit(context);
        if (!exit) return context.fail('You cannot go that way.');
        if (typeof exit === 'string') exit = {to: exit};
        if (exit.door) {
          const door = this.get(exit.door);
          if (door.locked) return context.fail(`${this.name(door.id)} is locked.`);
          if (!door.open && !this._invoke(context, 'open', {item: door.id})) return false;
        }
        if (!this.get(exit.to)?.room) throw new TypeError('An exit must lead to a room.');
        this.move(context.actor, exit.to);
        this.get(exit.to).visited = true;
        this.look(context.actor);
        this.emit('travel', {from: room.id, to: exit.to, direction: context.slots.direction});
      });
      this.define('<direction:direction>', 'go');
      bind('(take|get|grab|pick up) <items:multi> [from <source:noun>]', 'take', context => this._each(context, id => this._take(context, id)));
      this.define('pick <items:multi> up', 'take');
      bind('(drop|discard|put down) <items:multiheld>', 'drop', context => this._each(context, id => {
        const object = this.get(id);
        if (object.worn) return context.fail(`Remove ${this.name(id)} first.`);
        if (!this._touch(context, id)) return false;
        this.move(id, this.roomOf(context.actor).id);
        this.say(`Dropped: ${object.name}.`);
      }));
      bind('(open|unseal) <item:noun>', 'open', context => {
        const object = this.get(context.slots.item);
        if (!this._touch(context, object.id)) return false;
        if (!object.openable && !object.container && !object.door) return context.fail('That does not open.');
        if (object.open) return context.fail('It is already open.');
        if (object.locked) return context.fail(`${this.name(object.id)} is locked.`);
        object.open = true;
        this.say(context.implicit ? `(First opening ${this.name(object.id)}.)` : `You open ${this.name(object.id)}.`, context.implicit ? 'implicit' : 'narrative');
        const contents = this.children(object.id).filter(item => !item.hidden);
        if (contents.length) this.say(`Inside: ${list(contents.map(item => item.name))}.`);
      });
      bind('(close|shut) <item:noun>', 'close', context => {
        const object = this.get(context.slots.item);
        if (!this._touch(context, object.id)) return false;
        if (!object.openable && !object.container && !object.door) return context.fail('That does not close.');
        if (!object.open) return context.fail('It is already closed.');
        object.open = false;
        this.say(context.implicit ? `(First closing ${this.name(object.id)}.)` : `You close ${this.name(object.id)}.`, context.implicit ? 'implicit' : 'narrative');
      });
      bind('(put|place|insert|fit) <items:multi> (in|into|inside|on|onto) <target:noun>', 'put', context => {
        const target = this.get(context.slots.target);
        const relation = context.engine._currentRelation(context);
        if (!this._touch(context, target.id)) return false;
        if (relation === 'on' && !target.supporter || relation !== 'on' && !target.container) return context.fail(`You cannot put things ${relation} ${this.name(target.id)}.`);
        if (target.container && !target.open && !this._invoke(context, 'open', {item: target.id})) return false;
        return this._each(context, id => {
          if (id === target.id || this.contains(id, target.id)) return context.fail('That would create an impossible arrangement.');
          if (target.capacity !== undefined && this.children(target.id).length >= target.capacity) return context.fail(`${this.name(target.id)} is full.`);
          if (!this._ensureHeld(context, id)) return false;
          if (this.get(id).worn) return context.fail(`Remove ${this.name(id)} first.`);
          this.move(id, target.id);
          this.say(`You put ${this.name(id)} ${relation} ${this.name(target.id)}.`);
        });
      });
      bind('(unlock|unfasten) <item:noun> [with <key:noun>]', 'unlock', context => this._lock(context, false));
      bind('lock <item:noun> [with <key:noun>]', 'lock', context => this._lock(context, true));
      bind('(switch|turn) on <item:noun>', 'switchOn', context => this._switch(context, true));
      this.define('(switch|turn) <item:noun> on', 'switchOn');
      this.define('light <item:noun>', 'switchOn');
      bind('(switch|turn) off <item:noun>', 'switchOff', context => this._switch(context, false));
      this.define('(switch|turn) <item:noun> off', 'switchOff');
      this.define('extinguish <item:noun>', 'switchOff');
      bind('(wear|put on) <items:multi>', 'wear', context => this._each(context, id => {
        const object = this.get(id);
        if (!object.wearable) return context.fail('You cannot wear that.');
        if (object.worn) return context.fail('You are already wearing it.');
        if (!this._ensureHeld(context, id)) return false;
        object.worn = true;
        this.say(`You put on ${this.name(id)}.`);
      }));
      this.define('put <items:multi> on', 'wear');
      bind('(remove|take off) <items:multiheld>', 'remove', context => this._each(context, id => {
        if (!this.get(id).worn) return context.fail('You are not wearing that.');
        this.get(id).worn = false;
        this.say(`You remove ${this.name(id)}.`);
      }));
      this.define('take <items:multiheld> off', 'remove');
      bind('give <items:multi> to <target:creature>', 'give', context => {
        const target = this.get(context.slots.target);
        if (!this._touch(context, target.id)) return false;
        if (!target.accepts) return context.fail(`${this.name(target.id)} does not want that.`);
        return this._each(context, id => {
          if (typeof target.accepts === 'function' && !target.accepts(this.get(id), this)) return context.fail(`${this.name(target.id)} declines ${this.name(id)}.`);
          if (!this._ensureHeld(context, id)) return false;
          this.move(id, target.id);
          this.say(`You give ${this.name(id)} to ${this.name(target.id)}.`);
        });
      });
      bind('(ask|tell) <target:creature> about <topic:topic>', 'ask', context => {
        const object = this.get(context.slots.target);
        if (object.converse) return object.converse(context);
        this.say(`${this.name(object.id)} has nothing to say about that.`);
      });
      bind('(talk|speak) to <target:creature>', 'talk', context => {
        const object = this.get(context.slots.target);
        if (object.converse) return object.converse({...context, slots: {...context.slots, topic: ''}});
        this.say(`${this.name(object.id)} has nothing to say.`);
      });
      bind('(read|consult) <item:noun>', 'read', context => {
        const object = this.get(context.slots.item);
        this.say(typeof object.text === 'function' ? object.text(this) : object.text || this.description(object.id));
      });
      for (const verb of ['push', 'pull', 'turn', 'touch', 'smell', 'listen to', 'search', 'eat', 'drink', 'use']) {
        const name = verb === 'listen to' ? 'listenTo' : verb;
        bind(`${verb} <item:noun>`, name, context => {
          const object = this.get(context.slots.item);
          if (!['smell', 'listenTo'].includes(name) && !this._touch(context, object.id)) return false;
          const response = object.responses?.[name];
          if (typeof response === 'function') return response(context);
          if (response) this.say(response);
          else return context.fail(`That has no useful effect on ${this.name(object.id)}.`);
        });
      }
      bind('(wait|z)', 'wait', () => this.say('A little time passes.'));
      bind('listen', 'listen', () => this.say(this.roomOf().sounds || 'You hear nothing unusual.'));
      bind('(help|instructions|?)', 'help', () => this.say('Use LOOK, EXAMINE object, TAKE object, INVENTORY, compass directions, OPEN, UNLOCK object WITH key, PUT object IN container, ASK person ABOUT topic, WAIT, UNDO, REDO, AGAIN, SAVE or RESTORE. Use adjectives to distinguish objects. You can TAKE ALL EXCEPT an object and join commands with THEN. Reply to a question with a name or number, or CANCEL.', 'help'), {turn: false});
      bind('(again|g)', 'again', () => {}, {turn: false});
      bind('oops <replacement:word>', 'oops', () => {}, {turn: false});
      bind('undo', 'undo', () => {
        if (!this.history.length) return this.say('There is nothing to undo.', 'system');
        this.future.push(this.snapshot());
        this._apply(this.history.pop());
        this.pending = null;
        this.say('Previous turn undone.', 'system');
        this.look();
        this.emit('undo');
      }, {turn: false});
      bind('redo', 'redo', () => {
        if (!this.future.length) return this.say('There is nothing to redo.', 'system');
        this.history.push(this.snapshot());
        this._apply(this.future.pop());
        this.say('Turn restored.', 'system');
        this.look();
        this.emit('redo');
      }, {turn: false});
      bind('save', 'save', () => {
        this.emit('save-request');
        this.say('Save requested.', 'system');
      }, {turn: false});
      bind('(restore|load)', 'restore', () => {
        this.emit('restore-request');
        this.say('Restore requested.', 'system');
      }, {turn: false});
    }

    _currentRelation(context) {
      if (context.relation) return context.relation;
      const parts = context.syntax?.rule.parts || [];
      const start = parts.findIndex(part => part.name === 'items');
      const end = parts.findIndex(part => part.name === 'target');
      const terminal = parts.slice(start + 1, end).find(part => ['in', 'into', 'inside', 'on', 'onto'].includes(part));
      context.relation = terminal ? ['on', 'onto'].includes(terminal) ? 'on' : 'in' : this.get(context.slots.target)?.supporter ? 'on' : 'in';
      return context.relation;
    }

    _lock(context, locking) {
      const object = this.get(context.slots.item);
      if (!this._touch(context, object.id)) return false;
      if (!object.lockable && !object.key) return context.fail('That has no lock.');
      if (object.locked === locking) return context.fail(`It is already ${locking ? 'locked' : 'unlocked'}.`);
      const key = context.slots.key || object.key;
      if (!key || !this.get(key) || key !== object.key) return context.fail('That key does not fit.');
      if (!context.slots.key && !this.held(key, context.actor)) return context.fail('You need to be holding the right key.');
      if (!this._ensureHeld(context, key)) return false;
      if (locking && object.open) {
        if (!this._invoke(context, 'close', {item: object.id})) return false;
      }
      object.locked = locking;
      this.say(`You ${locking ? 'lock' : 'unlock'} ${this.name(object.id)} with ${this.name(key)}.`);
    }

    _switch(context, on) {
      const object = this.get(context.slots.item);
      if (!this._touch(context, object.id)) return false;
      if (!object.switchable && !object.light) return context.fail('That has no switch.');
      if (object.on === on) return context.fail(`It is already ${on ? 'on' : 'off'}.`);
      object.on = on;
      this.say(`You switch ${this.name(object.id)} ${on ? 'on' : 'off'}.`);
    }
  }

  return Object.freeze({Engine, Grammar, tokenize, compile, version: VERSION});
});
