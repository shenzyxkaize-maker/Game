/* ============================================================
   STILL ALIVE — game engine
   ============================================================ */

import { STORY, ACTS, NOTES, SURVIVORS, LOST } from "./story.js";

const SAVE_KEY = "stillalive.save.v2";
const NOTES_KEY = "stillalive.notes.v1";
const SOUND_KEY = "stillalive.sound.v1";
const MAX_STAT = 100;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const els = {
  screenTitle: $("#screen-title"),
  screenGame: $("#screen-game"),
  screenEnding: $("#screen-ending"),
  screenDeath: $("#screen-death"),
  app: $("#app"),
  btnStart: $("#btn-start"),
  btnContinue: $("#btn-continue"),
  btnSound: $("#btn-sound"),
  btnJournal: $("#btn-journal"),
  btnRestart: $("#btn-restart"),
  btnBrand: $("#brand-home"),
  noteCount: $("#note-count"),
  hudDay: $("#hud-day"),
  hudDate: $("#hud-date"),
  hudLocation: $("#hud-location"),
  hudAltitude: $("#hud-altitude"),
  hudAlive: $("#hud-alive"),
  alivePips: $("#alive-pips"),
  inventory: $("#inventory"),
  statWarmth: $("#stat-warmth"),
  statStrength: $("#stat-strength"),
  statHope: $("#stat-hope"),
  statFood: $("#stat-food"),
  barWarmth: $("#bar-warmth"),
  barStrength: $("#bar-strength"),
  barHope: $("#bar-hope"),
  barFood: $("#bar-food"),
  foodStat: $("#food-stat"),
  statEls: {},
  sceneAct: $("#scene-act"),
  sceneTitle: $("#scene-title"),
  prose: $("#prose"),
  choices: $("#choices"),
  stage: $("#stage"),
  fieldNoteCallout: $("#field-note-callout"),
  noteCalloutTitle: $("#note-callout-title"),
  noteCalloutBtn: $("#note-callout-btn"),
  deltas: null,
  actProgress: $("#act-progress"),
  progressFill: $("#progress-fill"),
  chapterCount: $("#chapter-count"),
  drawer: $("#drawer"),
  drawerBackdrop: $("#drawer-backdrop"),
  drawerClose: $("#btn-drawer-close"),
  drawerProgress: $("#drawer-progress-text"),
  notesList: $("#notes-list"),
  chapterCard: $("#chapter-card"),
  chapterNumeral: $("#chapter-numeral"),
  chapterKicker: $("#chapter-kicker"),
  chapterTitle: $("#chapter-title"),
  chapterRange: $("#chapter-range"),
  chapterEpigraph: $("#chapter-epigraph"),
  endingProse: $("#ending-prose"),
  endingHistory: $("#ending-history"),
  pathList: $("#path-list"),
  survivorList: $("#survivor-list"),
  lostList: $("#lost-list"),
  btnEndingNotes: $("#btn-ending-notes"),
  btnEndingReplay: $("#btn-ending-replay"),
  btnEndingTitle: $("#btn-ending-title"),
  deathProse: $("#death-prose"),
  deathHistory: $("#death-history"),
  btnRewind: $("#btn-rewind"),
  btnDeathRestart: $("#btn-death-restart"),
  confirmModal: $("#confirm-modal"),
  confirmTitle: $("#confirm-title"),
  confirmKicker: $("#confirm-modal .modal-kicker"),
  confirmBody: $("#confirm-modal .modal-card > p:not(.modal-kicker)"),
  btnConfirmYes: $("#btn-confirm-yes"),
  btnConfirmNo: $("#btn-confirm-no"),
  toast: $("#toast"),
};

$$(".stat").forEach((el) => {
  els.statEls[el.dataset.stat] = el;
});

const state = { value: null };
let currentChoices = [];
let busy = false;
let chapterTimer = null;
let chapterDone = null;
let chapterAutoHide = null;
let toastTimer = null;
let pendingNote = null;
let calloutNoteId = null;
let drawerOpen = false;
let confirmOpen = false;
let confirmMode = "restart";
let lastFocus = null;
let soundOn = false;
let soundPref = false;
let audio = null;
let snowRaf = null;
let lastSnowTime = 0;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isFinePointer = window.matchMedia("(pointer: fine)").matches;

/* ---------- small helpers ---------- */

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const pad = (n) => String(n).padStart(2, "0");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be unavailable in private mode */
  }
}

function readRecoveredNotes() {
  const arr = readJSON(NOTES_KEY, []);
  return Array.isArray(arr) ? arr.filter((id) => Boolean(NOTES[id])) : [];
}

function persistNotes() {
  if (!state.value) return;
  writeJSON(NOTES_KEY, state.value.notes);
}

function template(value) {
  const third = state.value?.third || "Tintín";
  return String(value).replaceAll("{{third}}", third);
}

function matches(entry) {
  if (!entry || typeof entry === "string") return true;
  if (entry.if && !state.value.flags[entry.if]) return false;
  if (entry.unless && state.value.flags[entry.unless]) return false;
  return true;
}

