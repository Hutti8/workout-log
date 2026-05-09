// ============================================================
// WORKOUT LOG - app.js
// ============================================================

// ---- STATE ----
let state = {
  days: [],
  warmupTypes: [],
  cardioTypes: [],
  history: [],
};

let editingDayIndex = -1;
let isManualEntry = false;

// ---- LOCALSTORAGE ----
function saveState() {
  localStorage.setItem('workoutLog', JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem('workoutLog');
  if (saved) {
    state = JSON.parse(saved);
  } else {
    state.warmupTypes = ['Treadmill', 'Stationary bike', 'Rowing machine'];
    state.cardioTypes = ['Walk', 'Cross trainer', 'Treadmill'];
    state.days = [
      { name: 'Day 1', exercises: [{ name: 'Bench press', sets: 4, reps: 10, kg: 60 }, { name: 'Overhead press', sets: 3, reps: 10, kg: 40 }, { name: 'Tricep dips', sets: 3, reps: 12, kg: 0 }] },
      { name: 'Day 2', exercises: [{ name: 'Deadlift', sets: 4, reps: 8, kg: 80 }, { name: 'Pull-ups', sets: 4, reps: 8, kg: 0 }, { name: 'Barbell curl', sets: 3, reps: 12, kg: 30 }] },
      { name: 'Day 3', exercises: [{ name: 'Squat', sets: 4, reps: 10, kg: 70 }, { name: 'Leg press', sets: 3, reps: 12, kg: 100 }, { name: 'Calf raises', sets: 4, reps: 15, kg: 40 }] },
      { name: 'Day 4', exercises: [{ name: 'Incline press', sets: 3, reps: 10, kg: 50 }, { name: 'Lateral raises', sets: 3, reps: 12, kg: 12 }, { name: 'Face pulls', sets: 3, reps: 15, kg: 20 }] },
    ];
    saveState();
  }
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

// ---- TODAY PAGE ----
function startWorkout(manual) {
  isManualEntry = manual;

  document.getElementById('today-idle').style.display = 'none';
  document.getElementById('today-planning').style.display = 'block';
  document.getElementById('today-summary').style.display = 'none';

  const dateCard = document.getElementById('manual-date-card');
  dateCard.style.display = manual ? 'block' : 'none';

  if (manual) {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('manual-date').value = today;
  }

  const warmupSel = document.getElementById('warmup-select');
  warmupSel.innerHTML = state.warmupTypes.map(t => `<option>${t}</option>`).join('');

  const daySel = document.getElementById('day-select');
  daySel.innerHTML = state.days.map((d, i) => `<option value="${i}">${d.name}</option>`).join('');

  const cardioSel = document.getElementById('cardio-select');
  cardioSel.innerHTML = state.cardioTypes.map(t => `<option>${t}</option>`).join('');

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
      <span>Exercise</span>
      <span>Reps</span>
      <span>KG</span>
    </div>
  `;

  day.exercises.forEach((ex, i) => {
    html += `
      <div class="exercise-log-row">
        <div class="exercise-log-name">${ex.name}</div>
        <input type="number" id="reps-${i}" value="${ex.reps || ''}" placeholder="0" min="0" />
        <input type="number" id="kg-${i}" value="${ex.kg || ''}" placeholder="0" min="0" step="0.5" />
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
    <div class="summary-row">
      <div>
        <div class="summary-label">Date</div>
        <div class="summary-value">${displayDate}</div>
      </div>
    </div>
    <div class="summary-row">
      <div>
        <div class="summary-label">Warmup</div>
        <div class="summary-value">${warmup}${warmupTime ? ' · ' + warmupTime + ' min' : ''}</div>
      </div>
    </div>
    <div class="summary-row">
      <div>
        <div class="summary-label">Workout</div>
        <div class="summary-value">${day ? day.name : '-'}</div>
      </div>
    </div>
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

  html += `
    <div class="summary-row" style="margin-top:4px;">
      <div>
        <div class="summary-label">End cardio</div>
        <div class="summary-value">${cardio}${cardioTime ? ' · ' + cardioTime + ' min' : ''}</div>
      </div>
    </div>
  `;

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

function saveWorkout() {
  const dayIndex = parseInt(document.getElementById('day-select').value);
  const day = state.days[dayIndex];
  const warmup = document.getElementById('warmup-select').value;
  const warmupTime = document.getElementById('warmup-time').value;
  const cardio = document.getElementById('cardio-select').value;
  const cardioTime = document.getElementById('cardio-time').value;

  const exercises = day.exercises.map((ex, i) => {
    const noteDiv = document.getElementById('note-text-' + i);
    const note = noteDiv ? noteDiv.textContent.replace('→ ', '').trim() : '';
    return {
      name: ex.name,
      reps: document.getElementById('reps-' + i)?.value || '',
      kg: document.getElementById('kg-' + i)?.value || '',
      note,
    };
  });

  exercises.forEach((ex, i) => {
    if (state.days[dayIndex].exercises[i]) {
      state.days[dayIndex].exercises[i].lastNote = ex.note || '';
    }
  });

  let workoutDate;
  if (isManualEntry) {
    const manualVal = document.getElementById('manual-date').value;
    workoutDate = manualVal ? new Date(manualVal + 'T12:00:00').toISOString() : new Date().toISOString();
  } else {
    workoutDate = new Date().toISOString();
  }

  const workout = {
    date: workoutDate,
    dayName: day.name,
    warmup,
    warmupTime,
    cardio,
    cardioTime,
    exercises,
  };

  state.history.unshift(workout);
  state.history.sort((a, b) => new Date(b.date) - new Date(a.date));
  saveState();

  document.getElementById('today-summary').style.display = 'none';
  document.getElementById('today-planning').style.display = 'none';
  document.getElementById('today-idle').style.display = 'block';
  isManualEntry = false;

  alert('Workout saved! Great work 💪');
}

// ---- HISTORY STATS ----
function renderStats() {
  const container = document.getElementById('history-stats');
  if (state.history.length === 0) {
    container.innerHTML = '';
    return;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentYear = new Date().getFullYear();
  const startYear = 2025;

  // Count workouts per year/month
  const counts = {};
  state.history.forEach(w => {
    const d = new Date(w.date);
    const y = d.getFullYear();
    const m = d.getMonth(); // 0-11
    if (!counts[y]) counts[y] = Array(12).fill(0);
    counts[y][m]++;
  });

  // Build a card for each year from current down to startYear
  let html = '';
  for (let year = currentYear; year >= startYear; year--) {
    const yearCounts = counts[year] || Array(12).fill(0);
    const yearTotal = yearCounts.reduce((a, b) => a + b, 0);

    const monthCells = MONTHS.map((name, i) => {
      const count = yearCounts[i];
      const hasWorkouts = count > 0;
      return `
        <div class="stats-month ${hasWorkouts ? 'has-workouts' : ''}">
          <div class="stats-month-name">${name}</div>
          <div class="stats-month-count">${count > 0 ? count : '·'}</div>
        </div>
      `;
    }).join('');

    html += `
      <div class="stats-card">
        <div class="stats-year-title">
          <span>${year}</span>
          <span class="stats-year-total">${yearTotal} workout${yearTotal !== 1 ? 's' : ''}</span>
        </div>
        <div class="stats-months">${monthCells}</div>
      </div>
    `;
  }

  container.innerHTML = html;
}

// ---- SETUP PAGE ----
function renderSetup() {
  renderDaysList();
  renderWarmupTypesList();
  renderCardioTypesList();
}

function renderDaysList() {
  const container = document.getElementById('days-list');
  if (state.days.length === 0) {
    container.innerHTML = '<p class="empty-state">No days defined yet.</p>';
    return;
  }

  container.innerHTML = state.days.map((d, i) => {
    const noteRows = d.exercises
      .map((ex, exIndex) => ({ ex, exIndex }))
      .filter(({ ex }) => ex.lastNote)
      .map(({ ex, exIndex }) => `
        <div class="setup-note-row">
          <span class="setup-note-text">📝 ${ex.name}: ${ex.lastNote}</span>
          <button class="btn-clear-note" onclick="clearNote(${i}, ${exIndex})">✓ Clear</button>
        </div>
      `).join('');

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
      </div>
    `;
  }).join('');
}

function clearNote(dayIndex, exIndex) {
  state.days[dayIndex].exercises[exIndex].lastNote = '';
  saveState();
  renderDaysList();
}

function renderWarmupTypesList() {
  const container = document.getElementById('warmup-types-list');
  if (state.warmupTypes.length === 0) {
    container.innerHTML = '<p class="empty-state">No warmup types yet.</p>';
    return;
  }
  container.innerHTML = state.warmupTypes.map((t, i) => `
    <div class="setup-item">
      <div class="setup-item-name">${t}</div>
      <button class="btn-danger" onclick="deleteWarmupType(${i})">🗑</button>
    </div>
  `).join('');
}

function renderCardioTypesList() {
  const container = document.getElementById('cardio-types-list');
  if (state.cardioTypes.length === 0) {
    container.innerHTML = '<p class="empty-state">No cardio types yet.</p>';
    return;
  }
  container.innerHTML = state.cardioTypes.map((t, i) => `
    <div class="setup-item">
      <div class="setup-item-name">${t}</div>
      <button class="btn-danger" onclick="deleteCardioType(${i})">🗑</button>
    </div>
  `).join('');
}

function addWarmupType() {
  const input = document.getElementById('new-warmup-input');
  const val = input.value.trim();
  if (!val) return;
  state.warmupTypes.push(val);
  saveState();
  input.value = '';
  renderWarmupTypesList();
}

function deleteWarmupType(i) {
  state.warmupTypes.splice(i, 1);
  saveState();
  renderWarmupTypesList();
}

function addCardioType() {
  const input = document.getElementById('new-cardio-input');
  const val = input.value.trim();
  if (!val) return;
  state.cardioTypes.push(val);
  saveState();
  input.value = '';
  renderCardioTypesList();
}

function deleteCardioType(i) {
  state.cardioTypes.splice(i, 1);
  saveState();
  renderCardioTypesList();
}

// ---- DAY EDITOR MODAL ----
function openDayEditor(index) {
  editingDayIndex = index;
  const modal = document.getElementById('day-editor-overlay');
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
        <input type="number" value="${ex.sets || ''}" placeholder="-" min="1" />
        <input type="number" value="${ex.reps || ''}" placeholder="-" min="0" />
        <input type="number" value="${ex.kg || ''}" placeholder="-" min="0" step="0.5" />
        <button class="btn-danger" onclick="this.parentElement.remove()">🗑</button>
      </div>
    `).join('');
  }

  modal.style.display = 'flex';
}

function addExerciseToModal() {
  const row = document.createElement('div');
  row.className = 'modal-exercise-row';
  row.innerHTML = `
    <input type="text" placeholder="Exercise name" />
    <input type="number" placeholder="-" min="1" />
    <input type="number" placeholder="-" min="0" />
    <input type="number" placeholder="-" min="0" step="0.5" />
    <button class="btn-danger" onclick="this.parentElement.remove()">🗑</button>
  `;
  document.getElementById('modal-exercise-list').appendChild(row);
}

function closeDayEditor() {
  document.getElementById('day-editor-overlay').style.display = 'none';
}

function saveDay() {
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
    const existing = editingDayIndex !== -1
      ? state.days[editingDayIndex].exercises.find(e => e.name === exName)
      : null;
    if (exName) exercises.push({ name: exName, sets, reps, kg, lastNote: existing?.lastNote || '' });
  });

  if (editingDayIndex === -1) {
    state.days.push({ name, exercises });
  } else {
    state.days[editingDayIndex] = { name, exercises };
  }

  saveState();
  closeDayEditor();
  renderDaysList();
}

function deleteDay(i) {
  if (!confirm('Delete this day?')) return;
  state.days.splice(i, 1);
  saveState();
  renderDaysList();
}

// ---- HISTORY PAGE ----
function renderHistory() {
  renderStats();

  const container = document.getElementById('history-list');
  if (state.history.length === 0) {
    container.innerHTML = '<p class="empty-state">No workouts saved yet.<br>Complete your first session!</p>';
    return;
  }

  container.innerHTML = state.history.map((w, i) => {
    const date = new Date(w.date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const exercises = w.exercises.map(ex => `
      <div class="history-exercise">
        <span>${ex.name}</span>
        <span>${ex.reps ? ex.reps + ' reps' : ''} ${ex.kg ? '· ' + ex.kg + ' kg' : ''}</span>
      </div>
      ${ex.note ? `<div class="history-note">→ ${ex.note}</div>` : ''}
    `).join('');

    return `
      <div class="history-card">
        <div class="history-card-header">
          <div class="history-date">${date}</div>
          <button class="btn-danger-sm" onclick="deleteWorkout(${i})">🗑 Delete</button>
        </div>
        <div class="history-day-name">${w.dayName}</div>
        <div class="history-meta">
          🔥 ${w.warmup}${w.warmupTime ? ' · ' + w.warmupTime + ' min' : ''}
          &nbsp;·&nbsp;
          🏃 ${w.cardio}${w.cardioTime ? ' · ' + w.cardioTime + ' min' : ''}
        </div>
        ${exercises}
      </div>
    `;
  }).join('');
}

function deleteWorkout(index) {
  if (!confirm('Delete this workout from history?')) return;
  state.history.splice(index, 1);
  saveState();
  renderHistory();
}

// ---- INIT ----
loadState();