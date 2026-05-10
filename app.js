// ============================================================
// WORKOUT LOG - app.js
// ============================================================

import { registerUser, loginUser, logoutUser, onAuthChange, loadUserData, saveUserData } from './firebase.js';

// ---- STATE ----
let state = { days: [], warmupTypes: [], cardioTypes: [], history: [] };
let currentUser = null;
let editingDayIndex = -1;
let isManualEntry = false;

// ---- SAVE STATE ----
async function saveState() {
  if (!currentUser) return;
  await saveUserData(currentUser.uid, state);
}

// ---- AUTH HANDLERS ----
async function handleLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'Please enter your email and password.'; errEl.style.display = 'block'; return; }
  try {
    await loginUser(email, password);
  } catch (e) {
    errEl.textContent = 'Login failed. Check your email and password.';
    errEl.style.display = 'block';
  }
}

async function handleRegister() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'Please enter an email and password.'; errEl.style.display = 'block'; return; }
  try {
    await registerUser(email, password);
  } catch (e) {
    errEl.textContent = e.message || 'Registration failed.';
    errEl.style.display = 'block';
  }
}

async function handleSignOut() {
  await logoutUser();
}

// ---- AUTH STATE LISTENER ----
onAuthChange(async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('bottom-nav').style.display = 'flex';
    const data = await loadUserData(user.uid);
    state = data;
    renderSetup();
  } else {
    currentUser = null;
    state = { days: [], warmupTypes: [], cardioTypes: [], history: [] };
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    document.getElementById('today-idle').style.display = 'block';
    document.getElementById('today-planning').style.display = 'none';
    document.getElementById('today-summary').style.display = 'none';
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
}

// ---- EXPANDING NAME FIELD ----
// Adds focus/blur listeners to a name input in a modal exercise row
function attachNameExpand(input) {
  input.addEventListener('focus', () => {
    input.closest('.modal-exercise-row').classList.add('name-focused');
  });
  input.addEventListener('blur', () => {
    input.closest('.modal-exercise-row').classList.remove('name-focused');
  });
}

// ---- TODAY PAGE ----
function startWorkout(manual) {
  isManualEntry = manual;
  document.getElementById('today-idle').style.display = 'none';
  document.getElementById('today-planning').style.display = 'block';
  document.getElementById('today-summary').style.display = 'none';

  const dateCard = document.getElementById('manual-date-card');
  dateCard.style.display = manual ? 'block' : 'none';
  if (manual) document.getElementById('manual-date').value = new Date().toISOString().split('T')[0];

  document.getElementById('warmup-select').innerHTML = state.warmupTypes.map(t => `<option>${t}</option>`).join('');
  document.getElementById('day-select').innerHTML = state.days.map((d, i) => `<option value="${i}">${d.name}</option>`).join('');
  document.getElementById('cardio-select').innerHTML = state.cardioTypes.map(t => `<option>${t}</option>`).join('');

  loadDayExercises();
}

function startManualWorkout() {
  const todayBtn = document.querySelector('.nav-btn');
  showPage('today', todayBtn);
  startWorkout(true);
}

function showSummary() {
  document.getElementById('today-planning').style.display = 'none';
  document.getElementById('today-summary').style.display = 'block';
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

  let html = `
    <div class="exercise-log-header" style="margin-top:12px;">
      <span>Exercise</span><span>Reps</span><span>KG</span>
    </div>
  `;

  day.exercises.forEach((ex, i) => {
    html += `
      <div class="exercise-log-row">
        <div class="exercise-log-name" title="${ex.name}">${ex.name}</div>
        <input type="number" id="reps-${i}" value="${ex.reps || ''}" placeholder="0" min="0" max="99" />
        <input type="number" id="kg-${i}" value="${ex.kg || ''}" placeholder="0" min="0" max="999" step="0.5" />
      </div>
    `;
  });

  container.innerHTML = html;
}