function showScreen(name) {
  const screens = {
    title: els.screenTitle,
    game: els.screenGame,
    ending: els.screenEnding,
    death: els.screenDeath,
  };
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
  document.body.dataset.screen = name;
}

function scrollTop(behavior = "auto") {
  window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : behavior });
}

/* ---------- state ---------- */

function newState() {
  return {
    version: 2,
    nodeId: STORY.start,
    act: 0,
    day: 0,
    date: "12 October 1972",
    location: "Montevideo, Uruguay",
    altitude: "Sea level",
    alive: 45,
    stats: { warmth: 55, strength: 60, hope: 55 },
    food: 3,
    showFood: false,
    third: "Tintín",
    flags: {},
    inventory: ["A boarding pass"],
    notes: readRecoveredNotes(),
    visited: [],
    checkpoint: null,
    echo: null,
    startedAt: Date.now(),
    completed: false,
  };
}

function snapshot() {
  const copy = JSON.parse(JSON.stringify(state.value));
  delete copy.checkpoint;
  delete copy.echo;
  return copy;
}

function save() {
  if (!state.value) return;
  writeJSON(SAVE_KEY, state.value);
}

function readSave() {
  const save = readJSON(SAVE_KEY, null);
  if (!save || save.version !== 2 || !STORY.nodes[save.nodeId]) return null;
  if (!save.stats || typeof save.stats.warmth !== "number") return null;
  return save;
}

function hasSave() {
  return Boolean(readSave());
}

function updateContinueButton() {
  const save = readSave();
  if (!save) {
    els.btnContinue.hidden = true;
    els.btnContinue.classList.add("is-hidden");
    return;
  }
  const node = STORY.nodes[save.nodeId];
  let label = "Continue saved story";
  if (node.kind === "ending" || save.completed) label = "Return to the ending";
  else if (node.kind === "death") label = "Return to the mountain";
  else if (save.day > 0) label = `Continue · Day ${save.day}`;
  els.btnContinue.textContent = label;
  els.btnContinue.classList.remove("is-hidden");
  els.btnContinue.hidden = false;
}

/* ---------- chapter cards ---------- */

function stopChapter() {
  if (chapterTimer) clearTimeout(chapterTimer);
  if (chapterAutoHide) clearTimeout(chapterAutoHide);
  chapterTimer = null;
  chapterAutoHide = null;
  chapterDone = null;
  els.chapterCard.hidden = true;
  els.chapterCard.classList.remove("is-visible");
  els.chapterCard.setAttribute("aria-hidden", "true");
}

function showChapter(actNumber, done) {
  const act = ACTS[actNumber];
  if (!act) {
    done?.();
    return;
  }

  els.chapterNumeral.textContent = act.numeral;
  els.chapterKicker.textContent = `Act ${act.numeral}`;
  els.chapterTitle.textContent = act.title;
  els.chapterRange.textContent = act.range;
  els.chapterEpigraph.textContent = act.epigraph;

  chapterDone = done;
  clearTimeout(chapterTimer);
  clearTimeout(chapterAutoHide);

  els.chapterCard.hidden = false;
  els.chapterCard.setAttribute("aria-hidden", "false");
  els.chapterCard.classList.remove("is-visible");
  // force a reflow so the fade begins from zero
  void els.chapterCard.offsetWidth;
  els.chapterCard.classList.add("is-visible");
  els.chapterCard.focus?.({ preventScroll: true });

  chapterAutoHide = setTimeout(() => {
    if (chapterDone) {
      els.chapterCard.classList.remove("is-visible");
      chapterTimer = setTimeout(finishChapter, reducedMotion ? 30 : 560);
    }
  }, reducedMotion ? 420 : 1750);
}

function finishChapter() {
  clearTimeout(chapterTimer);
  if (!chapterDone) return;
  const done = chapterDone;
  chapterDone = null;
  els.chapterCard.classList.remove("is-visible");
  els.chapterCard.setAttribute("aria-hidden", "true");
  els.chapterCard.hidden = true;
  done();
}

function skipChapter() {
  if (!chapterDone) return;
  if (chapterAutoHide) clearTimeout(chapterAutoHide);
  if (chapterTimer) clearTimeout(chapterTimer);
  chapterAutoHide = null;
  els.chapterCard.classList.remove("is-visible");
  chapterTimer = setTimeout(finishChapter, reducedMotion ? 20 : 420);
}

/* ---------- navigation ---------- */

function goTo(id, options = {}) {
  const node = STORY.nodes[id];
  if (!node || !state.value) {
    busy = false;
    return;
  }

  const previousAct = state.value.act;
  state.value.nodeId = id;
  state.value.act = node.act ?? state.value.act;
  state.value.day = node.day ?? state.value.day;
  state.value.date = node.date ?? state.value.date;
  state.value.location = node.location ?? state.value.location;
  state.value.altitude = node.altitude ?? state.value.altitude;
  state.value.alive = node.alive != null ? node.alive : state.value.alive;

  if (node.showFood !== undefined) state.value.showFood = node.showFood;
  if (node.inventory) state.value.inventory = [...node.inventory];
  if (!state.value.visited.includes(id)) state.value.visited.push(id);

  if (node.note) {
    const newlyUnlocked = unlockNote(node.note, { quiet: true });
    pendingNote = newlyUnlocked ? node.note : null;
  } else {
    pendingNote = null;
  }

  save();

  if (node.kind === "ending") {
    renderEnding(node);
    return;
  }
  if (node.kind === "death") {
    renderDeath(node);
    return;
  }

  const showAct = options.chapter !== false && node.act && node.act !== previousAct && ACTS[node.act];
  if (showAct) {
    showChapter(node.act, () => renderNode(node, options));
  } else {
    renderNode(node, options);
  }
}

