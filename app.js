// ============================================================
// WORKOUT LOG - app.js
// ============================================================

import { registerUser, loginUser, logoutUser, onAuthChange, loadUserData, saveUserData } from './firebase.js';

// ---- STATE ----
let state = { days: [], warmupTypes: [], cardioTypes: [], history: [], exercises: [] };
let currentUser = null;
let isEditMode = false;
let editingHistoryIndex = -1;
let editingExerciseIndex = -1;
let editingTypeKind = null;
let editingTypeIndex = -1;
let cardioEntryCount = 0;

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
    resetToIdle();
  } else {
    currentUser = null;
    state = { days: [], warmupTypes: [], cardioTypes: [], history: [], exercises: [] };
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    resetToIdle();
  }
});

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
  if (pageId === 'today' && !isEditMode) resetToIdle();
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

// ---- CARDIO ENTRIES ----
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

// ---- DRAFT ----
const DRAFT_KEY = 'workout-log-draft';

function saveDraft() {
  if (!currentUser || isEditMode) return;
  try {
    const draft = { uid: currentUser.uid, savedAt: new Date().toISOString() };
    draft.warmupVisible = document.getElementById('section-warmup').style.display !== 'none';
    draft.cardioVisible = document.getElementById('section-cardio').style.display !== 'none';
    if (draft.warmupVisible) {
      const warmupIdx = parseInt(document.getElementById('warmup-select')?.value || '0');
      draft.warmupIdx = warmupIdx;
      draft.warmupTime = document.getElementById('warmup-time')?.value || '';
      const warmupType = state.warmupTypes[warmupIdx];
      draft.warmupFields = collectDynamicFields('warmup', warmupType);
    }
    const logRows = document.querySelectorAll('#exercise-log-list .exercise-log-row');
    draft.exercises = [];
    logRows.forEach((row, i) => {
      const nameEl = row.querySelector(`#exname-${i}`);
      draft.exercises.push({
        name: nameEl?.value || '',
        sets: document.getElementById(`sets-${i}`)?.value || '',
        reps: document.getElementById(`reps-${i}`)?.value || '',
        kg: document.getElementById(`kg-${i}`)?.value || ''
      });
    });
    draft.cardioEntries = draft.cardioVisible ? collectCardioEntries() : [];
    draft.calories = document.getElementById('calories-input')?.value || '';
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
  const d = new Date(draft.savedAt);
  const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  container.innerHTML = `
    <div class="draft-banner">
      <div class="draft-info">Draft from ${dateStr} ${timeStr}</div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="btn-primary" style="flex:1;" onclick="resumeDraft()">💪 Continue workout</button>
        <button class="btn-outline" style="padding:10px 14px;" onclick="discardDraft()">✕</button>
      </div>
    </div>`;
}

function resumeDraft() {
  const draft = loadDraft();
  if (!draft) return;
  startWorkout();
  if (draft.warmupVisible) {
    document.getElementById('warmup-select').innerHTML = state.warmupTypes.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
    if (draft.warmupIdx !== undefined) document.getElementById('warmup-select').value = draft.warmupIdx;
    renderWarmupFields();
    if (draft.warmupTime) document.getElementById('warmup-time').value = draft.warmupTime;
    if (draft.warmupFields) {
      const warmupType = state.warmupTypes[draft.warmupIdx || 0];
      if (warmupType) {
        warmupType.fields.forEach(f => {
          const el = document.getElementById(`field-warmup-${f.name.toLowerCase().replace(/\s/g,'_')}`);
          if (el && draft.warmupFields[f.name]) el.value = draft.warmupFields[f.name];
        });
      }
    }
    document.getElementById('section-warmup').style.display = 'block';
    document.getElementById('btn-add-warmup').style.display = 'none';
  }
  if (draft.exercises && draft.exercises.length > 0) {
    const container = document.getElementById('exercise-log-list');
    draft.exercises.forEach((ex, i) => {
      const row = document.createElement('div');
      row.className = 'exercise-log-row';
      row.innerHTML = `
        ${buildExerciseSelect(i, ex.name)}
        <input type="number" id="sets-${i}" value="${ex.sets}" placeholder="-" min="1" max="99" />
        <input type="number" id="reps-${i}" value="${ex.reps}" placeholder="0" min="0" max="99" />
        <input type="number" id="kg-${i}" value="${ex.kg}" placeholder="0" min="0" max="999" step="0.5" />
        <button class="btn-danger" onclick="removeLogExercise(this)" style="padding:6px 8px;">🗑</button>
      `;
      container.appendChild(row);
    });
    document.getElementById('exercise-log-header').style.display = 'grid';
  }
  if (draft.cardioVisible && draft.cardioEntries && draft.cardioEntries.length > 0) {
    document.getElementById('section-cardio').style.display = 'block';
    document.getElementById('btn-add-cardio').style.display = 'none';
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
      document.getElementById('cardio-entries-list').appendChild(div);
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
  }
  if (draft.calories) document.getElementById('calories-input').value = draft.calories;
}

function discardDraft() {
  clearDraft();
  renderContinueButton();
}

// ---- RECENT WORKOUTS ----
function renderRecentWorkouts() {
  const container = document.getElementById('recent-workouts');
  if (!container) return;
  if (!state.history || state.history.length === 0) { container.innerHTML = ''; return; }
  const recent = state.history.slice(0, 4);
  const html = recent.map(w => {
    const date = new Date(w.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const parts = [];
    if (w.dayName) parts.push(w.dayName);
    if (w.exercises && w.exercises.length > 0) parts.push(`${w.exercises.length} exercise${w.exercises.length !== 1 ? 's' : ''}`);
    if (w.cardioEntries && w.cardioEntries.length > 0) parts.push(w.cardioEntries.map(c => c.name).join(', '));
    else if (w.cardio) parts.push(w.cardio);
    if (w.calories) parts.push(`🔥 ${w.calories} kcal`);
    return `<div class="recent-card">
      <div class="recent-date">${date}</div>
      <div class="recent-detail">${parts.join(' · ') || '—'}</div>
    </div>`;
  }).join('');
  container.innerHTML = `<div class="recent-label">Recent workouts</div>${html}`;
}

// ---- TODAY PAGE ----
function startWorkout() {
  isEditMode = false;
  clearDraft();
  document.getElementById('today-idle').style.display = 'none';
  document.getElementById('today-planning').style.display = 'block';
  document.getElementById('edit-date-card').style.display = 'none';
  document.getElementById('cancel-edit-btn').style.display = 'none';
  document.getElementById('log-btn').textContent = 'Log workout now';
  document.getElementById('section-warmup').style.display = 'none';
  document.getElementById('section-cardio').style.display = 'none';
  document.getElementById('btn-add-warmup').style.display = '';
  document.getElementById('btn-add-cardio').style.display = '';
  document.getElementById('warmup-select').innerHTML = state.warmupTypes.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
  document.getElementById('exercise-log-list').innerHTML = '';
  document.getElementById('exercise-log-header').style.display = 'none';
  document.getElementById('cardio-entries-list').innerHTML = '';
  cardioEntryCount = 0;
  document.getElementById('calories-input').value = '';
  document.getElementById('warmup-time').value = '';
  document.getElementById('warmup-fields').innerHTML = '';
}

function resetToIdle() {
  document.getElementById('today-idle').style.display = 'block';
  document.getElementById('today-planning').style.display = 'none';
  isEditMode = false;
  editingHistoryIndex = -1;
  renderContinueButton();
  renderRecentWorkouts();
}

// ---- WARMUP ----
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

function renderWarmupFields() {
  const idx = parseInt(document.getElementById('warmup-select').value);
  const container = document.getElementById('warmup-fields');
  if (container) container.innerHTML = buildDynamicFieldsHTML('warmup', state.warmupTypes[idx]);
}

// ---- CARDIO ----
function addCardio() {
  document.getElementById('section-cardio').style.display = 'block';
  document.getElementById('btn-add-cardio').style.display = 'none';
  document.getElementById('cardio-entries-list').innerHTML = '';
  cardioEntryCount = 0;
  addCardioEntry();
}

function removeCardio() {
  document.getElementById('section-cardio').style.display = 'none';
  document.getElementById('btn-add-cardio').style.display = '';
  document.getElementById('cardio-entries-list').innerHTML = '';
  cardioEntryCount = 0;
}

// ---- EXERCISE LOG ----
function buildExerciseSelect(i, selectedName) {
  const inLibrary = (state.exercises || []).some(e => e.name === selectedName);
  const extraOption = selectedName && !inLibrary ? `<option value="${selectedName}" selected>${selectedName}</option>` : '';
  const options = (state.exercises || []).map(e =>
    `<option value="${e.name}" ${e.name === selectedName ? 'selected' : ''}>${e.name}</option>`
  ).join('');
  return `<select id="exname-${i}" onchange="fillExerciseDefaults(${i})">${extraOption}${options}</select>`;
}

function fillExerciseDefaults(i) {
  const sel = document.getElementById(`exname-${i}`);
  if (!sel) return;
  const ex = (state.exercises || []).find(e => e.name === sel.value);
  if (!ex) return;
  const setsEl = document.getElementById(`sets-${i}`);
  const repsEl = document.getElementById(`reps-${i}`);
  const kgEl = document.getElementById(`kg-${i}`);
  if (setsEl) setsEl.value = ex.sets || '';
  if (repsEl) repsEl.value = ex.reps || '';
  if (kgEl) kgEl.value = ex.kg || '';
}

function addLogExercise() {
  const container = document.getElementById('exercise-log-list');
  const i = container.querySelectorAll('.exercise-log-row').length;
  const row = document.createElement('div');
  row.className = 'exercise-log-row';
  const firstEx = state.exercises && state.exercises[0];
  row.innerHTML = `
    ${buildExerciseSelect(i, firstEx ? firstEx.name : '')}
    <input type="number" id="sets-${i}" value="${firstEx ? firstEx.sets || '' : ''}" placeholder="-" min="1" max="99" />
    <input type="number" id="reps-${i}" value="${firstEx ? firstEx.reps || '' : ''}" placeholder="0" min="0" max="99" />
    <input type="number" id="kg-${i}" value="${firstEx ? firstEx.kg || '' : ''}" placeholder="0" min="0" max="999" step="0.5" />
    <button class="btn-danger" onclick="removeLogExercise(this)" style="padding:6px 8px;">🗑</button>
  `;
  container.appendChild(row);
  if (i === 0) document.getElementById('exercise-log-header').style.display = 'grid';
  saveDraft();
}

function removeLogExercise(btn) {
  btn.closest('.exercise-log-row').remove();
  const container = document.getElementById('exercise-log-list');
  if (container.querySelectorAll('.exercise-log-row').length === 0) {
    document.getElementById('exercise-log-header').style.display = 'none';
  }
  saveDraft();
}

// ---- SAVE WORKOUT ----
async function saveWorkout() {
  if (isEditMode) { await saveWorkoutEdit(); return; }

  const warmupVisible = document.getElementById('section-warmup').style.display !== 'none';
  const cardioVisible = document.getElementById('section-cardio').style.display !== 'none';
  const cardioEntries = cardioVisible ? collectCardioEntries() : [];
  const calories = document.getElementById('calories-input').value || '';

  const logRows = document.querySelectorAll('#exercise-log-list .exercise-log-row');
  const exercises = [];
  logRows.forEach((row, i) => {
    const nameEl = row.querySelector(`#exname-${i}`);
    const name = nameEl ? nameEl.value.trim() : '';
    const sets = row.querySelector(`#sets-${i}`)?.value || '';
    const reps = row.querySelector(`#reps-${i}`)?.value || '';
    const kg = row.querySelector(`#kg-${i}`)?.value || '';
    if (name) exercises.push({ name, sets, reps, kg });
  });

  let workout = { date: new Date().toISOString(), cardioEntries, calories, exercises };

  if (warmupVisible) {
    const warmupIdx = parseInt(document.getElementById('warmup-select').value);
    const warmupType = state.warmupTypes[warmupIdx];
    const warmupTime = document.getElementById('warmup-time').value;
    const warmupFields = collectDynamicFields('warmup', warmupType);
    workout = { ...workout, warmup: warmupType.name, warmupTime, warmupFields };
  }

  state.history.unshift(workout);
  state.history.sort((a, b) => new Date(b.date) - new Date(a.date));
  await saveState();
  clearDraft();
  resetToIdle();
}

// ---- EDIT WORKOUT ----
function openWorkoutEdit(index) {
  isEditMode = true;
  editingHistoryIndex = index;
  const w = state.history[index];

  const todayBtn = document.querySelector('.nav-btn');
  showPage('today', todayBtn);

  document.getElementById('today-idle').style.display = 'none';
  document.getElementById('today-planning').style.display = 'block';
  document.getElementById('edit-date-card').style.display = 'block';
  document.getElementById('edit-date').value = new Date(w.date).toISOString().split('T')[0];
  document.getElementById('cancel-edit-btn').style.display = 'block';
  document.getElementById('log-btn').textContent = 'Save changes';

  document.getElementById('section-warmup').style.display = 'none';
  document.getElementById('section-cardio').style.display = 'none';
  document.getElementById('btn-add-warmup').style.display = '';
  document.getElementById('btn-add-cardio').style.display = '';
  document.getElementById('exercise-log-list').innerHTML = '';
  document.getElementById('exercise-log-header').style.display = 'none';
  document.getElementById('cardio-entries-list').innerHTML = '';
  cardioEntryCount = 0;

  document.getElementById('warmup-select').innerHTML = state.warmupTypes.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
  if (w.warmup) {
    const warmupIdx = state.warmupTypes.findIndex(t => t.name === w.warmup);
    if (warmupIdx >= 0) document.getElementById('warmup-select').value = warmupIdx;
    renderWarmupFields();
    if (w.warmupTime) document.getElementById('warmup-time').value = w.warmupTime;
    if (w.warmupFields) {
      const warmupType = state.warmupTypes[warmupIdx >= 0 ? warmupIdx : 0];
      if (warmupType) {
        warmupType.fields.forEach(f => {
          const el = document.getElementById(`field-warmup-${f.name.toLowerCase().replace(/\s/g,'_')}`);
          if (el && w.warmupFields[f.name]) el.value = w.warmupFields[f.name];
        });
      }
    }
    document.getElementById('section-warmup').style.display = 'block';
    document.getElementById('btn-add-warmup').style.display = 'none';
  }

  if (w.exercises && w.exercises.length > 0) {
    const container = document.getElementById('exercise-log-list');
    w.exercises.forEach((ex, i) => {
      const row = document.createElement('div');
      row.className = 'exercise-log-row';
      row.innerHTML = `
        ${buildExerciseSelect(i, ex.name)}
        <input type="number" id="sets-${i}" value="${ex.sets || ''}" placeholder="-" min="1" max="99" />
        <input type="number" id="reps-${i}" value="${ex.reps || ''}" placeholder="0" min="0" max="99" />
        <input type="number" id="kg-${i}" value="${ex.kg || ''}" placeholder="0" min="0" max="999" step="0.5" />
        <button class="btn-danger" onclick="removeLogExercise(this)" style="padding:6px 8px;">🗑</button>
      `;
      container.appendChild(row);
    });
    document.getElementById('exercise-log-header').style.display = 'grid';
  }

  const entries = w.cardioEntries || (w.cardio ? [{ name: w.cardio, time: w.cardioTime || '', fields: w.cardioFields || {} }] : []);
  if (entries.length > 0) {
    document.getElementById('section-cardio').style.display = 'block';
    document.getElementById('btn-add-cardio').style.display = 'none';
    entries.forEach(entry => {
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
      document.getElementById('cardio-entries-list').appendChild(div);
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
  }

  document.getElementById('calories-input').value = w.calories || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveWorkoutEdit() {
  const w = state.history[editingHistoryIndex];
  const dateVal = document.getElementById('edit-date').value;
  if (dateVal) w.date = new Date(dateVal + 'T12:00:00').toISOString();
  w.calories = document.getElementById('calories-input').value || '';

  const warmupVisible = document.getElementById('section-warmup').style.display !== 'none';
  if (warmupVisible) {
    const warmupIdx = parseInt(document.getElementById('warmup-select').value);
    const warmupType = state.warmupTypes[warmupIdx];
    w.warmup = warmupType.name;
    w.warmupTime = document.getElementById('warmup-time').value;
    w.warmupFields = collectDynamicFields('warmup', warmupType);
  } else {
    delete w.warmup; delete w.warmupTime; delete w.warmupFields;
  }

  const logRows = document.querySelectorAll('#exercise-log-list .exercise-log-row');
  w.exercises = [];
  logRows.forEach((row, i) => {
    const nameEl = row.querySelector(`#exname-${i}`);
    const name = nameEl ? nameEl.value.trim() : '';
    const sets = row.querySelector(`#sets-${i}`)?.value || '';
    const reps = row.querySelector(`#reps-${i}`)?.value || '';
    const kg = row.querySelector(`#kg-${i}`)?.value || '';
    if (name) w.exercises.push({ name, sets, reps, kg });
  });

  const cardioVisible = document.getElementById('section-cardio').style.display !== 'none';
  w.cardioEntries = cardioVisible ? collectCardioEntries() : [];
  delete w.cardio; delete w.cardioTime; delete w.cardioFields;

  state.history.sort((a, b) => new Date(b.date) - new Date(a.date));
  await saveState();

  isEditMode = false;
  editingHistoryIndex = -1;
  const historyBtn = document.querySelectorAll('.nav-btn')[2];
  showPage('history', historyBtn);
}

function cancelEdit() {
  isEditMode = false;
  editingHistoryIndex = -1;
  const historyBtn = document.querySelectorAll('.nav-btn')[2];
  showPage('history', historyBtn);
}

// ---- EXPORT ----
function exportWorkouts() {
  const json = JSON.stringify(state.history, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'workouts.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ---- SETUP ----
function renderSetup() {
  renderExerciseLibrary();
  renderWarmupTypesList();
  renderCardioTypesList();
}

// ---- EXERCISE LIBRARY ----
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

// ---- WARMUP / CARDIO TYPES ----
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

// ---- RENDER HISTORY ----
function renderHistory() {
  const container = document.getElementById('history-list');
  if (!container) return;
  if (!state.history || state.history.length === 0) {
    container.innerHTML = '<p class="empty-state">No workouts saved yet.<br>Complete your first session!</p>';
    return;
  }
  container.innerHTML = state.history.map((w, i) => {
    const date = new Date(w.date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    let body = '';
    let warmupStr = (w.warmup || '') + (w.warmupTime ? ` · ${w.warmupTime} min` : '');
    if (w.warmupFields) {
      const extras = Object.entries(w.warmupFields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');
      if (extras) warmupStr += ` · ${extras}`;
    }
    if (w.warmup) body += `<div class="history-meta">🔥 ${warmupStr}</div>`;
    if (w.dayName) body += `<div class="history-day-name">${w.dayName}</div>`;
    if (w.exercises && w.exercises.length > 0) {
      body += w.exercises.map(ex => `
        <div class="history-exercise">
          <span>${ex.name}</span>
          <span>${ex.sets ? ex.sets + ' sets · ' : ''}${ex.reps ? ex.reps + ' reps' : ''} ${ex.kg ? '· ' + ex.kg + ' kg' : ''}</span>
        </div>`).join('');
    }
    if (w.cardioEntries && w.cardioEntries.length > 0) {
      w.cardioEntries.forEach(c => {
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
            <button class="btn-edit-sm" onclick="openWorkoutEdit(${i})">✏️ Edit</button>
            <button class="btn-danger-sm" onclick="deleteWorkout(${i})">🗑 Delete</button>
          </div>
        </div>
        ${body}
      </div>`;
  }).join('');
}

async function deleteWorkout(index) {
  if (!confirm('Delete this workout from history?')) return;
  state.history.splice(index, 1);
  await saveState();
  renderHistory();
  renderRecentWorkouts();
}

// ---- EXPOSE TO HTML ----
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleSignOut = handleSignOut;
window.showPage = showPage;
window.startWorkout = startWorkout;
window.saveWorkout = saveWorkout;
window.cancelEdit = cancelEdit;
window.openWorkoutEdit = openWorkoutEdit;
window.exportWorkouts = exportWorkouts;
window.renderWarmupFields = renderWarmupFields;
window.updateCardioEntryFields = updateCardioEntryFields;
window.addCardioEntry = addCardioEntry;
window.removeCardioEntry = removeCardioEntry;
window.addWarmup = addWarmup;
window.removeWarmup = removeWarmup;
window.addCardio = addCardio;
window.removeCardio = removeCardio;
window.addLogExercise = addLogExercise;
window.removeLogExercise = removeLogExercise;
window.fillExerciseDefaults = fillExerciseDefaults;
window.deleteWorkout = deleteWorkout;
window.openExerciseEditor = openExerciseEditor;
window.closeExerciseEditor = closeExerciseEditor;
window.saveExerciseEditor = saveExerciseEditor;
window.deleteExercise = deleteExercise;
window.openTypeEditor = openTypeEditor;
window.addTypeField = addTypeField;
window.closeTypeEditor = closeTypeEditor;
window.saveType = saveType;
window.deleteWarmupType = deleteWarmupType;
window.deleteCardioType = deleteCardioType;
window.resumeDraft = resumeDraft;
window.discardDraft = discardDraft;
