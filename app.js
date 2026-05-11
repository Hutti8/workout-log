// ============================================================
// WORKOUT LOG - app.js
// ============================================================

import { registerUser, loginUser, logoutUser, onAuthChange, loadUserData, saveUserData } from './firebase.js';

// ---- STATE ----
let state = { days: [], warmupTypes: [], cardioTypes: [], history: [] };
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
  return (arr || []).map(t => typeof t === 'string' ? { name: t, fields: [] } : t);
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
    state = { days: [], warmupTypes: [], cardioTypes: [], history: [] };
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
        <span class="dynamic-field-label">${f}</span>
        <input type="number" class="dynamic-field-input" id="field-${containerId}-${f.toLowerCase().replace(/\s/g,'_')}" placeholder="-" min="1" max="99" />
      </div>`).join('')
  }</div>`;
}

function collectDynamicFields(containerId, typeObj) {
  if (!typeObj || !typeObj.fields || typeObj.fields.length === 0) return {};
  const result = {};
  typeObj.fields.forEach(f => {
    const el = document.getElementById(`field-${containerId}-${f.toLowerCase().replace(/\s/g,'_')}`);
    if (el) result[f] = el.value || '';
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

    // Manual date
    if (isManualEntry) {
      draft.manualDate = document.getElementById('manual-date')?.value || '';
    }

    if (!isCardioOnly) {
      // Warmup
      const warmupIdx = parseInt(document.getElementById('warmup-select')?.value || '0');
      draft.warmupIdx = warmupIdx;
      draft.warmupTime = document.getElementById('warmup-time')?.value || '';
      const warmupType = state.warmupTypes[warmupIdx];
      draft.warmupFields = collectDynamicFields('warmup', warmupType);

      // Day + exercises
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

    // Cardio entries
    draft.cardioEntries = collectCardioEntries();

    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (e) { /* localStorage unavailable */ }
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
    document.getElementById('warmup-select').innerHTML = state.warmupTypes.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
    if (draft.warmupIdx !== undefined) document.getElementById('warmup-select').value = draft.warmupIdx;
    renderWarmupFields();

    // Restore warmup time + dynamic fields AFTER renderWarmupFields has built them
    if (draft.warmupTime) document.getElementById('warmup-time').value = draft.warmupTime;
    if (draft.warmupFields) {
      const warmupType = state.warmupTypes[draft.warmupIdx || 0];
      if (warmupType && warmupType.fields) {
        warmupType.fields.forEach(f => {
          const el = document.getElementById(`field-warmup-${f.toLowerCase().replace(/\s/g,'_')}`);
          if (el && draft.warmupFields[f]) el.value = draft.warmupFields[f];
        });
      }
    }

    document.getElementById('day-select').innerHTML = state.days.map((d, i) => `<option value="${i}">${d.name}</option>`).join('');
    if (draft.dayIndex !== undefined) document.getElementById('day-select').value = draft.dayIndex;
    loadDayExercises();

    // Restore reps/kg
    if (draft.exercises) {
      draft.exercises.forEach((ex, i) => {
        const repsEl = document.getElementById('reps-' + i);
        const kgEl = document.getElementById('kg-' + i);
        if (repsEl && ex.reps) repsEl.value = ex.reps;
        if (kgEl && ex.kg) kgEl.value = ex.kg;
      });
    }
  }

  // Restore cardio entries
  const container = document.getElementById('cardio-entries-list');
  container.innerHTML = '';
  cardioEntryCount = 0;
  if (draft.cardioEntries && draft.cardioEntries.length > 0) {
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
      // Restore dynamic fields after they've been built
      if (entry.fields) {
        const typeObj = state.cardioTypes[typeIndex >= 0 ? typeIndex : 0];
        if (typeObj && typeObj.fields) {
          typeObj.fields.forEach(f => {
            const el = document.getElementById(`field-cardio-entry-${id}-${f.toLowerCase().replace(/\s/g,'_')}`);
            if (el && entry.fields[f]) el.value = entry.fields[f];
          });
        }
      }
    });
  } else {
    addCardioEntry();
  }

  // Go straight to summary — show planning momentarily so DOM inputs are readable
  document.getElementById('today-planning').style.display = 'block';
  // Use setTimeout to let the browser render the inputs before buildSummary reads them
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

  // Clear any existing draft when starting fresh
  clearDraft();

  document.getElementById('today-idle').style.display = 'none';
  document.getElementById('today-planning').style.display = 'block';
  document.getElementById('today-summary').style.display = 'none';

  // Show/hide warmup and exercises based on mode
  document.getElementById('section-warmup').style.display = cardioOnly ? 'none' : 'block';
  document.getElementById('section-exercises').style.display = cardioOnly ? 'none' : 'block';

  // Update cardio card title
  document.getElementById('cardio-card-title').textContent = cardioOnly ? '🏃 Cardio' : '🏃 Cardio';

  const dateCard = document.getElementById('manual-date-card');
  dateCard.style.display = manual ? 'block' : 'none';
  if (manual) document.getElementById('manual-date').value = new Date().toISOString().split('T')[0];

  if (!cardioOnly) {
    document.getElementById('warmup-select').innerHTML = state.warmupTypes.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
    document.getElementById('day-select').innerHTML = state.days.map((d, i) => `<option value="${i}">${d.name}</option>`).join('');
    renderWarmupFields();
    loadDayExercises();
  }

  renderCardioEntriesList();
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
  saveDraft(); // save progress before showing summary
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

function loadDayExercises() {
  const dayIndex = parseInt(document.getElementById('day-select').value);
  const day = state.days[dayIndex];
  const container = document.getElementById('exercise-log-list');
  if (!day || day.exercises.length === 0) {
    container.innerHTML = '<p style="color:#9a9a9f; font-size:14px; margin-top:8px;">No exercises defined. Go to Setup to add some.</p>';
    return;
  }
  let html = `<div class="exercise-log-header" style="margin-top:12px;"><span>Exercise</span><span>Reps</span><span>KG</span></div>`;
  day.exercises.forEach((ex, i) => {
    html += `
      <div class="exercise-log-row">
        <div class="exercise-log-name" title="${ex.name}">${ex.name}</div>
        <input type="number" id="reps-${i}" value="${ex.reps || ''}" placeholder="0" min="0" max="99" />
        <input type="number" id="kg-${i}" value="${ex.kg || ''}" placeholder="0" min="0" max="999" step="0.5" />
      </div>`;
  });
  container.innerHTML = html;
}

function buildSummary() {
  const cardioEntries = collectCardioEntries();

  let displayDate = isManualEntry
    ? (document.getElementById('manual-date').value
        ? new Date(document.getElementById('manual-date').value + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
    : new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  let html = `<div class="summary-row"><div><div class="summary-label">Date</div><div class="summary-value">${displayDate}</div></div></div>`;

  if (isCardioOnly) {
    html += `<div class="summary-row"><div><div class="summary-label">Type</div><div class="summary-value">🏃 Cardio only</div></div></div>`;
  } else {
    const warmupIdx = parseInt(document.getElementById('warmup-select').value);
    const warmupType = state.warmupTypes[warmupIdx];
    const warmupTime = document.getElementById('warmup-time').value;
    const warmupFields = collectDynamicFields('warmup', warmupType);
    let warmupDetail = warmupType.name;
    if (warmupTime) warmupDetail += ` · ${warmupTime} min`;
    const warmupExtras = Object.entries(warmupFields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');
    if (warmupExtras) warmupDetail += ` · ${warmupExtras}`;

    const dayIndex = parseInt(document.getElementById('day-select').value);
    const day = state.days[dayIndex];

    html += `
      <div class="summary-row"><div><div class="summary-label">Warmup</div><div class="summary-value">${warmupDetail}</div></div></div>
      <div class="summary-row"><div><div class="summary-label">Workout</div><div class="summary-value">${day ? day.name : '-'}</div></div></div>
    `;

    if (day) {
      day.exercises.forEach((ex, i) => {
        const reps = document.getElementById('reps-' + i)?.value || '-';
        const kg = document.getElementById('kg-' + i)?.value || '-';
        html += `
          <div class="summary-exercise-row">
            <div>
              <div style="font-size:14px; font-weight:500;">${ex.name}</div>
              <div style="font-size:12px; color:#9a9a9f;">${ex.sets || '-'} sets · ${reps} reps · ${kg} kg</div>
              <div class="note-text" id="note-text-${i}"></div>
            </div>
            <button class="btn-note" id="note-btn-${i}" onclick="toggleNote(${i})">📝 Next time</button>
          </div>`;
      });
    }
  }

  // Cardio entries
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

async function saveWorkout() {
  const cardioEntries = collectCardioEntries();
  const calories = document.getElementById('calories-input').value || '';

  const workoutDate = isManualEntry
    ? (document.getElementById('manual-date').value ? new Date(document.getElementById('manual-date').value + 'T12:00:00').toISOString() : new Date().toISOString())
    : new Date().toISOString();

  let workout = { date: workoutDate, cardioOnly: isCardioOnly, cardioEntries, calories };

  if (!isCardioOnly) {
    const dayIndex = parseInt(document.getElementById('day-select').value);
    const day = state.days[dayIndex];
    const warmupIdx = parseInt(document.getElementById('warmup-select').value);
    const warmupType = state.warmupTypes[warmupIdx];
    const warmupTime = document.getElementById('warmup-time').value;
    const warmupFields = collectDynamicFields('warmup', warmupType);

    const exercises = day.exercises.map((ex, i) => {
      const noteDiv = document.getElementById('note-text-' + i);
      const note = noteDiv ? noteDiv.textContent.replace('→ ', '').trim() : '';
      return {
        name: ex.name,
        sets: ex.sets || '',
        reps: document.getElementById('reps-' + i)?.value || '',
        kg: document.getElementById('kg-' + i)?.value || '',
        note
      };
    });

    exercises.forEach((ex, i) => {
      if (state.days[dayIndex].exercises[i]) state.days[dayIndex].exercises[i].lastNote = ex.note || '';
    });

    workout = { ...workout, dayName: day.name, warmup: warmupType.name, warmupTime, warmupFields, exercises };
  }

  state.history.unshift(workout);
  state.history.sort((a, b) => new Date(b.date) - new Date(a.date));
  await saveState();

  clearDraft(); // draft is done
  resetToIdle();
  isManualEntry = false;
  isCardioOnly = false;
  alert('Workout saved! Great work 💪');
}

// ---- SETUP ----
function renderSetup() {
  renderDaysList();
  renderWarmupTypesList();
  renderCardioTypesList();
}

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
      <div><div class="setup-item-name">${t.name}</div>${t.fields && t.fields.length > 0 ? `<div class="setup-item-meta">${t.fields.join(' · ')}</div>` : ''}</div>
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
      <div><div class="setup-item-name">${t.name}</div>${t.fields && t.fields.length > 0 ? `<div class="setup-item-meta">${t.fields.join(' · ')}</div>` : ''}</div>
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
        <input type="text" value="${f}" placeholder="e.g. Speed" />
        <button class="btn-danger" onclick="this.parentElement.remove()">🗑</button>
      </div>`).join('');
  }
  document.getElementById('type-editor-overlay').style.display = 'flex';
}

function addTypeField() {
  const row = document.createElement('div');
  row.className = 'type-field-row';
  row.innerHTML = `<input type="text" placeholder="e.g. Speed" /><button class="btn-danger" onclick="this.parentElement.remove()">🗑</button>`;
  document.getElementById('type-modal-fields').appendChild(row);
}

function closeTypeEditor() { document.getElementById('type-editor-overlay').style.display = 'none'; }

async function saveType() {
  const name = document.getElementById('type-modal-name').value.trim();
  if (!name) return alert('Please enter a name.');
  const fields = [...document.querySelectorAll('#type-modal-fields .type-field-row input')].map(i => i.value.trim()).filter(Boolean);
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

// ---- HISTORY ----
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

// ---- ADVANCED PC STATS ----
function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

function makeChartOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: { color: '#9a9a9f', font: { size: 10 }, maxRotation: 45 },
        grid: { color: '#3a3a42' }
      },
      y: {
        ticks: { color: '#9a9a9f', font: { size: 10 } },
        grid: { color: '#3a3a42' },
        title: yLabel ? { display: true, text: yLabel, color: '#9a9a9f', font: { size: 11 } } : { display: false }
      }
    }
  };
}

function renderAdvancedStats() {
  // Only run on PC
  if (window.innerWidth < 900) return;

  const rightPanel = document.getElementById('history-right');
  if (!rightPanel) return;

  if (!state.history || state.history.length === 0) {
    rightPanel.innerHTML = '<div class="card"><div class="card-title">📊 Advanced stats</div><p class="chart-empty">No workout data yet.</p></div>';
    return;
  }

  // Sort oldest first for chronological charts
  const sorted = [...state.history].sort((a, b) => new Date(a.date) - new Date(b.date));

  // ---- 1. WORKOUT FREQUENCY (bar chart — workouts per month) ----
  const freqMap = {};
  sorted.forEach(w => {
    const d = new Date(w.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    freqMap[key] = (freqMap[key] || 0) + 1;
  });
  const freqLabels = Object.keys(freqMap);
  const freqData = freqLabels.map(k => freqMap[k]);

  destroyChart('frequency');
  const freqCanvas = document.getElementById('chart-frequency');
  if (freqCanvas) {
    chartInstances['frequency'] = new Chart(freqCanvas, {
      type: 'bar',
      data: {
        labels: freqLabels,
        datasets: [{
          data: freqData,
          backgroundColor: '#1a3a6e',
          borderColor: '#7eb8f7',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: makeChartOptions('sessions')
    });
  }

  // ---- 2. CALORIES OVER TIME (line chart) ----
  const calWorkouts = sorted.filter(w => w.calories && !isNaN(parseFloat(w.calories)));
  const calLabels = calWorkouts.map(w => new Date(w.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
  const calData = calWorkouts.map(w => parseFloat(w.calories));

  destroyChart('calories');
  const calCanvas = document.getElementById('chart-calories');
  if (calCanvas) {
    if (calData.length === 0) {
      calCanvas.style.display = 'none';
      calCanvas.insertAdjacentHTML('afterend', '<p class="chart-empty">No calorie data yet.</p>');
    } else {
      calCanvas.style.display = '';
      chartInstances['calories'] = new Chart(calCanvas, {
        type: 'line',
        data: {
          labels: calLabels,
          datasets: [{
            data: calData,
            borderColor: '#f0a500',
            backgroundColor: 'rgba(240,165,0,0.1)',
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: '#f0a500',
            fill: true
          }]
        },
        options: makeChartOptions('kcal')
      });
    }
  }

  // ---- 3. VOLUME OVER TIME (total kg lifted per session) ----
  const volWorkouts = sorted.filter(w => w.exercises && w.exercises.length > 0);
  const volLabels = volWorkouts.map(w => new Date(w.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
  const volData = volWorkouts.map(w =>
    w.exercises.reduce((sum, ex) => sum + ((parseFloat(ex.kg) || 0) * (parseInt(ex.reps) || 0)), 0)
  );

  destroyChart('volume');
  const volCanvas = document.getElementById('chart-volume');
  if (volCanvas) {
    if (volData.length === 0) {
      volCanvas.style.display = 'none';
      volCanvas.insertAdjacentHTML('afterend', '<p class="chart-empty">No lifting data yet.</p>');
    } else {
      volCanvas.style.display = '';
      chartInstances['volume'] = new Chart(volCanvas, {
        type: 'line',
        data: {
          labels: volLabels,
          datasets: [{
            data: volData,
            borderColor: '#7eb8f7',
            backgroundColor: 'rgba(126,184,247,0.1)',
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: '#7eb8f7',
            fill: true
          }]
        },
        options: makeChartOptions('kg')
      });
    }
  }

  // ---- 4. PER-EXERCISE KG PROGRESS (one line chart per exercise) ----
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
    // Destroy old per-exercise charts
    Object.keys(chartInstances).forEach(k => {
      if (k.startsWith('ex-')) destroyChart(k);
    });
    exContainer.innerHTML = '';

    Object.entries(exMap).forEach(([name, { labels, data }]) => {
      if (data.length < 2) return; // need at least 2 data points for a useful chart

      const safeId = 'ex-' + name.replace(/[^a-zA-Z0-9]/g, '_');
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="card-title">💪 ${name}</div><canvas id="chart-${safeId}"></canvas>`;
      exContainer.appendChild(card);

      const canvas = card.querySelector('canvas');
      chartInstances[safeId] = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data,
            borderColor: '#7eb8f7',
            backgroundColor: 'rgba(126,184,247,0.08)',
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: '#7eb8f7',
            fill: true
          }]
        },
        options: makeChartOptions('kg')
      });
    });

    if (exContainer.innerHTML === '') {
      exContainer.innerHTML = '<div class="card"><div class="card-title">💪 Exercise progress</div><p class="chart-empty">Log at least 2 sessions with the same exercises to see progress charts.</p></div>';
    }
  }
}