/* ---------- rendering ---------- */

function renderProse(container, paragraphs) {
  container.innerHTML = "";
  const visible = paragraphs.filter(matches);
  visible.forEach((entry, index) => {
    const p = document.createElement("p");
    if (typeof entry === "object" && entry.class) p.className = entry.class;
    p.textContent = template(typeof entry === "string" ? entry : entry.text);
    p.style.animationDelay = `${Math.min(index * 55, 420)}ms`;
    const firstWord = (p.textContent.trim().split(/\s+/)[0] || "").replace(/[^\p{L}]/gu, "");
    if (index === 0 && firstWord.length >= 4 && !p.classList.contains("letter")) {
      p.classList.add("dropcap");
    }
    container.appendChild(p);
  });
}

function renderNode(node, options = {}) {
  showScreen("game");
  busy = false;

  const act = ACTS[node.act] || ACTS[1];
  els.sceneAct.textContent = `Act ${act.numeral} · ${act.title}`;
  els.sceneTitle.textContent = node.title;
  renderProse(els.prose, node.text);

  // Echo the last real decision, once, on the next scene.
  const oldEcho = $(".choice-echo", els.stage);
  if (oldEcho) oldEcho.remove();
  if (state.value.echo) {
    const echo = document.createElement("div");
    echo.className = "choice-echo";
    echo.textContent = template(state.value.echo);
    els.prose.after(echo);
    state.value.echo = null;
  }

  if (pendingNote && NOTES[pendingNote]) {
    calloutNoteId = pendingNote;
    els.noteCalloutTitle.textContent = NOTES[pendingNote].title;
    els.fieldNoteCallout.classList.remove("is-hidden");
  } else {
    calloutNoteId = null;
    els.fieldNoteCallout.classList.add("is-hidden");
  }
  pendingNote = null;

  renderChoices(node);
  updateHUD();
  updateFooter(node);
  save();

  document.title = `${node.title} · STILL ALIVE`;

  if (options.scroll !== false) {
    requestAnimationFrame(() => {
      if (window.scrollY > 20) {
        els.stage.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      }
    });
  }

  requestAnimationFrame(() => {
    try {
      els.sceneTitle.focus({ preventScroll: true });
    } catch {
      /* older browsers */
    }
  });
}

function renderChoices(node) {
  els.choices.innerHTML = "";
  currentChoices = [];
  const visible = node.choices.filter(matches);

  visible.forEach((choice, index) => {
    const locked = Boolean(choice.requires) && !requirementMet(choice.requires);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice" + (choice.kind === "continue" ? " is-continue" : "");
    if (locked) button.classList.add("is-locked");
    button.style.animationDelay = `${Math.min(index * 65, 380)}ms`;
    if (locked) button.disabled = true;

    if (choice.kind !== "continue") {
      const num = document.createElement("span");
      num.className = "choice-num";
      num.textContent = String(index + 1);
      button.appendChild(num);
    }

    const body = document.createElement("span");
    body.className = "choice-body";
    const text = document.createElement("span");
    text.className = "choice-text";
    text.textContent = template(choice.text);
    body.appendChild(text);

    if (locked && choice.requires?.hint) {
      const hint = document.createElement("span");
      hint.className = "choice-hint";
      hint.textContent = choice.requires.hint;
      body.appendChild(hint);
    } else if (choice.hint) {
      const hint = document.createElement("span");
      hint.className = "choice-hint";
      hint.textContent = choice.hint;
      body.appendChild(hint);
    }

    button.appendChild(body);

    const arrow = document.createElement("span");
    arrow.className = "choice-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = choice.kind === "continue" ? "→" : "→";
    button.appendChild(arrow);

    button.addEventListener("click", () => {
      if (!locked) choose(index);
    });

    els.choices.appendChild(button);
    currentChoices.push({ ...choice, locked });
  });

  if (visible.length === 0 && node.kind !== "ending") {
    const fallback = document.createElement("button");
    fallback.type = "button";
    fallback.className = "choice is-continue";
    fallback.innerHTML = '<span class="choice-body"><span class="choice-text">Continue</span></span><span class="choice-arrow">→</span>';
    fallback.addEventListener("click", () => goTo(STORY.start));
    els.choices.appendChild(fallback);
  }
}

function requirementMet(requirement) {
  if (!requirement) return true;
  if (requirement.stat) {
    return (state.value.stats[requirement.stat] ?? 0) >= requirement.min;
  }
  if (requirement.flag) return Boolean(state.value.flags[requirement.flag]);
  return true;
}