function buildSummary() {
  const dayIndex = parseInt(document.getElementById('day-select').value);
  const day = state.days[dayIndex];
  const warmup = document.getElementById('warmup-select').value;
  const warmupTime = document.getElementById('warmup-time').value;
  const cardio = document.getElementById('cardio-select').value;
  const cardioTime = document.getElementById('cardio-time').value;

  let displayDate;
  if (isManualEntry) {
    const manualVal = document.getElementById('manual-date').value;
    displayDate = manualVal
      ? new Date(manualVal + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } else {
    displayDate = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  let html = `
    <div class="summary-row"><div><div class="summary-label">Date</div><div class="summary-value">${displayDate}</div></div></div>
    <div class="summary-row"><div><div class="summary-label">Warmup</div><div class="summary-value">${warmup}${warmupTime ? ' · ' + warmupTime + ' min' : ''}</div></div></div>
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
            <div style="font-size:12px; color:#9a9a9f;">${reps} reps · ${kg} kg</div>
            <div class="note-text" id="note-text-${i}"></div>
          </div>
          <button class="btn-note" id="note-btn-${i}" onclick="toggleNote(${i})">📝 Next time</button>
        </div>
      `;
    });
  }

  html += `<div class="summary-row" style="margin-top:4px;"><div><div class="summary-label">End cardio</div><div class="summary-value">${cardio}${cardioTime ? ' · ' + cardioTime + ' min' : ''}</div></div></div>`;
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
  const dayIndex = parseInt(document.getElementById('day-select').value);
  const day = state.days[dayIndex];
  const warmup = document.getElementById('warmup-select').value;
  const warmupTime = document.getElementById('warmup-time').value;
  const cardio = document.getElementById('cardio-select').value;
  const cardioTime = document.getElementById('cardio-time').value;

  const exercises = day.exercises.map((ex, i) => {
    const noteDiv = document.getElementById('note-text-' + i);
    const note = noteDiv ? noteDiv.textContent.replace('→ ', '').trim() : '';
    return { name: ex.name, reps: document.getElementById('reps-' + i)?.value || '', kg: document.getElementById('kg-' + i)?.value || '', note };
  });

  exercises.forEach((ex, i) => {
    if (state.days[dayIndex].exercises[i]) state.days[dayIndex].exercises[i].lastNote = ex.note || '';
  });

  const workoutDate = isManualEntry
    ? (document.getElementById('manual-date').value ? new Date(document.getElementById('manual-date').value + 'T12:00:00').toISOString() : new Date().toISOString())
    : new Date().toISOString();

  state.history.unshift({ date: workoutDate, dayName: day.name, warmup, warmupTime, cardio, cardioTime, exercises });
  state.history.sort((a, b) => new Date(b.date) - new Date(a.date));

  await saveState();

  document.getElementById('today-summary').style.display = 'none';
  document.getElementById('today-planning').style.display = 'none';
  document.getElementById('today-idle').style.display = 'block';
  isManualEntry = false;

  alert('Workout saved! Great work 💪');
}