function renderHistory() {
  renderStats();
  renderAdvancedStats();

  const container = document.getElementById('history-list');
  if (!container) return;
  if (state.history.length === 0) { container.innerHTML = '<p class="empty-state">No workouts saved yet.<br>Complete your first session!</p>'; return; }

  container.innerHTML = state.history.map((w, i) => {
    const date = new Date(w.date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    let body = '';

    if (w.cardioOnly) {
      body += `<div class="cardio-only-badge">🏃 Cardio only</div>`;
    } else {
      // Warmup
      let warmupStr = (w.warmup || '') + (w.warmupTime ? ` · ${w.warmupTime} min` : '');
      if (w.warmupFields) {
        const extras = Object.entries(w.warmupFields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');
        if (extras) warmupStr += ` · ${extras}`;
      }
      body += `<div class="history-meta">🔥 ${warmupStr}</div>`;
      body += `<div class="history-day-name">${w.dayName || ''}</div>`;
      // Exercises — now includes sets
      if (w.exercises) {
        body += w.exercises.map(ex => `
          <div class="history-exercise">
            <span>${ex.name}</span>
            <span>${ex.sets ? ex.sets + ' sets · ' : ''}${ex.reps ? ex.reps + ' reps' : ''} ${ex.kg ? '· ' + ex.kg + ' kg' : ''}</span>
          </div>
          ${ex.note ? `<div class="history-note">→ ${ex.note}</div>` : ''}`).join('');
      }
    }

    // Cardio entries (new format)
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
      // Backwards compat with old single cardio format
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

  // Date
  const d = new Date(w.date);
  document.getElementById('hedit-date').value = d.toISOString().split('T')[0];

  // Calories
  document.getElementById('hedit-calories').value = w.calories || '';

  // Exercises
  const exSection = document.getElementById('hedit-exercises-section');
  const exList = document.getElementById('hedit-exercise-list');
  if (w.exercises && w.exercises.length > 0) {
    exSection.style.display = 'block';
    exList.innerHTML = w.exercises.map((ex, i) => `
      <div class="modal-exercise-row" id="hedit-ex-row-${i}">
        <input type="text" value="${ex.name || ''}" placeholder="Exercise" />
        <input type="number" value="${ex.sets || ''}" placeholder="-" min="1" max="99" />
        <input type="number" value="${ex.reps || ''}" placeholder="-" min="0" max="99" />
        <input type="number" value="${ex.kg || ''}" placeholder="-" min="0" max="999" step="0.5" />
        <span></span>
      </div>`).join('');

    // Notes — one per line
    document.getElementById('hedit-notes').value = w.exercises.map(ex => ex.note || '').join('\n');
  } else {
    exSection.style.display = 'none';
    document.getElementById('hedit-notes').value = '';
  }

  // Cardio entries
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

function closeHistoryEdit() {
  document.getElementById('history-edit-overlay').style.display = 'none';
  editingHistoryIndex = -1;
}

async function saveHistoryEdit() {
  if (editingHistoryIndex === -1) return;
  const w = state.history[editingHistoryIndex];

  // Date
  const dateVal = document.getElementById('hedit-date').value;
  if (dateVal) w.date = new Date(dateVal + 'T12:00:00').toISOString();

  // Calories
  w.calories = document.getElementById('hedit-calories').value || '';

  // Exercises
  if (w.exercises && w.exercises.length > 0) {
    const notes = document.getElementById('hedit-notes').value.split('\n');
    w.exercises = w.exercises.map((ex, i) => {
      const row = document.getElementById(`hedit-ex-row-${i}`);
      if (!row) return ex;
      const inputs = row.querySelectorAll('input');
      return {
        name: inputs[0].value.trim() || ex.name,
        sets: inputs[1].value || ex.sets,
        reps: inputs[2].value || ex.reps,
        kg: inputs[3].value || ex.kg,
        note: (notes[i] || '').trim()
      };
    });
  }

  // Cardio entries
  const entries = w.cardioEntries || (w.cardio ? [{ name: w.cardio, time: w.cardioTime || '', fields: w.cardioFields || {} }] : []);
  if (entries.length > 0) {
    w.cardioEntries = entries.map((c, i) => {
      const row = document.getElementById(`hedit-cardio-row-${i}`);
      if (!row) return c;
      const inputs = row.querySelectorAll('input');
      const name = inputs[0].value.trim() || c.name;
      const time = inputs[1].value || c.time;
      // Parse fields from "Key: val, Key2: val2" format
      const fieldsRaw = inputs[2].value;
      const fields = {};
      fieldsRaw.split(',').forEach(part => {
        const [k, v] = part.split(':').map(s => s.trim());
        if (k && v) fields[k] = v;
      });
      return { name, time, fields };
    });
    // Clean up old single-cardio fields
    delete w.cardio;
    delete w.cardioTime;
    delete w.cardioFields;
  }

  // Re-sort history by date
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
window.renderAdvancedStats = renderAdvancedStats;
window.resumeDraft = resumeDraft;
window.discardDraft = discardDraft;