function choose(index) {
  if (busy || !state.value) return;
  const choice = currentChoices[index];
  if (!choice || choice.locked) return;
  if (els.screenGame.hidden) return;

  busy = true;
  state.value.checkpoint = snapshot();
  state.value.echo = choice.kind === "continue" ? null : choice.text;

  const deltas = applyEffects(choice.effects || {});
  if (choice.set) Object.assign(state.value.flags, choice.set);
  if (choice.third) state.value.third = choice.third;

  updateHUD();
  showDeltas(deltas);
  playTone("choice");

  const buttons = $$(".choice", els.choices);
  buttons.forEach((button, i) => {
    button.disabled = true;
    if (i === index) button.classList.add("is-picked");
  });

  const nextId = resolveNext(choice.next);

  setTimeout(() => {
    if (!state.value) {
      busy = false;
      return;
    }

    if (state.value.stats.warmth <= 0 || state.value.stats.strength <= 0) {
      goTo("death_exposure");
      return;
    }
    if (state.value.food <= 0 && state.value.stats.strength <= 8 && state.value.act >= 4) {
      goTo("death_starvation");
      return;
    }

    if (nextId) {
      goTo(nextId);
    } else {
      busy = false;
    }
  }, 380);
}

function resolveNext(next) {
  if (!next) return null;
  if (typeof next === "string") return next;
  if (next.ifStat) {
    return (state.value.stats[next.ifStat] ?? 0) >= next.min ? next.then : next.otherwise;
  }
  if (next.ifFlag) {
    return state.value.flags[next.ifFlag] ? next.then : next.otherwise;
  }
  return next.otherwise || next.then || null;
}

function applyEffects(effects) {
  const deltas = [];
  ["warmth", "strength", "hope"].forEach((key) => {
    if (typeof effects[key] !== "number") return;
    const before = state.value.stats[key];
    state.value.stats[key] = clamp(before + effects[key], 0, MAX_STAT);
    const change = state.value.stats[key] - before;
    if (change !== 0) deltas.push({ key, label: key[0].toUpperCase() + key.slice(1), change });
  });
  if (typeof effects.food === "number") {
    const before = state.value.food;
    state.value.food = Math.max(0, before + effects.food);
    const change = state.value.food - before;
    if (change !== 0) deltas.push({ key: "food", label: "Ration", change });
  }
  return deltas;
}

function showDeltas(deltas) {
  const old = $(".delta-float", els.stage);
  if (old) old.remove();
  if (!deltas.length) return;

  const float = document.createElement("div");
  float.className = "delta-float";
  deltas.forEach((delta) => {
    const chip = document.createElement("span");
    const up = delta.change > 0;
    chip.className = "delta " + (up ? "is-up" : "is-down");
    const sign = up ? "+" : "−";
    const value = Math.abs(delta.change);
    chip.textContent = `${sign}${value} ${delta.label}`;
    float.appendChild(chip);
  });
  els.stage.appendChild(float);
  setTimeout(() => float.remove(), 2200);
}

function updateHUD() {
  if (!state.value) return;
  const s = state.value;

  els.hudDay.textContent = s.day === 0 ? "Day 0" : `Day ${s.day}`;
  els.hudDate.textContent = s.date;
  els.hudLocation.textContent = s.location;
  els.hudAltitude.textContent = s.altitude;

  setStat("warmth", s.stats.warmth);
  setStat("strength", s.stats.strength);
  setStat("hope", s.stats.hope);

  els.hudAlive.textContent = String(s.alive);
  updatePips(s.alive);

  if (s.showFood) {
    els.foodStat.classList.remove("is-hidden");
    els.statFood.textContent = String(s.food);
    els.barFood.style.width = `${clamp((s.food / 4) * 100, 0, 100)}%`;
  } else {
    els.foodStat.classList.add("is-hidden");
  }

  els.inventory.innerHTML = "";
  const items = s.inventory.length ? s.inventory : ["Nothing but the clothes on your back"];
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = template(item);
    els.inventory.appendChild(li);
  });

  els.noteCount.textContent = String(s.notes.length);
  els.noteCount.setAttribute("aria-label", `${s.notes.length} field notes recovered`);
}

function setStat(key, value) {
  const safe = clamp(value, 0, MAX_STAT);
  const valueEl = els["stat" + key[0].toUpperCase() + key.slice(1)];
  const barEl = els["bar" + key[0].toUpperCase() + key.slice(1)];
  const statEl = els.statEls[key];
  if (valueEl) valueEl.textContent = String(safe);
  if (barEl) barEl.style.width = `${safe}%`;
  if (statEl) statEl.classList.toggle("is-low", safe <= 25);
}

function updatePips(alive) {
  if (!els.alivePips.childElementCount) {
    for (let i = 0; i < 45; i += 1) {
      const pip = document.createElement("span");
      pip.className = "pip";
      els.alivePips.appendChild(pip);
    }
  }
  const count = clamp(alive, 0, 45);
  Array.from(els.alivePips.children).forEach((pip, i) => {
    pip.classList.toggle("is-lost", i >= count);
  });
}