// ---- SETUP PAGE ----
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
    const noteRows = d.exercises
      .map((ex, exIndex) => ({ ex, exIndex }))
      .filter(({ ex }) => ex.lastNote)
      .map(({ ex, exIndex }) => `
        <div class="setup-note-row">
          <span class="setup-note-text">📝 ${ex.name}: ${ex.lastNote}</span>
          <button class="btn-clear-note" onclick="clearNote(${i}, ${exIndex})">✓ Clear</button>
        </div>`).join('');

    return `
      <div class="setup-item" style="flex-direction:column; align-items:stretch; gap:4px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div class="setup-item-name">${d.name}</div>
            <div class="setup-item-meta">${d.exercises.length} exercise${d.exercises.length !== 1 ? 's' : ''}</div>
          </div>
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
  container.innerHTML = state.warmupTypes.length === 0
    ? '<p class="empty-state">No warmup types yet.</p>'
    : state.warmupTypes.map((t, i) => `<div class="setup-item"><div class="setup-item-name">${t}</div><button class="btn-danger" onclick="deleteWarmupType(${i})">🗑</button></div>`).join('');
}

function renderCardioTypesList() {
  const container = document.getElementById('cardio-types-list');
  if (!container) return;
  container.innerHTML = state.cardioTypes.length === 0
    ? '<p class="empty-state">No cardio types yet.</p>'
    : state.cardioTypes.map((t, i) => `<div class="setup-item"><div class="setup-item-name">${t}</div><button class="btn-danger" onclick="deleteCardioType(${i})">🗑</button></div>`).join('');
}

async function addWarmupType() {
  const input = document.getElementById('new-warmup-input');
  const val = input.value.trim();
  if (!val) return;
  state.warmupTypes.push(val);
  await saveState();
  input.value = '';
  renderWarmupTypesList();
}

async function deleteWarmupType(i) {
  state.warmupTypes.splice(i, 1);
  await saveState();
  renderWarmupTypesList();
}

async function addCardioType() {
  const input = document.getElementById('new-cardio-input');
  const val = input.value.trim();
  if (!val) return;
  state.cardioTypes.push(val);
  await saveState();
  input.value = '';
  renderCardioTypesList();
}

async function deleteCardioType(i) {
  state.cardioTypes.splice(i, 1);
  await saveState();
  renderCardioTypesList();
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

  // Attach expand listeners to all name inputs
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
  // Attach expand listener to new row's name input
  attachNameExpand(row.querySelector('input:first-child'));
  document.getElementById('modal-exercise-list').appendChild(row);
}

function closeDayEditor() {
  document.getElementById('day-editor-overlay').style.display = 'none';
}

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

  if (editingDayIndex === -1) {
    state.days.push({ name, exercises });
  } else {
    state.days[editingDayIndex] = { name, exercises };
  }

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

// ---- HISTORY PAGE ----
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

function renderHistory() {
  renderStats();
  const container = document.getElementById('history-list');
  if (!container) return;
  if (state.history.length === 0) { container.innerHTML = '<p class="empty-state">No workouts saved yet.<br>Complete your first session!</p>'; return; }

  container.innerHTML = state.history.map((w, i) => {
    const date = new Date(w.date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const exercises = w.exercises.map(ex => `
      <div class="history-exercise"><span>${ex.name}</span><span>${ex.reps ? ex.reps + ' reps' : ''} ${ex.kg ? '· ' + ex.kg + ' kg' : ''}</span></div>
      ${ex.note ? `<div class="history-note">→ ${ex.note}</div>` : ''}`).join('');

    return `
      <div class="history-card">
        <div class="history-card-header">
          <div class="history-date">${date}</div>
          <button class="btn-danger-sm" onclick="deleteWorkout(${i})">🗑 Delete</button>
        </div>
        <div class="history-day-name">${w.dayName}</div>
        <div class="history-meta">🔥 ${w.warmup}${w.warmupTime ? ' · ' + w.warmupTime + ' min' : ''} &nbsp;·&nbsp; 🏃 ${w.cardio}${w.cardioTime ? ' · ' + w.cardioTime + ' min' : ''}</div>
        ${exercises}
      </div>`;
  }).join('');
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
window.toggleNote = toggleNote;
window.saveWorkout = saveWorkout;
window.clearNote = clearNote;
window.addWarmupType = addWarmupType;
window.deleteWarmupType = deleteWarmupType;
window.addCardioType = addCardioType;
window.deleteCardioType = deleteCardioType;
window.openDayEditor = openDayEditor;
window.addExerciseToModal = addExerciseToModal;
window.closeDayEditor = closeDayEditor;
window.saveDay = saveDay;
window.deleteDay = deleteDay;
window.deleteWorkout = deleteWorkout;