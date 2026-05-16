// ============================================================
// WORKOUT LOG - app.js
// ============================================================

import { registerUser, loginUser, logoutUser, onAuthChange, loadUserData, saveUserData } from './firebase.js';

// ---- STATE ----
let state = { days: [], warmupTypes: [], cardioTypes: [], history: [], exercises: [] };
let currentUser = null;
let editingDayIndex = -1;
let isManualEntry = false;
let isCardioOnly = false;
let editingTypeKind = null;
let editingTypeIndex = -1;
let cardioEntryCount = 0;

// Chart instances — kept so we can destroy before redrawing
let chartInstances = {};

// ---- HELPERS ----
function normaliseTypes(arr) {
  return (arr || []).map(t => {
    if (typeof t === 'string') return { name: t, fields: [] };
    return { ...t, fields: (t.fields || []).map(f => typeof f === 'string' ? { name: f, default: '' } : f) };
  });
}

// ---- SAVE STATE ----
async function saveState() {
  if (!currentUser) return;
  await saveUserData(currentUser.uid, state);
}

// ---- AUTH ----
async function handleLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'Please enter your email and password.'; errEl.style.display = 'block'; return; }
  try { await loginUser(email, password); }
  catch (e) { errEl.textContent = 'Login failed. Check your email and password.'; errEl.style.display = 'block'; }
}

async function handleRegister() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'Please enter an email and password.'; errEl.style.display = 'block'; return; }
  try { await registerUser(email, password); }
  catch (e) { errEl.textContent = e.message || 'Registration failed.'; errEl.style.display = 'block'; }
}

async function handleSignOut() { await logoutUser(); }

onAuthChange(async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('bottom-nav').style.display = 'flex';
    const data = await loadUserData(user.uid);
    data.warmupTypes = normaliseTypes(data.warmupTypes);
    data.cardioTypes = normaliseTypes(data.cardioTypes);
    state = data;
    renderSetup();
  } else {
    currentUser = null;
    state = { days: [], warmupTypes: [], cardioTypes: [], history: [], exercises: [] };
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    resetToIdle();
  }
});

function resetToIdle() {
  document.getElementById('today-idle').style.display = 'block';
  document.getElementById('today-planning').style.display = 'none';
  document.getElementById('today-summary').style.display = 'none';
  renderContinueButton();
}

// ---- NAVIGATION ----
function showPage(pageId, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const titles = { today: 'Workout Log', setup: 'Setup', history: 'History' };
  document.getElementById('header-title').textContent = titles[pageId];
  if (pageId === 'setup') renderSetup();
  if (pageId === 'history') renderHistory();
}

// ---- EXPAND NAME FIELD ----
function attachNameExpand(input) {
  input.addEventListener('focus', () => input.closest('.modal-exercise-row').classList.add('name-focused'));
  input.addEventListener('blur', () => input.closest('.modal-exercise-row').classList.remove('name-focused'));
}

// ---- DYNAMIC FIELDS ----
function buildDynamicFieldsHTML(containerId, typeObj) {
  if (!typeObj || !typeObj.fields || typeObj.fields.length === 0) return '';
  return `<div class="dynamic-fields">${
    typeObj.fields.map(f => `
      <div class="dynamic-field-row">
        <span class="dynamic-field-label">${f.name}</span>
        <input type="number" class="dynamic-field-input" id="field-${containerId}-${f.name.toLowerCase().replace(/\s/g,'_')}" placeholder="-" min="0" max="9999" step="0.1" value="${f.default || ''}" />
      </div>`).join('')
  }</div>`;
}

function collectDynamicFields(containerId, typeObj) {
  if (!typeObj || !typeObj.fields || typeObj.fields.length === 0) return {};
  const result = {};
  typeObj.fields.forEach(f => {
    const el = document.getElementById(`field-${containerId}-${f.name.toLowerCase().replace(/\s/g,'_')}`);
    if (el) result[f.name] = el.value || '';
  });
  return result;
}

// ---- CARDIO ENTRIES (multiple) ----
function renderCardioEntriesList() {
  const container = document.getElementById('cardio-entries-list');
  if (!container) return;
  container.innerHTML = '';
  cardioEntryCount = 0;
  addCardioEntry();
}

function addCardioEntry() {
  const container = document.getElementById('cardio-entries-list');
  const id = cardioEntryCount++;
  const div = document.createElement('div');
  div.className = 'cardio-entry';
  div.id = `cardio-entry-${id}`;
  const selectOptions = state.cardioTypes.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
  div.innerHTML = `
    <div class="cardio-entry-header">
      <span class="cardio-entry-num">Cardio ${id + 1}</span>
      ${id > 0 ? `<button class="btn-danger" onclick="removeCardioEntry(${id})">🗑</button>` : ''}
    </div>
    <select id="cardio-type-${id}" onchange="updateCardioEntryFields(${id})">${selectOptions}</select>
    <div id="cardio-dynamic-${id}"></div>
    <label class="field-label">Time (minutes)</label>
    <input type="number" id="cardio-time-${id}" placeholder="e.g. 30" min="1" max="300" />
  `;
  container.appendChild(div);
  updateCardioEntryFields(id);
}

function removeCardioEntry(id) {
  const el = document.getElementById(`cardio-entry-${id}`);
  if (el) el.remove();
}

function updateCardioEntryFields(id) {
  const sel = document.getElementById(`cardio-type-${id}`);
  if (!sel) return;
  const typeObj = state.cardioTypes[parseInt(sel.value)];
  const container = document.getElementById(`cardio-dynamic-${id}`);
  if (container) container.innerHTML = buildDynamicFieldsHTML(`cardio-entry-${id}`, typeObj);
}

function collectCardioEntries() {
  const entries = [];
  document.querySelectorAll('.cardio-entry').forEach(entry => {
    const id = entry.id.replace('cardio-entry-', '');
    const sel = document.getElementById(`cardio-type-${id}`);
    if (!sel) return;
    const typeObj = state.cardioTypes[parseInt(sel.value)];
    const time = document.getElementById(`cardio-time-${id}`)?.value || '';
    const fields = collectDynamicFields(`cardio-entry-${id}`, typeObj);
    entries.push({ name: typeObj.name, time, fields });
  });
  return entries;
}

// ---- DRAFT (localStorage) ----
const DRAFT_KEY = 'workout-log-draft';

function saveDraft() {
  if (!currentUser) return;
  try {
    const draft = {
      uid: currentUser.uid,
      isManualEntry,
      isCardioOnly,
      savedAt: new Date().toISOString()
    };
    if (isManualEntry) {
      draft.manualDate = document.getElementById('manual-date')?.value || '';
    }
    draft.warmupVisible = document.getElementById('section-warmup').style.display !== 'none';
    draft.cardioVisible = document.getElementById('section-cardio').style.display !== 'none';
    if (!isCardioOnly) {
      const warmupIdx = parseInt(document.getElementById('warmup-select')?.value || '0');
      draft.warmupIdx = warmupIdx;
      draft.warmupTime = document.getElementById('warmup-time')?.value || '';
      const warmupType = state.warmupTypes[warmupIdx];
      draft.warmupFields = collectDynamicFields('warmup', warmupType);
      const dayIndex = parseInt(document.getElementById('day-select')?.value || '0');
      draft.dayIndex = dayIndex;
      const day = state.days[dayIndex];
      if (day) {
        draft.exercises = day.exercises.map((ex, i) => ({
          reps: document.getElementById('reps-' + i)?.value || '',
          kg: document.getElementById('kg-' + i)?.value || ''
        }));
      }
    }
    draft.cardioEntries = collectCardioEntries();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (e) {}
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!currentUser || draft.uid !== currentUser.uid) return null;
    return draft;
  } catch (e) { return null; }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
}