function updateFooter(node) {
  const act = ACTS[node.act] || ACTS[1];
  els.actProgress.textContent = `Act ${act.numeral} of V`;
  els.progressFill.style.width = `${(node.act / 5) * 100}%`;
  els.chapterCount.textContent = state.value.date;
}

/* ---------- notes ---------- */

function unlockNote(id, options = {}) {
  if (!NOTES[id] || !state.value) return false;
  if (state.value.notes.includes(id)) return false;
  state.value.notes.push(id);
  persistNotes();
  save();
  els.noteCount.textContent = String(state.value.notes.length);
  if (!options.quiet) {
    toast(`Field note recovered · ${NOTES[id].title}`);
    playTone("note");
  }
  return true;
}

function renderNotes() {
  const unlocked = new Set(state.value?.notes || []);
  const ordered = Object.entries(NOTES).sort((a, b) => a[1].index - b[1].index);
  els.notesList.innerHTML = "";
  ordered.forEach(([id, note]) => {
    const isUnlocked = unlocked.has(id);
    const wrap = document.createElement("article");
    wrap.className = "note" + (isUnlocked ? "" : " is-locked");
    wrap.id = `note-${id}`;
    wrap.dataset.note = id;

    const head = document.createElement("div");
    head.className = "note-head";
    const index = document.createElement("span");
    index.className = "note-index";
    index.textContent = pad(note.index);
    const title = document.createElement("h3");
    title.className = "note-title";
    title.textContent = isUnlocked ? note.title : "Unrecovered field note";
    head.append(index, title);

    const body = document.createElement("p");
    body.className = "note-body";
    body.textContent = isUnlocked ? note.body : "";

    const source = document.createElement("p");
    source.className = "note-source";
    source.textContent = isUnlocked ? note.source : "";

    wrap.append(head, body, source);
    els.notesList.appendChild(wrap);
  });

  const total = Object.keys(NOTES).length;
  els.drawerProgress.textContent =
    unlocked.size >= total ? `All ${total} field notes recovered` : `${unlocked.size} of ${total} recovered`;
}

function openDrawer(noteId) {
  if (!state.value) return;
  closeConfirm();
  lastFocus = document.activeElement;
  renderNotes();
  drawerOpen = true;
  els.drawerBackdrop.hidden = false;
  els.drawer.inert = false;
  els.drawer.setAttribute("aria-hidden", "false");
  els.app.inert = true;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    els.drawerBackdrop.classList.add("is-visible");
    els.drawer.classList.add("is-open");
    els.drawerClose.focus({ preventScroll: true });
  });

  if (noteId) {
    requestAnimationFrame(() => {
      const target = document.getElementById(`note-${noteId}`);
      if (target) {
        setTimeout(() => target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" }), 220);
      }
    });
  }
}

function closeDrawer() {
  if (!drawerOpen) return;
  drawerOpen = false;
  els.drawer.classList.remove("is-open");
  els.drawerBackdrop.classList.remove("is-visible");
  els.drawer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  setTimeout(() => {
    els.drawerBackdrop.hidden = true;
    els.drawer.inert = true;
    if (!confirmOpen) els.app.inert = false;
  }, reducedMotion ? 20 : 480);
  requestAnimationFrame(() => {
    try {
      lastFocus?.focus?.({ preventScroll: true });
    } catch {
      /* ignore */
    }
  });
}

/* ---------- ending ---------- */

const ENDING_HISTORY = `
  <p>On 23 December 1972, the last survivors were lifted from the glacier. The sixteen men were taken to hospitals in Santiago, where they were treated for dehydration, malnutrition, frostbite, broken bones, scurvy, and altitude sickness. Nando Parrado's father, who had already held a funeral for his son, was waiting for him.</p>
  <p>The survivors first told the press they had lived on cheese, chocolate, and local vegetation. On 28 December, at a press conference in Montevideo, they told the truth. Alfredo Delgado compared the decision to the Last Supper; a Catholic priest reassured them they were not damned. The story of the pact became one of the most debated acts of survival in the twentieth century.</p>
  <p>Nando Parrado returned to Uruguay, finished his degree, and became a television producer and motivational speaker. Roberto Canessa became a pediatric cardiologist. The others built careers and families. The sixteen have returned to the mountain together. They have said that the dead gave them life, and that they carry them still.</p>
  <p>The crash site lies in Argentina, about eighty kilometres east of the flight's intended track. The search had been called off after eight days. No one was coming. They saved themselves.</p>
`;

