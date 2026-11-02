(function() {
  'use strict';

  const game = LastSignal.create();
  const find = id => document.getElementById(id);
  const transcript = find('transcript');
  const input = find('command');
  const saveKey = 'wayfinder:last-signal:save:v1';
  const records = [];
  const commandHistory = [];
  let historyAt = 0;
  let draft = '';
  let lastSavedState = '';
  let toastTimer;

  function toast(text) {
    clearTimeout(toastTimer);
    find('toast').textContent = text;
    find('toast').hidden = false;
    toastTimer = setTimeout(() => { find('toast').hidden = true; }, 4500);
  }

  function append(command, result, remember = true) {
    if (remember) records.push({command, messages: result.messages, turn: result.turn});
    const entry = document.createElement('article');
    entry.className = 'entry';
    if (command) {
      const echo = document.createElement('div');
      echo.className = 'command-echo';
      const prompt = document.createElement('span');
      prompt.textContent = '>';
      prompt.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.textContent = command;
      const turn = document.createElement('span');
      turn.className = 'echo-turn';
      turn.textContent = String(result.turn).padStart(2, '0');
      echo.append(prompt, text, turn);
      entry.append(echo);
    }
    for (const message of result.messages) {
      const node = document.createElement(message.type === 'heading' ? 'h2' : 'p');
      node.className = `message-${message.type.replace(/[^a-z-]/g, '')}`;
      node.textContent = message.text;
      entry.append(node);
    }
    transcript.append(entry);
  }

  function update() {
    const room = game.roomOf();
    find('location-name').textContent = room.name;
    find('turn-count').textContent = `TURN ${String(game.turn).padStart(2, '0')}`;
    find('exit-buttons').replaceChildren();
    for (const direction of Object.keys(room.exits || {})) {
      const button = document.createElement('button');
      button.textContent = direction;
      button.dataset.command = direction;
      button.setAttribute('aria-label', `Go ${direction}`);
      find('exit-buttons').append(button);
    }
    find('inventory-list').replaceChildren();
    const carried = game.children(game.player);
    if (!carried.length) {
      const item = document.createElement('li');
      item.className = 'muted';
      item.textContent = 'Nothing yet.';
      find('inventory-list').append(item);
    }
    for (const object of carried) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.textContent = object.name;
      button.dataset.command = `examine ${object.name}`;
      button.setAttribute('aria-label', `Examine ${object.name}`);
      item.append(button);
      find('inventory-list').append(item);
    }
    const goals = [game.vars.lens, game.vars.tuned, game.vars.won];
    ['goal-light', 'goal-tune', 'goal-signal'].forEach((id, index) => {
      find(id).classList.toggle('complete', !!goals[index]);
      find(id).setAttribute('aria-label', `${find(id).textContent}: ${goals[index] ? 'complete' : 'incomplete'}`);
    });
    find('progress-count').textContent = `${goals.filter(Boolean).length} / 3`;
    find('ending-card').hidden = !game.vars.won;
    find('clarification').hidden = !game.pending;
    find('clarification-options').replaceChildren();
    if (game.pending) {
      const candidates = game.pending.question.candidates || [];
      candidates.forEach((id, index) => {
        const button = document.createElement('button');
        button.textContent = game.get(id).name;
        button.dataset.command = String(index + 1);
        find('clarification-options').append(button);
      });
      find('clarification').firstElementChild.textContent = candidates.length ? 'WHICH DO YOU MEAN?' : 'FINISH YOUR COMMAND';
      input.placeholder = candidates.length ? 'A name, adjective, or number…' : `Which ${game.pending.question.slot}?`;
    } else input.placeholder = 'What will you do?';
    find('session-state').textContent = lastSavedState ? game.serialize() === lastSavedState ? 'PROGRESS SAVED' : 'UNSAVED PROGRESS' : 'SESSION IN MEMORY';
  }

  function scrollToLatest() {
    requestAnimationFrame(() => find('input-anchor').scrollIntoView({block: 'end', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'}));
  }

  function submit(command) {
    command = command.trim();
    if (!command) return;
    if (commandHistory.at(-1) !== command) commandHistory.push(command);
    historyAt = commandHistory.length;
    draft = '';
    const result = game.execute(command);
    append(command, result);
    input.value = '';
    update();
    for (const event of result.events) {
      if (event.type === 'save-request') save();
      if (event.type === 'restore-request') openLoad();
    }
    input.focus({preventScroll: true});
    scrollToLatest();
  }

  function saveData() {
    return {format: 'last-signal-session', version: 1, saved: new Date().toISOString(), state: game.snapshot(), transcript: records.slice(-500)};
  }

  function save() {
    try {
      localStorage.setItem(saveKey, JSON.stringify(saveData()));
      lastSavedState = game.serialize();
      update();
      toast('Progress saved on this device.');
    } catch (error) {
      toast('Device storage is unavailable. Use The engine → Export game save to keep a file.');
    }
  }

  function validateSession(data) {
    if (!data || data.format !== 'last-signal-session' || data.version !== 1 || !Array.isArray(data.transcript) || data.transcript.length > 500) throw new Error('This is not a valid Last Signal save.');
    for (const record of data.transcript) {
      if (!record || typeof record.command !== 'string' || record.command.length > 2048 || !Number.isSafeInteger(record.turn) || !Array.isArray(record.messages) || record.messages.length > 256) throw new Error('The saved transcript is invalid.');
      for (const message of record.messages) if (!message || typeof message.text !== 'string' || typeof message.type !== 'string') throw new Error('The saved transcript is invalid.');
    }
  }

  function restore(data) {
    validateSession(data);
    game.restore(data.state);
    transcript.replaceChildren();
    records.length = 0;
    for (const record of data.transcript) append(record.command, record);
    append('look', game.execute('look'));
    lastSavedState = game.serialize();
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    update();
    toast('Saved story restored.');
    scrollToLatest();
  }

  function openLoad() {
    let saved;
    try {
      const raw = localStorage.getItem(saveKey);
      saved = raw ? JSON.parse(raw) : null;
    } catch (error) {
      saved = null;
    }
    find('restore-local').disabled = !saved;
    const date = saved?.saved ? new Date(saved.saved) : null;
    find('save-description').textContent = saved ? `Saved on this device${date && !Number.isNaN(date.getTime()) ? ` ${date.toLocaleString()}` : ''}. Loading will replace your current progress.` : 'No saved game on this device yet. You can import a save file instead.';
    find('load-dialog').showModal();
  }

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  find('command-form').addEventListener('submit', event => {
    event.preventDefault();
    submit(input.value);
  });
  document.addEventListener('click', event => {
    const command = event.target.closest('[data-command]');
    if (command) submit(command.dataset.command);
    const close = event.target.closest('[data-close]');
    if (close) find(close.dataset.close).close();
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' && (input.selectionStart === 0 || historyAt < commandHistory.length)) {
      event.preventDefault();
      if (historyAt === commandHistory.length) draft = input.value;
      historyAt = Math.max(0, historyAt - 1);
      input.value = commandHistory[historyAt] || draft;
    }
    if (event.key === 'ArrowDown' && historyAt < commandHistory.length) {
      event.preventDefault();
      historyAt++;
      input.value = commandHistory[historyAt] || draft;
    }
    if (event.key === 'Escape') {
      if (game.pending) submit('cancel');
      else input.value = '';
    }
  });
  find('save-button').addEventListener('click', save);
  find('load-button').addEventListener('click', openLoad);
  find('restore-local').addEventListener('click', () => {
    try {
      restore(JSON.parse(localStorage.getItem(saveKey)));
    } catch (error) {
      toast(`Could not load: ${error.message}`);
    }
  });
  find('import-button').addEventListener('click', () => find('save-file').click());
  find('save-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error('Save files must be smaller than 4 MB.');
      restore(JSON.parse(await file.text()));
    } catch (error) {
      toast(`Could not import: ${error.message}`);
    }
    event.target.value = '';
  });
  for (const id of ['restart-button', 'ending-restart']) find(id).addEventListener('click', () => find('restart-dialog').showModal());
  find('confirm-restart').addEventListener('click', () => {
    game.restart();
    transcript.replaceChildren();
    records.length = 0;
    commandHistory.length = 0;
    historyAt = 0;
    lastSavedState = '';
    input.value = '';
    append('', game.execute('look'));
    find('restart-dialog').close();
    update();
    window.scrollTo({top: 0, behavior: 'instant'});
  });
  for (const id of ['about-button', 'notes-about-button']) find(id).addEventListener('click', () => find('about-dialog').showModal());
  find('cancel-button').addEventListener('click', () => submit('cancel'));
  find('hint-button').addEventListener('click', () => {
    const hint = LastSignal.hints[Math.min(game.vars.hints, LastSignal.hints.length - 1)];
    game.vars.hints = Math.min(game.vars.hints + 1, LastSignal.hints.length);
    append('a nudge', {turn: game.turn, messages: [{type: 'help', text: hint}]});
    update();
    scrollToLatest();
  });
  find('export-save').addEventListener('click', () => download('the-last-signal.save.json', JSON.stringify(saveData(), null, 2), 'application/json'));
  find('export-transcript').addEventListener('click', () => {
    const text = ['THE LAST SIGNAL', 'A Wayfinder story', '', ...records.flatMap(record => [...(record.command ? [`> ${record.command}`] : []), ...record.messages.map(message => message.text), ''])].join('\n');
    download('the-last-signal.txt', text, 'text/plain');
  });
  const smallScreen = matchMedia('(max-width: 680px)');
  find('notes').open = !smallScreen.matches;
  smallScreen.addEventListener('change', event => { find('notes').open = !event.matches; });
  append('', game.execute('look'));
  update();
})();