function renderContinueButton() {
  const draft = loadDraft();
  const container = document.getElementById('continue-draft-area');
  if (!container) return;
  if (!draft) { container.innerHTML = ''; return; }
  const label = draft.isCardioOnly ? '🏃 Continue cardio' : '💪 Continue workout';
  const d = new Date(draft.savedAt);
  const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  container.innerHTML = `
    <div class="draft-banner">
      <div class="draft-info">Draft from ${dateStr} ${timeStr}</div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="btn-primary" style="flex:1;" onclick="resumeDraft()">${label}</button>
        <button class="btn-outline" style="padding:10px 14px;" onclick="discardDraft()">✕</button>
      </div>
    </div>`;
}

function resumeDraft() {
  const draft = loadDraft();
  if (!draft) return;
  isManualEntry = draft.isManualEntry;
  isCardioOnly = draft.isCardioOnly;
  document.getElementById('today-idle').style.display = 'none';
  document.getElementById('today-planning').style.display = 'none';
  document.getElementById('today-summary').style.display = 'none';
  document.getElementById('section-warmup').style.display = isCardioOnly ? 'none' : 'block';
  document.getElementById('section-exercises').style.display = isCardioOnly ? 'none' : 'block';
  const dateCard = document.getElementById('manual-date-card');
  dateCard.style.display = isManualEntry ? 'block' : 'none';
  if (isManualEntry && draft.manualDate) document.getElementById('manual-date').value = draft.manualDate;
  if (!isCardioOnly) {
    if (draft.warmupVisible) {
      document.getElementById('warmup-select').innerHTML = state.warmupTypes.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
      if (draft.warmupIdx !== undefined) document.getElementById('warmup-select').value = draft.warmupIdx;
      renderWarmupFields();
      if (draft.warmupTime) document.getElementById('warmup-time').value = draft.warmupTime;
      if (draft.warmupFields) {
        const warmupType = state.warmupTypes[draft.warmupIdx || 0];
        if (warmupType && warmupType.fields) {
          warmupType.fields.forEach(f => {
            const el = document.getElementById(`field-warmup-${f.name.toLowerCase().replace(/\s/g,'_')}`);
            if (el && draft.warmupFields[f.name]) el.value = draft.warmupFields[f.name];
          });
        }
      }
      document.getElementById('section-warmup').style.display = 'block';
      document.getElementById('btn-add-warmup').style.display = 'none';
    } else {
      document.getElementById('section-warmup').style.display = 'none';
      document.getElementById('btn-add-warmup').style.display = '';
    }
    document.getElementById('day-select').innerHTML = state.days.map((d, i) => `<option value="${i}">${d.name}</option>`).join('');
    if (draft.dayIndex !== undefined) document.getElementById('day-select').value = draft.dayIndex;
    loadDayExercises();
    if (draft.exercises) {
      draft.exercises.forEach((ex, i) => {
        const repsEl = document.getElementById('reps-' + i);
        const kgEl = document.getElementById('kg-' + i);
        if (repsEl && ex.reps) repsEl.value = ex.reps;
        if (kgEl && ex.kg) kgEl.value = ex.kg;
      });
    }
  }
  const container = document.getElementById('cardio-entries-list');
  container.innerHTML = '';
  cardioEntryCount = 0;
  if (draft.cardioEntries && draft.cardioEntries.length > 0 && (draft.cardioVisible || isCardioOnly)) {
    document.getElementById('section-cardio').style.display = 'block';
    if (!isCardioOnly) document.getElementById('btn-add-cardio').style.display = 'none';
    draft.cardioEntries.forEach(entry => {
      const id = cardioEntryCount++;
      const div = document.createElement('div');
      div.className = 'cardio-entry';
      div.id = `cardio-entry-${id}`;
      const typeIndex = state.cardioTypes.findIndex(t => t.name === entry.name);
      const selectOptions = state.cardioTypes.map((t, i) => `<option value="${i}" ${i === typeIndex ? 'selected' : ''}>${t.name}</option>`).join('');
      div.innerHTML = `
        <div class="cardio-entry-header">
          <span class="cardio-entry-num">Cardio ${id + 1}</span>
          ${id > 0 ? `<button class="btn-danger" onclick="removeCardioEntry(${id})">🗑</button>` : ''}
        </div>
        <select id="cardio-type-${id}" onchange="updateCardioEntryFields(${id})">${selectOptions}</select>
        <div id="cardio-dynamic-${id}"></div>
        <label class="field-label">Time (minutes)</label>
        <input type="number" id="cardio-time-${id}" placeholder="e.g. 30" min="1" max="300" value="${entry.time || ''}" />
      `;
      container.appendChild(div);
      updateCardioEntryFields(id);
      if (entry.fields) {
        const typeObj = state.cardioTypes[typeIndex >= 0 ? typeIndex : 0];
        if (typeObj && typeObj.fields) {
          typeObj.fields.forEach(f => {
            const el = document.getElementById(`field-cardio-entry-${id}-${f.name.toLowerCase().replace(/\s/g,'_')}`);
            if (el && entry.fields[f.name]) el.value = entry.fields[f.name];
          });
        }
      }
    });
  } else {
    addCardioEntry();
  }
  document.getElementById('today-planning').style.display = 'block';
  setTimeout(() => {
    buildSummary();
    document.getElementById('today-planning').style.display = 'none';
    document.getElementById('today-summary').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 50);
}

function discardDraft() {
  clearDraft();
  renderContinueButton();
}

// ---- TODAY PAGE ----
function startWorkout(manual, cardioOnly) {
  isManualEntry = manual;
  isCardioOnly = cardioOnly;
  clearDraft();
  document.getElementById('today-idle').style.display = 'none';
  document.getElementById('today-planning').style.display = 'block';
  document.getElementById('today-summary').style.display = 'none';
  const dateCard = document.getElementById('manual-date-card');
  dateCard.style.display = manual ? 'block' : 'none';
  if (manual) document.getElementById('manual-date').value = new Date().toISOString().split('T')[0];
  if (cardioOnly) {
    document.getElementById('section-exercises').style.display = 'none';
    document.getElementById('section-warmup').style.display = 'none';
    document.getElementById('section-add-buttons').style.display = 'none';
    document.getElementById('section-cardio').style.display = 'block';
    document.getElementById('cardio-remove-btn').style.display = 'none';
    renderCardioEntriesList();
  } else {
    document.getElementById('section-exercises').style.display = 'block';
    document.getElementById('section-warmup').style.display = 'none';
    document.getElementById('section-cardio').style.display = 'none';
    document.getElementById('section-add-buttons').style.display = 'flex';
    document.getElementById('btn-add-warmup').style.display = '';
    document.getElementById('btn-add-cardio').style.display = '';
    document.getElementById('warmup-select').innerHTML = state.warmupTypes.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
    document.getElementById('day-select').innerHTML = state.days.map((d, i) => `<option value="${i}">${d.name}</option>`).join('');
    loadDayExercises();
  }
}

function addWarmup() {
  document.getElementById('section-warmup').style.display = 'block';
  document.getElementById('btn-add-warmup').style.display = 'none';
  document.getElementById('warmup-select').innerHTML = state.warmupTypes.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
  renderWarmupFields();
  document.getElementById('section-warmup').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function removeWarmup() {
  document.getElementById('section-warmup').style.display = 'none';
  document.getElementById('btn-add-warmup').style.display = '';
  document.getElementById('warmup-time').value = '';
}

function addCardio() {
  document.getElementById('section-cardio').style.display = 'block';
  document.getElementById('btn-add-cardio').style.display = 'none';
  renderCardioEntriesList();
}

function removeCardio() {
  document.getElementById('section-cardio').style.display = 'none';
  document.getElementById('btn-add-cardio').style.display = '';
  document.getElementById('cardio-entries-list').innerHTML = '';
  cardioEntryCount = 0;
}

function renderWarmupFields() {
  const idx = parseInt(document.getElementById('warmup-select').value);
  const container = document.getElementById('warmup-fields');
  if (container) container.innerHTML = buildDynamicFieldsHTML('warmup', state.warmupTypes[idx]);
}

function startManualWorkout(cardioOnly) {
  const todayBtn = document.querySelector('.nav-btn');
  showPage('today', todayBtn);
  startWorkout(true, cardioOnly);
}

function showSummary() {
  saveDraft();
  document.getElementById('today-planning').style.display = 'none';
  document.getElementById('today-summary').style.display = 'block';
  document.getElementById('calories-input').value = '';
  buildSummary();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function backToPlanning() {
  document.getElementById('today-summary').style.display = 'none';
  document.getElementById('today-planning').style.display = 'block';
}

// ---- LOAD DAY EXERCISES (with add/delete) ----
function loadDayExercises() {
  const dayIndex = parseInt(document.getElementById('day-select').value);
  const day = state.days[dayIndex];
  const container = document.getElementById('exercise-log-list');
  if (!day || day.exercises.length === 0) {
    container.innerHTML = '<p style="color:#9a9a9f; font-size:14px; margin-top:8px;">No exercises defined. Go to Setup to add some.</p>';
    renderAddExerciseLogBtn();
    return;
  }
  let html = `<div class="modal-exercise-header" style="margin-top:12px;"><span>Exercise</span><span>Sets</span><span>Reps</span><span>KG</span><span></span></div>`;
  day.exercises.forEach((ex, i) => {
    html += `<div class="exercise-log-row" id="log-row-${i}">
        <input type="text" id="exname-${i}" value="${ex.name}" placeholder="Exercise name" />
        <input type="number" id="sets-${i}" value="${ex.sets || ''}" placeholder="-" min="1" max="99" />
        <input type="number" id="reps-${i}" value="${ex.reps || ''}" placeholder="0" min="0" max="99" />
        <input type="number" id="kg-${i}" value="${ex.kg || ''}" placeholder="0" min="0" max="999" step="0.5" />
        <button class="btn-danger" onclick="removeLogExercise(this)" style="padding:6px 8px;">🗑</button>
      </div>`;
  });
  container.innerHTML = html;
  renderAddExerciseLogBtn();
}

function renderAddExerciseLogBtn() {
  const container = document.getElementById('exercise-log-list');
  const btn = document.createElement('button');
  btn.className = 'btn-outline full-width';
  btn.style.marginTop = '8px';
  btn.textContent = '+ Add exercise';
  btn.onclick = addLogExercise;
  container.appendChild(btn);
}

function removeLogExercise(btn) {
  btn.closest('.exercise-log-row').remove();
}

function addLogExercise() {
  const container = document.getElementById('exercise-log-list');
  const addBtn = container.querySelector('.btn-outline');
  const i = container.querySelectorAll('.modal-exercise-row').length;
  const row = document.createElement('div');
  row.className = 'exercise-log-row';
  row.innerHTML = `
    <input type="text" id="exname-${i}" placeholder="Exercise name" />
    <input type="number" id="sets-${i}" placeholder="-" min="1" max="99" />
    <input type="number" id="reps-${i}" placeholder="0" min="0" max="99" />
    <input type="number" id="kg-${i}" placeholder="0" min="0" max="999" step="0.5" />
    <button class="btn-danger" onclick="removeLogExercise(this)" style="padding:6px 8px;">🗑</button>
  `;
  container.insertBefore(row, addBtn);
}

// ---- BUILD SUMMARY ----
function buildSummary() {
  const warmupVisible = document.getElementById('section-warmup').style.display !== 'none';
  const cardioVisible = document.getElementById('section-cardio').style.display !== 'none';
  const cardioEntries = cardioVisible ? collectCardioEntries() : [];

  let displayDate = isManualEntry
    ? (document.getElementById('manual-date').value
        ? new Date(document.getElementById('manual-date').value + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
    : new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  let html = `<div class="summary-row"><div><div class="summary-label">Date</div><div class="summary-value">${displayDate}</div></div></div>`;

  if (isCardioOnly) {
    html += `<div class="summary-row"><div><div class="summary-label">Type</div><div class="summary-value">🏃 Cardio only</div></div></div>`;
  } else {
    if (warmupVisible) {
      const warmupIdx = parseInt(document.getElementById('warmup-select').value);
      const warmupType = state.warmupTypes[warmupIdx];
      const warmupTime = document.getElementById('warmup-time').value;
      const warmupFields = collectDynamicFields('warmup', warmupType);
      let warmupDetail = warmupType.name;
      if (warmupTime) warmupDetail += ` · ${warmupTime} min`;
      const warmupExtras = Object.entries(warmupFields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');
      if (warmupExtras) warmupDetail += ` · ${warmupExtras}`;
      html += `<div class="summary-row"><div><div class="summary-label">Warmup</div><div class="summary-value">${warmupDetail}</div></div></div>`;
    }

    const dayIndex = parseInt(document.getElementById('day-select').value);
    const day = state.days[dayIndex];
    html += `<div class="summary-row"><div><div class="summary-label">Workout</div><div class="summary-value">${day ? day.name : '-'}</div></div></div>`;

    const logRows = document.querySelectorAll('#exercise-log-list .exercise-log-row');
  logRows.forEach((row, i) => {
    const nameEl = row.querySelector(`#exname-${i}`);
    const name = nameEl ? nameEl.value.trim() : '';
    const repsEl = row.querySelector(`#reps-${i}`);
    const kgEl = row.querySelector(`#kg-${i}`);
    const setsEl = row.querySelector(`#sets-${i}`);
    const reps = repsEl?.value || '-';
    const kg = kgEl?.value || '-';
    const sets = setsEl?.value || '-';
    if (name) {
      html += `
        <div class="summary-exercise-row">
          <div>
            <div style="font-size:14px; font-weight:500;">${name}</div>
            <div style="font-size:12px; color:#9a9a9f;">${sets} sets · ${reps} reps · ${kg} kg</div>
            <div class="note-text" id="note-text-${i}"></div>
          </div>
          <button class="btn-note" id="note-btn-${i}" onclick="toggleNote(${i})">📝 Next time</button>
        </div>`;
    }
  });
  }

  cardioEntries.forEach((c, i) => {
    let cardioStr = c.name;
    if (c.time) cardioStr += ` · ${c.time} min`;
    const extras = Object.entries(c.fields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');
    if (extras) cardioStr += ` · ${extras}`;
    html += `<div class="summary-row"><div><div class="summary-label">Cardio ${cardioEntries.length > 1 ? i + 1 : ''}</div><div class="summary-value">${cardioStr}</div></div></div>`;
  });

  document.getElementById('summary-content').innerHTML = html;
}

function toggleNote(index) {
  const btn = document.getElementById('note-btn-' + index);
  const noteDiv = document.getElementById('note-text-' + index);
  if (btn.classList.contains('noted')) {
    btn.classList.remove('noted');
    btn.textContent = '📝 Next time';
    noteDiv.textContent = '';
  } else {
    const note = prompt('Note for next time (e.g. "Try 5kg more"):');
    if (note && note.trim()) {
      btn.classList.add('noted');
      btn.textContent = '✓ Noted';
      noteDiv.textContent = '→ ' + note.trim();
    }
  }
}

// ---- SAVE WORKOUT ----
async function saveWorkout() {
  const warmupVisible = document.getElementById('section-warmup').style.display !== 'none';
  const cardioVisible = document.getElementById('section-cardio').style.display !== 'none';
  const cardioEntries = cardioVisible ? collectCardioEntries() : [];
  const calories = document.getElementById('calories-input').value || '';

  const workoutDate = isManualEntry
    ? (document.getElementById('manual-date').value ? new Date(document.getElementById('manual-date').value + 'T12:00:00').toISOString() : new Date().toISOString())
    : new Date().toISOString();

  let workout = { date: workoutDate, cardioOnly: isCardioOnly, cardioEntries, calories };

  if (!isCardioOnly) {
    const dayIndex = parseInt(document.getElementById('day-select').value);
    const day = state.days[dayIndex];

    const logRows = document.querySelectorAll('#exercise-log-list .exercise-log-row');
    const exercises = [];
  logRows.forEach((row, i) => {
    const nameEl = row.querySelector(`#exname-${i}`);
    const name = nameEl ? nameEl.value.trim() : '';
    const setsEl = row.querySelector(`#sets-${i}`);
    const repsEl = row.querySelector(`#reps-${i}`);
    const kgEl = row.querySelector(`#kg-${i}`);
    const noteDiv = document.getElementById('note-text-' + i);
    const note = noteDiv ? noteDiv.textContent.replace('→ ', '').trim() : '';
    const sets = setsEl?.value || '';
    if (name) exercises.push({ name, sets, reps: repsEl?.value || '', kg: kgEl?.value || '', note });
  });

    exercises.forEach((ex, i) => {
      if (day && state.days[dayIndex].exercises[i]) {
        state.days[dayIndex].exercises[i].lastNote = ex.note || '';
      }
    });

    workout = { ...workout, dayName: day ? day.name : '', exercises };

    if (warmupVisible) {
      const warmupIdx = parseInt(document.getElementById('warmup-select').value);
      const warmupType = state.warmupTypes[warmupIdx];
      const warmupTime = document.getElementById('warmup-time').value;
      const warmupFields = collectDynamicFields('warmup', warmupType);
      workout = { ...workout, warmup: warmupType.name, warmupTime, warmupFields };
    }
  }

  state.history.unshift(workout);
  state.history.sort((a, b) => new Date(b.date) - new Date(a.date));
  await saveState();
  clearDraft();
  resetToIdle();
  isManualEntry = false;
  isCardioOnly = false;
  alert('Workout saved! Great work 💪');
}

// ---- SETUP ----
function renderSetup() {
  renderExerciseLibrary();
  renderDaysList();
  renderWarmupTypesList();
  renderCardioTypesList();
}

// ---- EXERCISE LIBRARY ----
let editingExerciseIndex = -1;

function renderExerciseLibrary() {
  const container = document.getElementById('exercise-library-list');
  if (!container) return;
  if (!state.exercises || state.exercises.length === 0) {
    container.innerHTML = '<p class="empty-state">No exercises yet. Add some to build your library.</p>';
    return;
  }
  container.innerHTML = state.exercises.map((ex, i) => `
    <div class="setup-item">
      <div>
        <div class="setup-item-name">${ex.name}</div>
        <div class="setup-item-meta">${ex.sets || '-'} sets · ${ex.reps || '-'} reps · ${ex.kg || '-'} kg</div>
      </div>
      <div class="setup-item-actions">
        <button class="btn-outline" style="padding:6px 12px; font-size:13px;" onclick="openExerciseEditor(${i})">Edit</button>
        <button class="btn-danger" onclick="deleteExercise(${i})">🗑</button>
      </div>
    </div>`).join('');
}

function openExerciseEditor(index) {
  editingExerciseIndex = index;
  if (index === -1) {
    document.getElementById('exercise-editor-title').textContent = 'New exercise';
    document.getElementById('ex-editor-name').value = '';
    document.getElementById('ex-editor-sets').value = '';
    document.getElementById('ex-editor-reps').value = '';
    document.getElementById('ex-editor-kg').value = '';
  } else {
    const ex = state.exercises[index];
    document.getElementById('exercise-editor-title').textContent = 'Edit ' + ex.name;
    document.getElementById('ex-editor-name').value = ex.name;
    document.getElementById('ex-editor-sets').value = ex.sets || '';
    document.getElementById('ex-editor-reps').value = ex.reps || '';
    document.getElementById('ex-editor-kg').value = ex.kg || '';
  }
  document.getElementById('exercise-editor-overlay').style.display = 'flex';
}

function closeExerciseEditor() {
  document.getElementById('exercise-editor-overlay').style.display = 'none';
}

async function saveExerciseEditor() {
  const name = document.getElementById('ex-editor-name').value.trim();
  if (!name) return alert('Please enter a name.');
  const sets = parseInt(document.getElementById('ex-editor-sets').value) || 3;
  const reps = parseInt(document.getElementById('ex-editor-reps').value) || 0;
  const kg = parseFloat(document.getElementById('ex-editor-kg').value) || 0;
  if (!state.exercises) state.exercises = [];
  if (editingExerciseIndex === -1) {
    state.exercises.push({ name, sets, reps, kg });
  } else {
    state.exercises[editingExerciseIndex] = { name, sets, reps, kg };
  }
  await saveState();
  closeExerciseEditor();
  renderExerciseLibrary();
}

async function deleteExercise(i) {
  if (!confirm('Delete this exercise from the library?')) return;
  state.exercises.splice(i, 1);
  await saveState();
  renderExerciseLibrary();
}

// ---- LIBRARY PICKER ----
function openLibraryPicker() {
  if (!state.exercises || state.exercises.length === 0) {
    alert('Your exercise library is empty. Add some exercises first.');
    return;
  }
  const existingNames = [...document.querySelectorAll('#modal-exercise-list .modal-exercise-row input:first-child')]
    .map(i => i.value.trim().toLowerCase());
  const list = document.getElementById('library-picker-list');
  list.innerHTML = state.exercises.map((ex, i) => {
    const alreadyAdded = existingNames.includes(ex.name.toLowerCase());
    return `
      <label class="library-picker-row ${alreadyAdded ? 'already-added' : ''}">
        <input type="checkbox" value="${i}" ${alreadyAdded ? 'checked' : ''} />
        <div>
          <div class="setup-item-name">${ex.name}</div>
          <div class="setup-item-meta">${ex.sets || '-'} sets · ${ex.reps || '-'} reps · ${ex.kg || '-'} kg</div>
        </div>
      </label>`;
  }).join('');
  document.getElementById('library-picker-overlay').style.display = 'flex';
}

function closeLibraryPicker() {
  document.getElementById('library-picker-overlay').style.display = 'none';
}

function confirmLibraryPick() {
  const checked = [...document.querySelectorAll('#library-picker-list input[type="checkbox"]:checked')];
  const existingNames = [...document.querySelectorAll('#modal-exercise-list .modal-exercise-row input:first-child')]
    .map(i => i.value.trim().toLowerCase());
  checked.forEach(cb => {
    const ex = state.exercises[parseInt(cb.value)];
    if (!ex) return;
    if (existingNames.includes(ex.name.toLowerCase())) return;
    existingNames.push(ex.name.toLowerCase());
    const row = document.createElement('div');
    row.className = 'modal-exercise-row';
    row.innerHTML = `
      <input type="text" value="${ex.name}" placeholder="Exercise name" />
      <input type="number" value="${ex.sets || ''}" placeholder="-" min="1" max="99" />
      <input type="number" value="${ex.reps || ''}" placeholder="-" min="0" max="99" />
      <input type="number" value="${ex.kg || ''}" placeholder="-" min="0" max="999" step="0.5" />
      <button class="btn-danger" onclick="this.parentElement.remove()">🗑</button>
    `;
    attachNameExpand(row.querySelector('input:first-child'));
    document.getElementById('modal-exercise-list').appendChild(row);
  });
  closeLibraryPicker();
}

// ---- DAYS LIST ----
function renderDaysList() {
  const container = document.getElementById('days-list');
  if (!container) return;
  if (state.days.length === 0) { container.innerHTML = '<p class="empty-state">No days defined yet.</p>'; return; }
  container.innerHTML = state.days.map((d, i) => {
    const noteRows = d.exercises.map((ex, exIndex) => ({ ex, exIndex })).filter(({ ex }) => ex.lastNote)
      .map(({ ex, exIndex }) => `<div class="setup-note-row"><span class="setup-note-text">📝 ${ex.name}: ${ex.lastNote}</span><button class="btn-clear-note" onclick="clearNote(${i}, ${exIndex})">✓ Clear</button></div>`).join('');
    return `
      <div class="setup-item" style="flex-direction:column; align-items:stretch; gap:4px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div><div class="setup-item-name">${d.name}</div><div class="setup-item-meta">${d.exercises.length} exercise${d.exercises.length !== 1 ? 's' : ''}</div></div>
          <div class="setup-item-actions">
            <button class="btn-outline" style="padding:6px 12px; font-size:13px;" onclick="openDayEditor(${i})">Edit</button>
            <button class="btn-danger" onclick="deleteDay(${i})">🗑</button>
          </div>
        </div>
        ${noteRows ? `<div class="setup-day-notes">${noteRows}</div>` : ''}
      </div>`;
  }).join('');
}

async function clearNote(dayIndex, exIndex) {
  state.days[dayIndex].exercises[exIndex].lastNote = '';
  await saveState();
  renderDaysList();
}

function renderWarmupTypesList() {
  const container = document.getElementById('warmup-types-list');
  if (!container) return;
  if (state.warmupTypes.length === 0) { container.innerHTML = '<p class="empty-state">No warmup types yet.</p>'; return; }
  container.innerHTML = state.warmupTypes.map((t, i) => `
    <div class="setup-item">
      <div><div class="setup-item-name">${t.name}</div>${t.fields && t.fields.length > 0 ? `<div class="setup-item-meta">${t.fields.map(f => f.name).join(' · ')}</div>` : ''}</div>
      <div class="setup-item-actions">
        <button class="btn-outline" style="padding:6px 12px; font-size:13px;" onclick="openTypeEditor('warmup', ${i})">Edit</button>
        <button class="btn-danger" onclick="deleteWarmupType(${i})">🗑</button>
      </div>
    </div>`).join('');
}

function renderCardioTypesList() {
  const container = document.getElementById('cardio-types-list');
  if (!container) return;
  if (state.cardioTypes.length === 0) { container.innerHTML = '<p class="empty-state">No cardio types yet.</p>'; return; }
  container.innerHTML = state.cardioTypes.map((t, i) => `
    <div class="setup-item">
      <div><div class="setup-item-name">${t.name}</div>${t.fields && t.fields.length > 0 ? `<div class="setup-item-meta">${t.fields.map(f => f.name).join(' · ')}</div>` : ''}</div>
      <div class="setup-item-actions">
        <button class="btn-outline" style="padding:6px 12px; font-size:13px;" onclick="openTypeEditor('cardio', ${i})">Edit</button>
        <button class="btn-danger" onclick="deleteCardioType(${i})">🗑</button>
      </div>
    </div>`).join('');
}

async function deleteWarmupType(i) { state.warmupTypes.splice(i, 1); await saveState(); renderWarmupTypesList(); }
async function deleteCardioType(i) { state.cardioTypes.splice(i, 1); await saveState(); renderCardioTypesList(); }

// ---- TYPE EDITOR MODAL ----
function openTypeEditor(kind, index) {
  editingTypeKind = kind;
  editingTypeIndex = index;
  const arr = kind === 'warmup' ? state.warmupTypes : state.cardioTypes;
  const title = document.getElementById('type-modal-title');
  const nameInput = document.getElementById('type-modal-name');
  const fieldsContainer = document.getElementById('type-modal-fields');
  if (index === -1) {
    title.textContent = `New ${kind} type`;
    nameInput.value = '';
    fieldsContainer.innerHTML = '';
  } else {
    const t = arr[index];
    title.textContent = `Edit ${t.name}`;
    nameInput.value = t.name;
    fieldsContainer.innerHTML = (t.fields || []).map(f => `
      <div class="type-field-row">
        <input type="text" value="${f.name}" placeholder="e.g. Speed" />
        <input type="number" value="${f.default || ''}" placeholder="default" min="0" max="9999" step="0.1" style="width:80px;" />
        <button class="btn-danger" onclick="this.parentElement.remove()">🗑</button>
      </div>`).join('');
  }
  document.getElementById('type-editor-overlay').style.display = 'flex';
}

function addTypeField() {
  const row = document.createElement('div');
  row.className = 'type-field-row';
  row.innerHTML = `<input type="text" placeholder="e.g. Speed" /><input type="number" placeholder="default" min="0" max="9999" step="0.1" style="width:80px;" /><button class="btn-danger" onclick="this.parentElement.remove()">🗑</button>`;
  document.getElementById('type-modal-fields').appendChild(row);
}

function closeTypeEditor() { document.getElementById('type-editor-overlay').style.display = 'none'; }

async function saveType() {
  const name = document.getElementById('type-modal-name').value.trim();
  if (!name) return alert('Please enter a name.');
  const fields = [...document.querySelectorAll('#type-modal-fields .type-field-row')].map(row => {
    const inputs = row.querySelectorAll('input');
    return { name: inputs[0].value.trim(), default: inputs[1].value || '' };
  }).filter(f => f.name);
  const arr = editingTypeKind === 'warmup' ? state.warmupTypes : state.cardioTypes;
  if (editingTypeIndex === -1) arr.push({ name, fields });
  else arr[editingTypeIndex] = { name, fields };
  await saveState();
  closeTypeEditor();
  if (editingTypeKind === 'warmup') renderWarmupTypesList();
  else renderCardioTypesList();
}

// ---- DAY EDITOR MODAL ----
function openDayEditor(index) {
  editingDayIndex = index;
  const title = document.getElementById('modal-title');
  const nameInput = document.getElementById('modal-day-name');
  const exList = document.getElementById('modal-exercise-list');
  if (index === -1) {
    title.textContent = 'New day';
    nameInput.value = '';
    exList.innerHTML = '';
  } else {
    const day = state.days[index];
    title.textContent = 'Edit ' + day.name;
    nameInput.value = day.name;
    exList.innerHTML = day.exercises.map(ex => `
      <div class="modal-exercise-row">
        <input type="text" value="${ex.name}" placeholder="Exercise name" />
        <input type="number" value="${ex.sets || ''}" placeholder="-" min="1" max="99" />
        <input type="number" value="${ex.reps || ''}" placeholder="-" min="0" max="99" />
        <input type="number" value="${ex.kg || ''}" placeholder="-" min="0" max="999" step="0.5" />
        <button class="btn-danger" onclick="this.parentElement.remove()">🗑</button>
      </div>`).join('');
  }
  exList.querySelectorAll('.modal-exercise-row input:first-child').forEach(attachNameExpand);
  document.getElementById('day-editor-overlay').style.display = 'flex';
}

function addExerciseToModal() {
  const row = document.createElement('div');
  row.className = 'modal-exercise-row';
  row.innerHTML = `
    <input type="text" placeholder="Exercise name" />
    <input type="number" placeholder="-" min="1" max="99" />
    <input type="number" placeholder="-" min="0" max="99" />
    <input type="number" placeholder="-" min="0" max="999" step="0.5" />
    <button class="btn-danger" onclick="this.parentElement.remove()">🗑</button>
  `;
  attachNameExpand(row.querySelector('input:first-child'));
  document.getElementById('modal-exercise-list').appendChild(row);
}

function closeDayEditor() { document.getElementById('day-editor-overlay').style.display = 'none'; }

async function saveDay() {
  const name = document.getElementById('modal-day-name').value.trim();
  if (!name) return alert('Please enter a day name.');
  const rows = document.querySelectorAll('#modal-exercise-list .modal-exercise-row');
  const exercises = [];
  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const exName = inputs[0].value.trim();
    const sets = parseInt(inputs[1].value) || 3;
    const reps = parseInt(inputs[2].value) || 0;
    const kg = parseFloat(inputs[3].value) || 0;
    const existing = editingDayIndex !== -1 ? state.days[editingDayIndex].exercises.find(e => e.name === exName) : null;
    if (exName) exercises.push({ name: exName, sets, reps, kg, lastNote: existing?.lastNote || '' });
  });
  if (editingDayIndex === -1) state.days.push({ name, exercises });
  else state.days[editingDayIndex] = { name, exercises };
  await saveState();
  closeDayEditor();
  renderDaysList();
}

async function deleteDay(i) {
  if (!confirm('Delete this day?')) return;
  state.days.splice(i, 1);
  await saveState();
  renderDaysList();
}

// ---- HISTORY STATS ----
function renderStats() {
  const container = document.getElementById('history-stats');
  if (!container || state.history.length === 0) { if (container) container.innerHTML = ''; return; }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentYear = new Date().getFullYear();
  const counts = {};
  state.history.forEach(w => {
    const d = new Date(w.date);
    const y = d.getFullYear();
    const m = d.getMonth();
    if (!counts[y]) counts[y] = Array(12).fill(0);
    counts[y][m]++;
  });
  let html = '';
  for (let year = currentYear; year >= 2025; year--) {
    const yearCounts = counts[year] || Array(12).fill(0);
    const yearTotal = yearCounts.reduce((a, b) => a + b, 0);
    const monthCells = MONTHS.map((name, i) => {
      const count = yearCounts[i];
      return `<div class="stats-month ${count > 0 ? 'has-workouts' : ''}"><div class="stats-month-name">${name}</div><div class="stats-month-count">${count > 0 ? count : '·'}</div></div>`;
    }).join('');
    html += `<div class="stats-card"><div class="stats-year-title"><span>${year}</span><span class="stats-year-total">${yearTotal} workout${yearTotal !== 1 ? 's' : ''}</span></div><div class="stats-months">${monthCells}</div></div>`;
  }
  container.innerHTML = html;
}

// ---- ADVANCED STATS ----
function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

function makeChartOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#9a9a9f', font: { size: 10 }, maxRotation: 45 }, grid: { color: '#3a3a42' } },
      y: {
        ticks: { color: '#9a9a9f', font: { size: 10 } },
        grid: { color: '#3a3a42' },
        title: yLabel ? { display: true, text: yLabel, color: '#9a9a9f', font: { size: 11 } } : { display: false }
      }
    }
  };
}

function renderAdvancedStats() {
  const statsTab = document.getElementById('history-tab-stats');
  if (!statsTab) return;
  if (!state.history || state.history.length === 0) {
    statsTab.innerHTML = '<div class="card"><div class="card-title">📊 Stats</div><p class="chart-empty">No workout data yet.</p></div>';
    return;
  }
  const sorted = [...state.history].sort((a, b) => new Date(a.date) - new Date(b.date));

  // Frequency
  const freqMap = {};
  sorted.forEach(w => {
    const d = new Date(w.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    freqMap[key] = (freqMap[key] || 0) + 1;
  });
  const freqLabels = Object.keys(freqMap);
  destroyChart('frequency');
  const freqCanvas = document.getElementById('chart-frequency');
  if (freqCanvas) {
    chartInstances['frequency'] = new Chart(freqCanvas, {
      type: 'bar',
      data: { labels: freqLabels, datasets: [{ data: freqLabels.map(k => freqMap[k]), backgroundColor: '#1a3a6e', borderColor: '#7eb8f7', borderWidth: 1, borderRadius: 4 }] },
      options: makeChartOptions('sessions')
    });
  }

  // Calories
  const calWorkouts = sorted.filter(w => w.calories && !isNaN(parseFloat(w.calories)));
  destroyChart('calories');
  const calCanvas = document.getElementById('chart-calories');
  if (calCanvas) {
    const existingEmpty = calCanvas.nextElementSibling;
    if (existingEmpty && existingEmpty.classList.contains('chart-empty')) existingEmpty.remove();
    if (calWorkouts.length === 0) {
      calCanvas.style.display = 'none';
      calCanvas.insertAdjacentHTML('afterend', '<p class="chart-empty">No calorie data yet.</p>');
    } else {
      calCanvas.style.display = '';
      chartInstances['calories'] = new Chart(calCanvas, {
        type: 'line',
        data: { labels: calWorkouts.map(w => new Date(w.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })), datasets: [{ data: calWorkouts.map(w => parseFloat(w.calories)), borderColor: '#f0a500', backgroundColor: 'rgba(240,165,0,0.1)', tension: 0.3, pointRadius: 4, pointBackgroundColor: '#f0a500', fill: true }] },
        options: makeChartOptions('kcal')
      });
    }
  }

  // Volume
  const volWorkouts = sorted.filter(w => w.exercises && w.exercises.length > 0);
  destroyChart('volume');
  const volCanvas = document.getElementById('chart-volume');
  if (volCanvas) {
    const existingEmpty = volCanvas.nextElementSibling;
    if (existingEmpty && existingEmpty.classList.contains('chart-empty')) existingEmpty.remove();
    if (volWorkouts.length === 0) {
      volCanvas.style.display = 'none';
      volCanvas.insertAdjacentHTML('afterend', '<p class="chart-empty">No lifting data yet.</p>');
    } else {
      volCanvas.style.display = '';
      chartInstances['volume'] = new Chart(volCanvas, {
        type: 'line',
        data: { labels: volWorkouts.map(w => new Date(w.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })), datasets: [{ data: volWorkouts.map(w => w.exercises.reduce((sum, ex) => sum + ((parseFloat(ex.kg) || 0) * (parseInt(ex.reps) || 0)), 0)), borderColor: '#7eb8f7', backgroundColor: 'rgba(126,184,247,0.1)', tension: 0.3, pointRadius: 4, pointBackgroundColor: '#7eb8f7', fill: true }] },
        options: makeChartOptions('kg')
      });
    }
  }

  // Per-exercise
  const exMap = {};
  sorted.forEach(w => {
    if (!w.exercises) return;
    const dateLabel = new Date(w.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    w.exercises.forEach(ex => {
      if (!ex.name || ex.kg === '' || ex.kg === undefined) return;
      const kg = parseFloat(ex.kg);
      if (isNaN(kg)) return;
      if (!exMap[ex.name]) exMap[ex.name] = { labels: [], data: [] };
      exMap[ex.name].labels.push(dateLabel);
      exMap[ex.name].data.push(kg);
    });
  });
  const exContainer = document.getElementById('exercise-charts');
  if (exContainer) {
    Object.keys(chartInstances).forEach(k => { if (k.startsWith('ex-')) destroyChart(k); });
    exContainer.innerHTML = '';
    Object.entries(exMap).forEach(([name, { labels, data }]) => {
      if (data.length < 2) return;
      const safeId = 'ex-' + name.replace(/[^a-zA-Z0-9]/g, '_');
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="card-title">💪 ${name}</div><canvas id="chart-${safeId}"></canvas>`;
      exContainer.appendChild(card);
      chartInstances[safeId] = new Chart(card.querySelector('canvas'), {
        type: 'line',
        data: { labels, datasets: [{ data, borderColor: '#7eb8f7', backgroundColor: 'rgba(126,184,247,0.08)', tension: 0.3, pointRadius: 4, pointBackgroundColor: '#7eb8f7', fill: true }] },
        options: makeChartOptions('kg')
      });
    });
    if (exContainer.innerHTML === '') {
      exContainer.innerHTML = '<div class="card"><div class="card-title">💪 Exercise progress</div><p class="chart-empty">Log at least 2 sessions with the same exercises to see progress charts.</p></div>';
    }
  }
}

// ---- HISTORY TAB SWITCHER ----
function switchHistoryTab(tab) {
  document.getElementById('history-tab-history').style.display = tab === 'history' ? 'block' : 'none';
  document.getElementById('history-tab-stats').style.display = tab === 'stats' ? 'block' : 'none';
  document.getElementById('tab-btn-history').classList.toggle('active', tab === 'history');
  document.getElementById('tab-btn-stats').classList.toggle('active', tab === 'stats');
  if (tab === 'stats') renderAdvancedStats();
}

// ---- RENDER HISTORY ----
function renderHistory() {
  renderStats();
  const container = document.getElementById('history-list');
  if (!container) return;
  if (state.history.length === 0) {
    container.innerHTML = '<p class="empty-state">No workouts saved yet.<br>Complete your first session!</p>';
    return;
  }
  container.innerHTML = state.history.map((w, i) => {
    const date = new Date(w.date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    let body = '';
    if (w.cardioOnly) {
      body += `<div class="cardio-only-badge">🏃 Cardio only</div>`;
    } else {
      let warmupStr = (w.warmup || '') + (w.warmupTime ? ` · ${w.warmupTime} min` : '');
      if (w.warmupFields) {
        const extras = Object.entries(w.warmupFields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');
        if (extras) warmupStr += ` · ${extras}`;
      }
      if (w.warmup) body += `<div class="history-meta">🔥 ${warmupStr}</div>`;
      body += `<div class="history-day-name">${w.dayName || ''}</div>`;
      if (w.exercises) {
        body += w.exercises.map(ex => `
          <div class="history-exercise">
            <span>${ex.name}</span>
            <span>${ex.sets ? ex.sets + ' sets · ' : ''}${ex.reps ? ex.reps + ' reps' : ''} ${ex.kg ? '· ' + ex.kg + ' kg' : ''}</span>
          </div>
          ${ex.note ? `<div class="history-note">→ ${ex.note}</div>` : ''}`).join('');
      }
    }
    if (w.cardioEntries && w.cardioEntries.length > 0) {
      w.cardioEntries.forEach((c) => {
        let cardioStr = c.name + (c.time ? ` · ${c.time} min` : '');
        if (c.fields) {
          const extras = Object.entries(c.fields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');
          if (extras) cardioStr += ` · ${extras}`;
        }
        body += `<div class="history-meta">🏃 ${cardioStr}</div>`;
      });
    } else if (w.cardio) {
      let cardioStr = w.cardio + (w.cardioTime ? ` · ${w.cardioTime} min` : '');
      if (w.cardioFields) {
        const extras = Object.entries(w.cardioFields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');
        if (extras) cardioStr += ` · ${extras}`;
      }
      body += `<div class="history-meta">🏃 ${cardioStr}</div>`;
    }
    if (w.calories) body += `<div class="history-calories">🔥 ${w.calories} kcal</div>`;
    return `
      <div class="history-card">
        <div class="history-card-header">
          <div class="history-date">${date}</div>
          <div style="display:flex; gap:6px;">
            <button class="btn-edit-sm" onclick="openHistoryEdit(${i})">✏️ Edit</button>
            <button class="btn-danger-sm" onclick="deleteWorkout(${i})">🗑 Delete</button>
          </div>
        </div>
        ${body}
      </div>`;
  }).join('');
}

// ---- HISTORY EDIT MODAL ----
let editingHistoryIndex = -1;

function openHistoryEdit(index) {
  editingHistoryIndex = index;
  const w = state.history[index];
  const d = new Date(w.date);
  document.getElementById('hedit-date').value = d.toISOString().split('T')[0];
  document.getElementById('hedit-calories').value = w.calories || '';

  const exSection = document.getElementById('hedit-exercises-section');
  const exList = document.getElementById('hedit-exercise-list');
  exSection.style.display = 'block';
  if (w.exercises && w.exercises.length > 0) {
    exList.innerHTML = w.exercises.map((ex, i) => `
      <div class="modal-exercise-row" id="hedit-ex-row-${i}">
        <input type="text" value="${ex.name || ''}" placeholder="Exercise" />
        <input type="number" value="${ex.sets || ''}" placeholder="-" min="1" max="99" />
        <input type="number" value="${ex.reps || ''}" placeholder="-" min="0" max="99" />
        <input type="number" value="${ex.kg || ''}" placeholder="-" min="0" max="999" step="0.5" />
        <button class="btn-danger" onclick="this.closest('.modal-exercise-row').remove()" style="padding:4px 8px;">🗑</button>
      </div>`).join('');
    document.getElementById('hedit-notes').value = w.exercises.map(ex => ex.note || '').join('\n');
  } else {
    exList.innerHTML = '';
    document.getElementById('hedit-notes').value = '';
  }

  const cardioSection = document.getElementById('hedit-cardio-section');
  const cardioList = document.getElementById('hedit-cardio-list');
  const entries = w.cardioEntries || (w.cardio ? [{ name: w.cardio, time: w.cardioTime || '', fields: w.cardioFields || {} }] : []);
  if (entries.length > 0) {
    cardioSection.style.display = 'block';
    cardioList.innerHTML = entries.map((c, i) => {
      const fieldsStr = c.fields ? Object.entries(c.fields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ') : '';
      return `
        <div class="hedit-cardio-row" id="hedit-cardio-row-${i}">
          <input type="text" value="${c.name || ''}" placeholder="Type" style="margin-bottom:6px;" />
          <div style="display:flex; gap:8px;">
            <input type="number" value="${c.time || ''}" placeholder="min" min="1" max="300" style="width:80px;" />
            <input type="text" value="${fieldsStr}" placeholder="e.g. Speed: 5, Load: 3" style="flex:1;" />
          </div>
        </div>`;
    }).join('');
  } else {
    cardioSection.style.display = 'none';
  }
  document.getElementById('history-edit-overlay').style.display = 'flex';
}

function addHeditExercise() {
  const row = document.createElement('div');
  row.className = 'modal-exercise-row';
  row.innerHTML = `
    <input type="text" placeholder="Exercise" />
    <input type="number" placeholder="-" min="1" max="99" />
    <input type="number" placeholder="-" min="0" max="99" />
    <input type="number" placeholder="-" min="0" max="999" step="0.5" />
    <button class="btn-danger" onclick="this.closest('.modal-exercise-row').remove()" style="padding:4px 8px;">🗑</button>
  `;
  document.getElementById('hedit-exercise-list').appendChild(row);
}

function closeHistoryEdit() {
  document.getElementById('history-edit-overlay').style.display = 'none';
  editingHistoryIndex = -1;
}

async function saveHistoryEdit() {
  if (editingHistoryIndex === -1) return;
  const w = state.history[editingHistoryIndex];
  const dateVal = document.getElementById('hedit-date').value;
  if (dateVal) w.date = new Date(dateVal + 'T12:00:00').toISOString();
  w.calories = document.getElementById('hedit-calories').value || '';

  const allRows = document.querySelectorAll('#hedit-exercise-list .modal-exercise-row');
  const notes = document.getElementById('hedit-notes').value.split('\n');
  w.exercises = [];
  allRows.forEach((row, i) => {
    const inputs = row.querySelectorAll('input');
    const name = inputs[0].value.trim();
    if (!name) return;
    w.exercises.push({ name, sets: inputs[1].value || '', reps: inputs[2].value || '', kg: inputs[3].value || '', note: (notes[i] || '').trim() });
  });

  const entries = w.cardioEntries || (w.cardio ? [{ name: w.cardio, time: w.cardioTime || '', fields: w.cardioFields || {} }] : []);
  if (entries.length > 0) {
    w.cardioEntries = entries.map((c, i) => {
      const row = document.getElementById(`hedit-cardio-row-${i}`);
      if (!row) return c;
      const inputs = row.querySelectorAll('input');
      const name = inputs[0].value.trim() || c.name;
      const time = inputs[1].value || c.time;
      const fields = {};
      inputs[2].value.split(',').forEach(part => {
        const [k, v] = part.split(':').map(s => s.trim());
        if (k && v) fields[k] = v;
      });
      return { name, time, fields };
    });
    delete w.cardio; delete w.cardioTime; delete w.cardioFields;
  }

  state.history.sort((a, b) => new Date(b.date) - new Date(a.date));
  await saveState();
  closeHistoryEdit();
  renderHistory();
}

async function deleteWorkout(index) {
  if (!confirm('Delete this workout from history?')) return;
  state.history.splice(index, 1);
  await saveState();
  renderHistory();
}

// ---- EXPOSE TO HTML ----
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleSignOut = handleSignOut;
window.showPage = showPage;
window.startWorkout = startWorkout;
window.startManualWorkout = startManualWorkout;
window.showSummary = showSummary;
window.backToPlanning = backToPlanning;
window.loadDayExercises = loadDayExercises;
window.renderWarmupFields = renderWarmupFields;
window.updateCardioEntryFields = updateCardioEntryFields;
window.addCardioEntry = addCardioEntry;
window.removeCardioEntry = removeCardioEntry;
window.toggleNote = toggleNote;
window.saveWorkout = saveWorkout;
window.clearNote = clearNote;
window.deleteWarmupType = deleteWarmupType;
window.deleteCardioType = deleteCardioType;
window.openTypeEditor = openTypeEditor;
window.addTypeField = addTypeField;
window.closeTypeEditor = closeTypeEditor;
window.saveType = saveType;
window.openDayEditor = openDayEditor;
window.addExerciseToModal = addExerciseToModal;
window.closeDayEditor = closeDayEditor;
window.saveDay = saveDay;
window.deleteDay = deleteDay;
window.deleteWorkout = deleteWorkout;
window.openHistoryEdit = openHistoryEdit;
window.closeHistoryEdit = closeHistoryEdit;
window.saveHistoryEdit = saveHistoryEdit;
window.addHeditExercise = addHeditExercise;
window.renderAdvancedStats = renderAdvancedStats;
window.switchHistoryTab = switchHistoryTab;
window.resumeDraft = resumeDraft;
window.discardDraft = discardDraft;
window.openExerciseEditor = openExerciseEditor;
window.closeExerciseEditor = closeExerciseEditor;
window.saveExerciseEditor = saveExerciseEditor;
window.deleteExercise = deleteExercise;
window.openLibraryPicker = openLibraryPicker;
window.closeLibraryPicker = closeLibraryPicker;
window.confirmLibraryPick = confirmLibraryPick;
window.addWarmup = addWarmup;
window.removeWarmup = removeWarmup;
window.addCardio = addCardio;
window.removeCardio = removeCardio;
window.removeLogExercise = removeLogExercise;
window.addLogExercise = addLogExercise;