const PATH_LINES = [
  ["watched", "You watched the Andes from the window before the crash, and you never stopped watching them."],
  ["stayed", "You stayed with Susy until the end."],
  ["promise", "You promised Susy you would walk out. You kept the promise."],
  ["asked", "You asked where your mother was, and learned the answer on the fourth day."],
  ["medic", "You helped Canessa with the wounded when you could barely stand yourself."],
  ["medic2", "You held the wounded while their bones were set, without morphine."],
  ["water", "You helped build the water collector that kept the fuselage alive."],
  ["heard", "You listened to the broadcast that said the search was over."],
  ["believed", "You believed Coco when he said you would walk out on your own."],
  ["planner", "You started planning before the tears had dried."],
  ["pact", "You joined the pact, and said the names of the dead before you ate."],
  ["gave", "You gave your first ration to Roberto when he was weaker than you."],
  ["fedOthers", "You fed someone weaker before you fed yourself."],
  ["refusedOnce", "You refused the pact once, before your body made the decision for you."],
  ["refusedTwice", "You held out longer than anyone. In the end, you ate."],
  ["grief", "You slept beside Susy's empty place."],
  ["watch", "You took the watch and let the others sleep."],
  ["dug", "When the avalanche buried the fuselage, you found the metal pole and made a hole for air."],
  ["dugHands", "When the avalanche buried the fuselage, you dug with your hands until they bled."],
  ["countedLiving", "You counted the living and said each of their names."],
  ["mourned", "You sat with Marcelo and said goodbye."],
  ["resolve", "You turned your rage at the mountain into a plan."],
  ["leader", "You took charge of the water and the watches."],
  ["trained", "You spent November climbing the glacier until your legs remembered how."],
  ["route", "You studied the ridgeline until you could see it with your eyes closed."],
  ["determined", "When Numa died, you gathered everyone and said it was time."],
  ["thirdTintin", "You chose Tintín for the crossing."],
  ["thirdRoy", "You chose Roy for the crossing, hoping his hands could do what his body could not."],
  ["sentWithFood", "You sent your friend back down the mountain with a share of the food."],
  ["sentWithMessage", "You sent your friend back down the mountain with a message for the sixteen."],
  ["sentEmpty", "You sent your friend back down the mountain with nothing but the seat. Every mouthful counted."],
  ["west", "When Roberto saw a road to the east, you trusted the ridge."],
  ["detour", "You followed a false valley east, and lost a day you could not afford."],
  ["split", "You split the expedition on the mountain, and somehow found each other again."],
  ["iconic", "At 4,503 metres, you chose to walk toward death rather than wait for it."],
  ["gaveLast", "You gave Roberto the last of the meat."],
  ["fullnote", "On the far side of the river, you wrote the whole truth on a scrap of paper."],
  ["shortnote", "On the far side of the river, you wrote the only words that mattered: we are alive."],
  ["foodfirst", "On the far side of the river, you asked for bread before you asked for anything else."],
  ["others", "In Los Maitenes, you asked about the others before you asked about yourself."],
  ["flyNow", "You guided the helicopters back yourself, the only map they had."],
  ["waited", "You waited for the fog to lift, and the rescue came anyway."],
  ["stayedBehind", "You sent the helicopters ahead and waited for word."],
  ["helpedLoad", "At the crash site, you got out and helped load the injured."],
  ["counted", "You stayed in the helicopter and counted them, making sure no one was left."],
  ["triage", "You took the most injured first, and promised there would be another flight."],
  ["askedPilot", "You asked the pilot to go back for the others at first light."],
  ["stayedLastNight", "You slept one last night on the mountain."],
];

function renderEnding(node) {
  showScreen("ending");
  busy = false;
  state.value.completed = true;
  save();
  scrollTop("auto");

  renderProse(els.endingProse, node.text);
  renderPath();
  els.endingHistory.innerHTML = ENDING_HISTORY;

  els.survivorList.innerHTML = "";
  SURVIVORS.forEach(([name, role]) => {
    const li = document.createElement("li");
    li.textContent = name;
    const span = document.createElement("span");
    span.textContent = ` · ${role}`;
    li.appendChild(span);
    els.survivorList.appendChild(li);
  });

  els.lostList.innerHTML = "";
  LOST.forEach((name) => {
    const li = document.createElement("li");
    li.textContent = name;
    els.lostList.appendChild(li);
  });

  els.noteCount.textContent = String(state.value.notes.length);
  document.title = "Sixteen · STILL ALIVE";
}

function renderPath() {
  els.pathList.innerHTML = "";
  const flags = state.value.flags;
  const chosen = [];

  PATH_LINES.forEach(([flag, line]) => {
    if (flags[flag] && !chosen.includes(line)) chosen.push(line);
  });

  if (chosen.length === 0) {
    chosen.push("You woke on the fourth day, and you did not stop moving.");
    chosen.push("You crossed the mountains with no map, no compass, and no rope.");
  }

  chosen.slice(0, 6).forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    els.pathList.appendChild(li);
  });

  const finalLine = document.createElement("li");
  finalLine.textContent = "You carried the names of the twenty-nine down with you.";
  els.pathList.appendChild(finalLine);
}

/* ---------- death ---------- */

function renderDeath(node) {
  showScreen("death");
  busy = false;
  save();
  scrollTop("auto");
  renderProse(els.deathProse, node.text);
  els.deathHistory.textContent = node.deathHistory || "";
  els.btnRewind.hidden = !state.value.checkpoint;
  document.title = "The mountain keeps its own · STILL ALIVE";
}

function rewind() {
  if (!state.value?.checkpoint) {
    startNew();
    return;
  }
  const checkpoint = JSON.parse(JSON.stringify(state.value.checkpoint));
  const allNotes = Array.from(new Set([...(checkpoint.notes || []), ...readRecoveredNotes()]));
  state.value = checkpoint;
  state.value.checkpoint = null;
  state.value.echo = null;
  state.value.notes = allNotes;
  state.value.completed = false;
  save();
  busy = false;
  showScreen("game");
  goTo(state.value.nodeId, { chapter: false, scroll: false });
  toast("Back at the last decision");
}

/* ---------- start / continue / title ---------- */

function startNew() {
  stopChapter();
  closeDrawer();
  closeConfirm();
  state.value = newState();
  state.value.notes = readRecoveredNotes();
  save();
  showScreen("game");
  updateContinueButton();
  goTo(STORY.start, { chapter: true });
  if (soundPref) setSound(true);
}

function continueGame() {
  const save = readSave();
  if (!save) return;
  closeDrawer();
  closeConfirm();
  state.value = save;
  state.value.notes = Array.from(new Set([...(save.notes || []), ...readRecoveredNotes()]));
  state.value.stats = { ...newState().stats, ...save.stats };
  state.value.inventory = Array.isArray(save.inventory) ? save.inventory : [];
  state.value.flags = save.flags || {};
  state.value.visited = Array.isArray(save.visited) ? save.visited : [];
  state.value.showFood = Boolean(save.showFood);
  state.value.third = save.third || "Tintín";
  state.value.food = typeof save.food === "number" ? save.food : 3;
  state.value.alive = typeof save.alive === "number" ? save.alive : 45;

  showScreen("game");
  if (soundPref) setSound(true);

  const node = STORY.nodes[state.value.nodeId];
  busy = false;
  if (node.kind === "ending") renderEnding(node);
  else if (node.kind === "death") renderDeath(node);
  else goTo(state.value.nodeId, { chapter: false, scroll: false });
}

function showTitle() {
  stopChapter();
  closeDrawer();
  closeConfirm();
  showScreen("title");
  updateContinueButton();
  scrollTop("auto");
  document.title = "STILL ALIVE — An Interactive True Story of the Andes";
}

/* ---------- confirm ---------- */

function openConfirm(mode) {
  if (!state.value && mode !== "new") return;
  confirmMode = mode;
  confirmOpen = true;
  const copy = {
    new: {
      kicker: "A story is already open",
      title: "Start a new story?",
      body: "You have a saved story on the mountain. Starting over will replace it. The field notes you have recovered will be kept.",
      yes: "Yes, start over",
    },
    restart: {
      kicker: "Leave the mountain?",
      title: "Start the story over?",
      body: "Your current progress will be lost. The field notes you have recovered will be kept.",
      yes: "Yes, start over",
    },
  }[mode] || {
    kicker: "Leave the mountain?",
    title: "Start the story over?",
    body: "Your current progress will be lost.",
    yes: "Yes, start over",
  };

  els.confirmKicker.textContent = copy.kicker;
  els.confirmTitle.textContent = copy.title;
  els.confirmBody.textContent = copy.body;
  els.btnConfirmYes.textContent = copy.yes;
  els.confirmModal.hidden = false;
  els.app.inert = true;
  requestAnimationFrame(() => els.btnConfirmYes.focus({ preventScroll: true }));
}

function closeConfirm() {
  if (!confirmOpen) return;
  confirmOpen = false;
  els.confirmModal.hidden = true;
  if (!drawerOpen) els.app.inert = false;
}

function confirmYes() {
  const mode = confirmMode;
  closeConfirm();
  if (mode === "new" || mode === "restart") startNew();
}

/* ---------- toast / sound ---------- */

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 2800);
}

function ensureAudio() {
  if (audio) return audio;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 4), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.4;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 460;
  filter.Q.value = 0.62;
  const windGain = ctx.createGain();
  windGain.gain.value = 0;
  noise.connect(filter);
  filter.connect(windGain);
  windGain.connect(ctx.destination);
  noise.start();

  const drone = ctx.createOscillator();
  drone.type = "sine";
  drone.frequency.value = 52;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  drone.connect(droneGain);
  droneGain.connect(ctx.destination);
  drone.start();

  audio = { ctx, windGain, droneGain };
  return audio;
}

function setSound(on) {
  soundOn = Boolean(on);
  try {
    localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (soundOn) {
    const a = ensureAudio();
    if (a) {
      a.ctx.resume?.();
      a.windGain.gain.setTargetAtTime(0.055, a.ctx.currentTime, 0.9);
      a.droneGain.gain.setTargetAtTime(0.018, a.ctx.currentTime, 0.9);
    }
  } else if (audio) {
    audio.windGain.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.35);
    audio.droneGain.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.35);
  }
  updateSoundButton();
}

function updateSoundButton() {
  els.btnSound.setAttribute("aria-pressed", String(soundOn));
  const label = els.btnSound.querySelector(".top-btn-label");
  const icon = els.btnSound.querySelector(".sound-icon");
  if (label) label.textContent = soundOn ? "Sound on" : "Sound off";
  if (icon) icon.textContent = soundOn ? "◉" : "◌";
}

function playTone(kind) {
  if (!soundOn) return;
  const a = audio;
  if (!a) return;
  const now = a.ctx.currentTime;
  const osc = a.ctx.createOscillator();
  const gain = a.ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(kind === "note" ? 560 : 240, now);
  osc.frequency.exponentialRampToValueAtTime(kind === "note" ? 720 : 180, now + 0.16);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === "note" ? 0.035 : 0.018, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  osc.connect(gain);
  gain.connect(a.ctx.destination);
  osc.start(now);
  osc.stop(now + 0.24);
}

/* ---------- snow ---------- */

function initSnow() {
  const canvas = $("#snow");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (reducedMotion) {
    canvas.style.display = "none";
    return;
  }

  let width = 0;
  let height = 0;
  let dpr = 1;
  let flakes = [];
  let running = true;

  const makeFlake = () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 1.5 + 0.35,
    speed: Math.random() * 0.32 + 0.1,
    drift: Math.random() * 0.28 - 0.14,
    alpha: Math.random() * 0.4 + 0.1,
    phase: Math.random() * Math.PI * 2,
  });

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(150, Math.max(50, Math.floor(width / 9)));
    flakes = Array.from({ length: count }, makeFlake);
  };

  const frame = (time) => {
    if (!running) return;
    snowRaf = requestAnimationFrame(frame);
    if (time - lastSnowTime < 16) return;
    lastSnowTime = time;
    ctx.clearRect(0, 0, width, height);
    for (const flake of flakes) {
      flake.y += flake.speed;
      flake.x += flake.drift + Math.sin((flake.y + flake.phase) * 0.01) * 0.06;
      if (flake.y > height + 4) {
        flake.y = -4;
        flake.x = Math.random() * width;
      }
      if (flake.x < -4) flake.x = width + 4;
      if (flake.x > width + 4) flake.x = -4;
      ctx.beginPath();
      ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(214, 234, 246, ${flake.alpha})`;
      ctx.fill();
    }
  };

  resize();
  window.addEventListener("resize", resize);
  snowRaf = requestAnimationFrame(frame);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      running = false;
      if (snowRaf) cancelAnimationFrame(snowRaf);
    } else if (!running) {
      running = true;
      snowRaf = requestAnimationFrame(frame);
    }
  });
}

/* ---------- events ---------- */

function bindEvents() {
  els.btnStart.addEventListener("click", () => {
    if (hasSave()) openConfirm("new");
    else startNew();
  });

  els.btnContinue.addEventListener("click", continueGame);
  els.btnRestart.addEventListener("click", () => openConfirm("restart"));
  els.btnBrand.addEventListener("click", (event) => {
    event.preventDefault();
    showTitle();
  });

  els.btnSound.addEventListener("click", () => setSound(!soundOn));
  els.btnJournal.addEventListener("click", () => openDrawer());
  els.drawerClose.addEventListener("click", closeDrawer);
  els.drawerBackdrop.addEventListener("click", closeDrawer);
  els.noteCalloutBtn.addEventListener("click", () => {
    if (calloutNoteId) openDrawer(calloutNoteId);
  });

  els.btnEndingNotes.addEventListener("click", () => openDrawer());
  els.btnEndingReplay.addEventListener("click", startNew);
  els.btnEndingTitle.addEventListener("click", showTitle);

  els.btnRewind.addEventListener("click", rewind);
  els.btnDeathRestart.addEventListener("click", startNew);

  els.btnConfirmYes.addEventListener("click", confirmYes);
  els.btnConfirmNo.addEventListener("click", closeConfirm);
  els.confirmModal.addEventListener("click", (event) => {
    if (event.target === els.confirmModal) closeConfirm();
  });

  els.chapterCard.addEventListener("click", skipChapter);
  els.chapterCard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      skipChapter();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (confirmOpen) {
        closeConfirm();
        return;
      }
      if (drawerOpen) {
        closeDrawer();
        return;
      }
      return;
    }

    if (drawerOpen || confirmOpen || els.screenGame.hidden) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const key = event.key.toLowerCase();
    if (key === "j") {
      event.preventDefault();
      openDrawer();
      return;
    }
    if (key === "m") {
      event.preventDefault();
      setSound(!soundOn);
      return;
    }
    if (busy) return;
    if (/^[1-9]$/.test(key)) {
      const index = Number(key) - 1;
      if (currentChoices[index] && !currentChoices[index].locked) {
        event.preventDefault();
        choose(index);
      }
    }
  });
}

/* ---------- boot ---------- */

function init() {
  els.drawer.inert = true;
  els.drawer.setAttribute("aria-hidden", "true");
  els.app.inert = false;
  soundPref = (() => {
    try {
      return localStorage.getItem(SOUND_KEY) === "1";
    } catch {
      return false;
    }
  })();
  soundOn = false;
  updateSoundButton();
  updateContinueButton();
  updatePips(45);
  bindEvents();
  initSnow();

  // A small debug surface keeps browser verification honest.
  window.__stillAlive = {
    get state() {
      return state.value;
    },
    start: startNew,
    continue: continueGame,
    goTo,
    choose,
    skipChapter,
    openNotes: openDrawer,
    closeNotes: closeDrawer,
    showTitle,
    nodes: STORY.nodes,
    acts: ACTS,
    notes: NOTES,
    get current() {
      return state.value ? STORY.nodes[state.value.nodeId] : null;
    },
  };
}

init();
