(function(){
  "use strict";

  // ── Constants ─────────────────────────────────────────────────
  const HABIT_OPTIONS = [
    {emo:"💧", title:"Drink water"},
    {emo:"🧘", title:"Meditate 5 min"},
    {emo:"🚶", title:"Walk 10 min"},
    {emo:"📖", title:"Read a page"},
    {emo:"🤸", title:"Stretch"},
    {emo:"✍️", title:"Journal"},
  ];
  const MILESTONES = [
    {days:7,   label:"1 Week",   emo:"🔥"},
    {days:14,  label:"2 Weeks",  emo:"⚡"},
    {days:30,  label:"1 Month",  emo:"🏆"},
    {days:100, label:"100 Days", emo:"💎"},
  ];
  const STORAGE_KEY          = "habitshare:v1:state";
  // Auto-detect backend: on mobile/external use Render, on localhost use local server
  const SERVER_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:4000'
    : 'https://habitshare-backend.onrender.com';
  const MAX_FREE_HABITS      = 1;
  const MAX_PREMIUM_HABITS   = 3;
  const STRIPE_PRICE_MONTHLY = 'price_1TrOBCRqYLhcUmqlfXi5O2RA';
  const STRIPE_PRICE_YEARLY  = 'price_1TrOC6RqYLhcUmqlWXMXeToX';

  // ── State ─────────────────────────────────────────────────────
  let state          = null;
  let selectedOption = null;   // onboarding grid selection
  let addOption      = null;   // add-habit sheet selection
  let timerInterval  = null;

  // ── DOM helpers ───────────────────────────────────────────────
  const $          = id => document.getElementById(id);
  const todayStr   = ()  => new Date().toISOString().slice(0,10);
  const dateStr    = d   => d.toISOString().slice(0,10);

  function daysAgoStr(n){
    const d = new Date();
    d.setDate(d.getDate() - n);
    return dateStr(d);
  }

  // Active habit helpers
  const activeHabit       = () => state.habits[state.activeHabitIndex] || state.habits[0] || null;
  const activeCompletions = () => (activeHabit() || {}).completions || [];

  // ── Toast ─────────────────────────────────────────────────────
  function showToast(msg){
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast._tm);
    showToast._tm = setTimeout(() => t.classList.remove("show"), 2400);
  }

  // ── Referral code ─────────────────────────────────────────────
  function genReferralCode(title){
    const base = (title||"YOU").replace(/[^a-zA-Z]/g,"").toUpperCase().slice(0,4)||"HABT";
    return base + "-" + Math.random().toString(36).slice(2,6).toUpperCase();
  }

  // ── Default state (new habits[] format) ──────────────────────
  function defaultState(){
    return {
      onboarded:            false,
      habits:               [],
      activeHabitIndex:     0,
      referralCode:         null,
      points:               0,
      bestStreak:           0,
      isPremium:            false,
      premiumType:          null,
      premiumSince:         null,
      stripeCustomerId:     null,
      stripeSubscriptionId: null,
      displayName:          '',
      photoURL:             '',
    };
  }

  // ── Migration: old single-habit → habits[] ───────────────────
  // Handles data written by the old version of the app
  function migrateState(s){
    if(s.habit && (!s.habits || !s.habits.length)){
      s.habits = [{
        id:           'habit-0',
        emo:          s.habit.emo         || '💧',
        title:        s.habit.title       || '',
        note:         s.habit.note        || '',
        startDate:    s.habit.startDate   || todayStr(),
        completions:  s.completions       || [],
        reminderTime: s.reminderTime      || '08:00',
      }];
    }
    if(!Array.isArray(s.habits))           s.habits           = [];
    if(s.activeHabitIndex == null)         s.activeHabitIndex = 0;
    if(s.activeHabitIndex >= s.habits.length) s.activeHabitIndex = 0;
    if(!s.displayName) s.displayName = '';
    if(!s.photoURL)    s.photoURL    = '';
    return s;
  }

  // ── Firestore load ────────────────────────────────────────────
  async function loadState(){
    const uid = window.fbAuth.currentUser?.uid;
    if(!uid){ state = defaultState(); return; }
    try{
      const snap = await window.db.collection('users').doc(uid).get();
      state = snap.exists ? migrateState(snap.data()) : defaultState();
    }catch(e){
      console.error('[HabitShare] Firestore load failed', e);
      state = defaultState();
    }
  }

  // ── Firestore save ────────────────────────────────────────────
  async function saveState(){
    const uid = window.fbAuth.currentUser?.uid;
    if(!uid){ console.warn('[HabitShare] saveState: no user'); return; }
    try{
      await window.db.collection('users').doc(uid).set(state, { merge:true });
    }catch(e){
      console.error('[HabitShare] Firestore save failed', e);
      showToast("Couldn't save — check connection");
    }
  }

  // ── Premium theme ─────────────────────────────────────────────
  function applyPremiumTheme(){
    document.body.classList.toggle('premium', !!state.isPremium);
    // Update streak ring gradient colours
    const stop0 = document.querySelector('#ringGrad stop:first-child');
    const stop1 = document.querySelector('#ringGrad stop:last-child');
    if(stop0 && stop1){
      if(state.isPremium){
        stop0.setAttribute('stop-color','#F59E0B');
        stop1.setAttribute('stop-color','#FBBF24');
      } else {
        stop0.setAttribute('stop-color','#FBBF24');
        stop1.setAttribute('stop-color','#8B5CF6');
      }
    }
  }

  // ── Streak logic ──────────────────────────────────────────────
  function computeStreak(completions){
    const set  = new Set(completions);
    let streak = 0, cursor = new Date();
    if(!set.has(todayStr())) cursor.setDate(cursor.getDate()-1);
    while(set.has(dateStr(cursor))){ streak++; cursor.setDate(cursor.getDate()-1); }
    return streak;
  }

  function nextMilestone(streak){
    for(const m of MILESTONES){ if(streak < m.days) return m; }
    return null;
  }

  // ── Countdown timer ───────────────────────────────────────────
  function renderTimer(){
    const el = $('streak-timer');
    if(!el) return;
    const midnight = new Date(); midnight.setHours(24,0,0,0);
    const ms   = midnight - Date.now();
    const h    = Math.floor(ms / 3_600_000);
    const m    = Math.floor((ms % 3_600_000) / 60_000);
    const done = activeCompletions().includes(todayStr());
    if(done){
      el.innerHTML  = `✅ Done! Next check-in in <b>${h}h ${m}m</b>`;
      el.className  = 'streak-timer streak-timer-done';
    } else if(h < 3){
      el.innerHTML  = `⚠️ Only <b>${h}h ${m}m</b> left — check in now!`;
      el.className  = 'streak-timer streak-timer-urgent';
    } else {
      el.innerHTML  = `⏰ <b>${h}h ${m}m</b> left to check in today`;
      el.className  = 'streak-timer';
    }
  }

  function startTimer(){
    if(timerInterval) clearInterval(timerInterval);
    renderTimer();
    timerInterval = setInterval(renderTimer, 60_000);
  }

  // ── Browser notifications ─────────────────────────────────────
  async function requestNotificationPermission(){
    if(!('Notification' in window))              return false;
    if(Notification.permission === 'granted')    return true;
    if(Notification.permission === 'denied')     return false;
    return (await Notification.requestPermission()) === 'granted';
  }

  let periodicNotificationInterval = null;

  function startPeriodicReminders() {
    if (periodicNotificationInterval) clearInterval(periodicNotificationInterval);
    
    // Check every 30 minutes (1800000 ms)
    periodicNotificationInterval = setInterval(() => {
      triggerPeriodicReminder();
    }, 1800000);
  }

  function triggerPeriodicReminder() {
    const habit = activeHabit();
    if (!habit || !habit.title) return;
    
    // If already done today, don't nudge them!
    if (activeCompletions().includes(todayStr())) return;
    
    if (Notification.permission === 'granted') {
      const title = habit.title.toLowerCase();
      let list = [];
      let prefix = '⏰ Reminder';
      
      if (title.includes('water') || title.includes('drink')) {
        prefix = '💧 Hydration';
        list = [
          "Did you drink today?",
          "Don't forget to drink water!",
          "Water is good for your health!",
          "Your organs need water!",
          "Stay hydrated, stay fresh!",
          "Time for a quick glass of water!",
          "Keep that hydration streak going!"
        ];
      } else if (title.includes('exercise') || title.includes('gym') || title.includes('workout') || title.includes('run')) {
        prefix = '💪 Stay Active';
        list = [
          "Time to move! Did you exercise today?",
          "Exercise boosts your mood, let's get it done!",
          "A short workout is better than no workout!",
          "Stay active, keep healthy!",
          "Your future self will thank you for exercising!"
        ];
      } else if (title.includes('read') || title.includes('book')) {
        prefix = '📖 Reading Time';
        list = [
          "Time to read! Have you opened your book today?",
          "Feed your mind. Don't forget to read today!",
          "Just 10 minutes of reading makes a difference!",
          "Keep learning and growing today!"
        ];
      } else if (title.includes('meditate') || title.includes('breathe') || title.includes('mindful')) {
        prefix = '🧘 Mindfulness';
        list = [
          "Take a deep breath. Have you meditated today?",
          "Clear your mind for a few moments.",
          "Balance and focus. Time to meditate.",
          "Relax and center yourself."
        ];
      } else {
        prefix = '🔥 Habit Tracker';
        list = [
          `Don't forget your habit "${habit.title}" today!`,
          "Consistency is the key to building habits!",
          "Small daily wins build massive results!",
          "Keep your streak alive today!"
        ];
      }
      
      const randomMsg = list[Math.floor(Math.random() * list.length)];
      
      new Notification(`HabitShare ${prefix}`, {
        body: randomMsg,
        icon: 'icons/logo-192.png',
      });
    }
  }

  // Expose test helper to window
  window.triggerNudgeNotification = triggerPeriodicReminder;

  let scheduledTimeouts = [];

  function scheduleReminderNotification(){
    // Clear any existing timeouts to avoid duplicates
    scheduledTimeouts.forEach(t => clearTimeout(t));
    scheduledTimeouts = [];

    const habit = activeHabit();
    if(!habit || !habit.title) return;

    // 5 daily reminder slots
    const reminderSlots = ['09:00', '12:00', '15:00', '18:00', '21:00'];

    reminderSlots.forEach(timeStr => {
      scheduleSlot(timeStr);
    });
  }

  function scheduleSlot(timeStr) {
    const habit = activeHabit();
    if (!habit || !habit.title) return;

    const [rh, rm] = timeStr.split(':').map(Number);
    const trigger = new Date();
    trigger.setHours(rh, rm, 0, 0);

    // If this time has already passed today, schedule it for tomorrow
    if (trigger <= new Date()) {
      trigger.setDate(trigger.getDate() + 1);
    }

    const timeoutDelay = trigger - Date.now();

    const tId = setTimeout(async () => {
      // Check if not completed today yet
      if (Notification.permission === 'granted' && !activeCompletions().includes(todayStr())) {
        const title = habit.title.toLowerCase();
        let list = [];
        let prefix = '⏰ Reminder';

        if (title.includes('water') || title.includes('drink')) {
          prefix = '💧 Hydration Check';
          list = [
            "Your organs need water! Take a quick sip now.",
            "Water is good for your health! Have you had a glass recently?",
            "Did you drink today? Keep that hydration streak going!",
            "Don't forget to drink water! Keep your body feeling fresh.",
            "Keep drinking water, stay focused and energized today!"
          ];
        } else if (title.includes('meditate') || title.includes('breathe') || title.includes('mindful')) {
          prefix = '🧘 Mindfulness';
          list = [
            "Keep meditating! It helps you relax and take the right decisions.",
            "Take a deep breath. Clear your mind for a few moments.",
            "Balance and focus. Have you completed your meditation today?",
            "A quiet mind is a powerful mind. Take time to meditate.",
            "Relax and center yourself. Did you take your mindful break?"
          ];
        } else if (title.includes('exercise') || title.includes('gym') || title.includes('workout') || title.includes('run')) {
          prefix = '💪 Keep Active';
          list = [
            "Keep moving! Active body, active mind. Did you exercise today?",
            "A short workout builds long-term strength. You've got this!",
            "Stay strong! Keep your fitness streak alive today.",
            "Your future self will thank you for getting active today.",
            "Exercise boosts your mood, let's get it done!"
          ];
        } else if (title.includes('read') || title.includes('book')) {
          prefix = '📖 Mind Food';
          list = [
            "Have you read your pages today? Keep learning and growing.",
            "Feed your mind. Don't forget to read today!",
            "Just 10 minutes of reading expands your horizon. Try it now.",
            "Keep reading, keep learning, keep growing!"
          ];
        } else {
          prefix = '🔥 Habit Streak';
          list = [
            `Don't let your streak slip away! Complete "${habit.title}" today.`,
            "Consistency is key. Track your habit to keep moving forward.",
            "A small action today builds a lifetime habit. Let's do it!",
            "Small daily wins build massive results. Keep it up!",
            `Time for your check-in: did you do "${habit.title}" today?`
          ];
        }

        const randomMsg = list[Math.floor(Math.random() * list.length)];

        new Notification(`HabitShare ${prefix}`, {
          body: randomMsg,
          icon: 'icons/logo-192.png',
        });
      }

      // Reschedule this slot for the next day
      scheduleSlot(timeStr);
    }, timeoutDelay);

    scheduledTimeouts.push(tId);
  }

  async function setupNotifications(){
    const granted = await requestNotificationPermission();
    if(granted) {
      scheduleReminderNotification();
      startPeriodicReminders();
    }
  }

  // ── Habit grid builder (reusable) ────────────────────────────
  function buildHabitGrid(gridId, inputId, btnId, onSelect){
    const grid     = $(gridId);
    grid.innerHTML = '';
    HABIT_OPTIONS.forEach(opt => {
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'habit-chip';
      btn.innerHTML = `<span class="emo">${opt.emo}</span><span>${opt.title}</span>`;
      btn.addEventListener('click', () => {
        onSelect(opt);
        $(inputId).value = '';
        [...grid.children].forEach(c => c.classList.remove('selected'));
        btn.classList.add('selected');
        $(btnId).disabled = false;
      });
      grid.appendChild(btn);
    });
  }

  function renderHabitGrid(){
    buildHabitGrid('habit-grid','custom-habit','btn-start', opt => { selectedOption = opt; });
  }

  // ── Onboarding input + btn ────────────────────────────────────
  $('custom-habit').addEventListener('input', e => {
    if(e.target.value.trim()){
      selectedOption = {emo:'✨', title: e.target.value.trim()};
      [...$('habit-grid').children].forEach(c => c.classList.remove('selected'));
      $('btn-start').disabled = false;
    } else if(!document.querySelector('.habit-chip.selected')){
      $('btn-start').disabled = true;
    }
  });

  $('btn-start').addEventListener('click', async () => {
    if(!selectedOption) return;
    state.habits = [{
      id:           'habit-' + Date.now(),
      emo:           selectedOption.emo,
      title:         selectedOption.title,
      note:          '',
      startDate:     todayStr(),
      completions:   [],
      reminderTime:  $('reminder-time').value || '08:00',
    }];
    state.activeHabitIndex = 0;
    state.referralCode     = genReferralCode(selectedOption.title);
    state.onboarded        = true;
    await saveState();
    showDashboard();
  });

  // ── Add-Habit sheet (premium) ─────────────────────────────────
  function openAddHabitSheet(){
    addOption = null;
    $('custom-habit-add').value  = '';
    $('btn-add-habit').disabled  = true;
    $('reminder-time-add').value = '08:00';
    buildHabitGrid('habit-grid-add','custom-habit-add','btn-add-habit', opt => { addOption = opt; });
    openOverlay('overlay-add-habit');
  }

  $('custom-habit-add').addEventListener('input', e => {
    if(e.target.value.trim()){
      addOption = {emo:'✨', title: e.target.value.trim()};
      [...$('habit-grid-add').children].forEach(c => c.classList.remove('selected'));
      $('btn-add-habit').disabled = false;
    } else if(!document.querySelector('#habit-grid-add .habit-chip.selected')){
      $('btn-add-habit').disabled = true;
    }
  });

  $('btn-add-habit').addEventListener('click', async () => {
    if(!addOption) return;
    if(!state.isPremium){ showToast('Upgrade to Premium to track multiple habits'); return; }
    if(state.habits.length >= MAX_PREMIUM_HABITS){ showToast('Maximum 3 habits on Premium plan'); return; }
    const habit = {
      id:           'habit-' + Date.now(),
      emo:           addOption.emo,
      title:         addOption.title,
      note:          '',
      startDate:     todayStr(),
      completions:   [],
      reminderTime:  $('reminder-time-add').value || '08:00',
    };
    state.habits.push(habit);
    state.activeHabitIndex = state.habits.length - 1;
    await saveState();
    closeOverlay('overlay-add-habit');
    renderDashboard();
    showToast(`${habit.emo} ${habit.title} added!`);
  });

  $('close-add-habit').addEventListener('click', () => closeOverlay('overlay-add-habit'));
  $('overlay-add-habit').addEventListener('click', e => { if(e.target.id==='overlay-add-habit') closeOverlay('overlay-add-habit'); });

  // ── Habit tabs (multi-habit switcher) ─────────────────────────
  function renderHabitTabs(){
    const el = $('habit-tabs');
    if(!el) return;
    const multiOrPremium = state.habits.length > 1 || state.isPremium;
    if(!multiOrPremium){ el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = '';
    state.habits.forEach((h, i) => {
      const tab = document.createElement('button');
      tab.className   = 'habit-tab' + (i === state.activeHabitIndex ? ' active' : '');
      tab.textContent = `${h.emo} ${h.title}`;
      tab.addEventListener('click', () => {
        state.activeHabitIndex = i;
        renderDashboard();
      });
      el.appendChild(tab);
    });
    if(state.isPremium && state.habits.length < MAX_PREMIUM_HABITS){
      const addBtn       = document.createElement('button');
      addBtn.className   = 'habit-tab-add';
      addBtn.textContent = '+ Add';
      addBtn.addEventListener('click', openAddHabitSheet);
      el.appendChild(addBtn);
    }
  }

  // ── Dashboard render ──────────────────────────────────────────
  function renderRing(streak){
    const R = 76, C = 2*Math.PI*R;
    const next = nextMilestone(streak);
    const prevThreshold = MILESTONES.reduce((acc,m) => streak>=m.days ? m.days : acc, 0);
    const target   = next ? next.days : Math.max(streak,1);
    const span     = target - prevThreshold || 1;
    const progress = Math.min(1,(streak - prevThreshold)/span);
    const offset   = C*(1-progress);
    $('ring-progress').setAttribute('stroke-dasharray', C.toFixed(1));
    $('ring-progress').style.strokeDashoffset = offset.toFixed(1);
    $('streak-num').textContent  = streak;
    $('milestone-hint').innerHTML = next
      ? `<b>${next.days-streak}</b> day${next.days-streak===1?'':'s'} to ${next.label} ${next.emo}`
      : `You've hit every milestone. Legendary. 💎`;
  }

  function renderCheckinCard(){
    const done = activeCompletions().includes(todayStr());
    const card = $('checkin-card');
    if(done){
      card.innerHTML = `
        <div class="done-banner">✅ Done for today
          <button id="undo-today">Undo</button>
        </div>`;
      $('undo-today').addEventListener('click', async () => {
        activeHabit().completions = activeCompletions().filter(d => d !== todayStr());
        await saveState();
        renderDashboard();
      });
    } else {
      card.innerHTML = `
        <div class="checkin-q">Did you ${activeHabit().title.toLowerCase()} today?</div>
        <div class="checkin-sub">One tap keeps the streak alive.</div>
        <div class="checkin-actions">
          <button class="btn-no" id="btn-no">Not yet</button>
          <button class="btn-yes" id="btn-yes">Yes, done ✓</button>
        </div>`;
      $('btn-yes').addEventListener('click', async () => {
        const comps = activeCompletions();
        if(!comps.includes(todayStr())){
          activeHabit().completions = [...comps, todayStr()];
          state.points += 10;
          const s = computeStreak(activeCompletions());
          if(s > state.bestStreak) state.bestStreak = s;
          
          // Trigger celebration notification
          if(Notification.permission === 'granted'){
            new Notification('HabitShare 🎉 Goal Met!', {
              body: `Awesome! You completed your task today. Your streak is now ${s} days!`,
              icon: 'icons/logo-192.png',
            });
          }
        }
        await saveState();
        renderDashboard();
        showToast('Nice — streak updated 🔥');
      });
      $('btn-no').addEventListener('click', () => showToast("No worries — there's still time today"));
    }
  }

  function renderCalendar(){
    const grid     = $('cal-grid');
    grid.innerHTML = '';
    const set      = new Set(activeCompletions());
    let doneCount  = 0;
    const habit     = activeHabit();
    const startDate = (habit && habit.startDate) ? habit.startDate : todayStr();
    for(let i=29; i>=0; i--){
      const d    = daysAgoStr(i);
      const cell = document.createElement('div');
      const done = set.has(d);
      if(done) doneCount++;
      const isAfterStart = d >= startDate;
      const isMissed     = !done && i > 0 && isAfterStart;
      cell.className   = 'cal-cell' + (done?' done': (isMissed?' missed':'')) + (i===0?' today':'');
      cell.title       = d;
      cell.textContent = done ? '✓' : (isMissed?'✗':'');
      grid.appendChild(cell);
    }
    $('cal-legend').textContent = `${doneCount}/30 days`;
  }

  function renderBadges(){
    const row     = $('badge-row');
    row.innerHTML = '';
    const streak  = computeStreak(activeCompletions());
    const best    = Math.max(state.bestStreak, streak);
    MILESTONES.forEach(m => {
      const unlocked = best >= m.days;
      const el       = document.createElement('div');
      el.className   = 'badge' + (unlocked ? ' unlocked':'');
      el.innerHTML   = `<div class="b-emo">${m.emo}</div><div class="b-label">${m.label}</div>`;
      row.appendChild(el);
    });
  }

  function renderDashboard(){
    const habit  = activeHabit();
    const streak = computeStreak(activeCompletions());
    $('hero-emo').textContent   = habit.emo;
    $('hero-title').textContent = habit.title;
    renderRing(streak);
    renderCheckinCard();
    renderCalendar();
    renderBadges();
    renderHabitTabs();
    startTimer();
    applyPremiumTheme();
    updateTopbarAvatar();
  }

  function showDashboard(){
    $('screen-onboarding').classList.add('hidden');
    $('screen-dashboard').classList.remove('hidden');
    $('btn-profile').classList.remove('hidden');
    renderDashboard();
  }

  // ── Topbar avatar ─────────────────────────────────────────────
  function updateTopbarAvatar(){
    const btn = $('btn-profile');
    if(!btn) return;
    if(state.isPremium && state.photoURL){
      btn.innerHTML    = `<img src="${state.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="avatar">`;
      btn.style.overflow = 'hidden';
      btn.style.padding  = '0';
    } else if(state.isPremium){
      const raw  = state.displayName || window.fbAuth.currentUser?.displayName || '';
      const init = raw ? raw[0].toUpperCase() : '✨';
      btn.innerHTML    = `<span style="font-size:15px;font-weight:700;color:var(--amber-deep)">${init}</span>`;
      btn.style.overflow = '';
      btn.style.padding  = '';
    } else {
      btn.innerHTML    = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>`;
      btn.style.overflow = '';
      btn.style.padding  = '';
    }
  }

  // ── Share card ────────────────────────────────────────────────
  function drawShareCard(){
    const canvas = $('share-canvas');
    const ctx    = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const habit  = activeHabit();
    const streak = computeStreak(activeCompletions());

    const grad = ctx.createLinearGradient(0,0,W,H);
    grad.addColorStop(0,'#201A47'); grad.addColorStop(1,'#15132B');
    ctx.fillStyle = grad; ctx.fillRect(0,0,W,H);

    const rg = ctx.createRadialGradient(W-90,50,10,W-90,50,220);
    rg.addColorStop(0,'rgba(251,191,36,0.35)'); rg.addColorStop(1,'rgba(251,191,36,0)');
    ctx.fillStyle = rg; ctx.fillRect(0,0,W,H);

    ctx.fillStyle='#C9C6EE'; ctx.font='600 16px Inter,sans-serif';
    ctx.fillText('HabitShare', 32, 46);

    ctx.fillStyle='#fff'; ctx.font="700 26px 'Space Grotesk',sans-serif";
    wrapText(ctx, habit.emo+'  '+habit.title, 32, 100, 400, 30);

    ctx.fillStyle='#FBBF24'; ctx.font="700 84px 'Space Grotesk',sans-serif";
    ctx.fillText(String(streak), 32, 210);

    ctx.fillStyle='#C9C6EE'; ctx.font='600 15px Inter,sans-serif';
    ctx.fillText('DAY STREAK', 32, 235);

    ctx.fillStyle='#8D89BE'; ctx.font='500 13px Inter,sans-serif';
    ctx.fillText('Join me — one small habit a day. habitshare.app/'+(state.referralCode||''), 32, 285);

    $('invite-code-share').textContent = state.referralCode || '—';
  }

  function wrapText(ctx, text, x, y, maxWidth, lh){
    const words = text.split(' '); let line='', yy=y;
    for(let n=0; n<words.length; n++){
      const test = line+words[n]+' ';
      if(ctx.measureText(test).width > maxWidth && n>0){ ctx.fillText(line,x,yy); line=words[n]+' '; yy+=lh; }
      else line=test;
    }
    ctx.fillText(line,x,yy);
  }

  // ── Overlays ──────────────────────────────────────────────────
  function openOverlay(id) { $(id).classList.add('open'); }
  function closeOverlay(id){ $(id).classList.remove('open'); }

  $('btn-open-share').addEventListener('click',   () => { drawShareCard(); openOverlay('overlay-share'); });
  $('close-share').addEventListener('click',       () => closeOverlay('overlay-share'));
  $('overlay-share').addEventListener('click',    e  => { if(e.target.id==='overlay-share') closeOverlay('overlay-share'); });

  $('btn-download-card').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'habitshare-streak.png';
    a.href     = $('share-canvas').toDataURL('image/png');
    a.click();
    showToast('Image downloaded');
  });

  $('btn-copy-linkA').addEventListener('click', async () => {
    const streak  = computeStreak(activeCompletions());
    const habit   = activeHabit();
    const caption = `${habit.emo} ${streak}-day streak on ${habit.title} with HabitShare. Join me: habitshare.app/${state.referralCode}`;
    try{ await navigator.clipboard.writeText(caption); showToast('Caption copied'); }
    catch{ showToast("Couldn't copy — select manually"); }
  });

  $('copy-invite-share').addEventListener('click', async () => {
    try{ await navigator.clipboard.writeText(`habitshare.app/${state.referralCode}`); showToast('Invite link copied'); }
    catch{ showToast("Couldn't copy"); }
  });

  // ── Profile ───────────────────────────────────────────────────
  function renderUpgradeCard(){
    const card = document.querySelector('.upgrade-card');
    if(!card) return;
    card.style.background = '';
    card.style.border     = '';

    if(state.isPremium && state.premiumType === 'yearly'){
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="font-size:30px;flex-shrink:0">✨</div>
          <div>
            <div class="ut" style="color:var(--amber-deep);">Premium Active — Yearly</div>
            <div class="us" style="margin-bottom:0;">₹1,001/year · Thank you for supporting HabitShare!</div>
          </div>
        </div>`;
      card.style.background = 'linear-gradient(135deg,#FFF8E1,#FFF3CD)';
      card.style.border     = '1.5px solid var(--amber)';

    } else if(state.isPremium && state.premiumType === 'monthly'){
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div style="font-size:26px">✨</div>
          <div>
            <div class="ut" style="color:var(--indigo-deep);">Premium Active — Monthly</div>
            <div class="us">₹89/month active. Upgrade to Yearly and save even more!</div>
          </div>
        </div>
        <button class="btn-primary" id="btn-upgrade-yearly-cta"
          style="box-shadow:none;font-size:13px;padding:12px;background:linear-gradient(135deg,var(--amber),var(--amber-deep));color:#3B2600;">
          Switch to Yearly · ₹1,001 🔥 Best value
        </button>`;
      card.style.background = 'linear-gradient(135deg,#EEE9FF,#E0E7FF)';
      card.style.border     = '1.5px solid var(--indigo)';
      $('btn-upgrade-yearly-cta')?.addEventListener('click', () => redirectToCheckout('yearly'));

    } else {
      card.innerHTML = `
        <div class="ut">🔓 HabitShare Premium</div>
        <div class="us">Track up to 3 habits, unlock the golden theme, custom profile &amp; more.</div>
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <button class="btn-primary" id="btn-upgrade-monthly"
            style="box-shadow:none;font-size:13px;padding:12px 10px;">
            ₹89&nbsp;/&nbsp;month
          </button>
          <button class="btn-primary" id="btn-upgrade-yearly"
            style="box-shadow:none;font-size:13px;padding:12px 10px;background:linear-gradient(135deg,var(--amber),var(--amber-deep));color:#3B2600;">
            ₹1,001&nbsp;/&nbsp;year 🔥
          </button>
        </div>
        <div class="fine-print" style="margin-top:0;text-align:left;">Secure payment via Razorpay.</div>`;
      $('btn-upgrade-monthly')?.addEventListener('click', () => redirectToCheckout('monthly'));
      $('btn-upgrade-yearly')?.addEventListener('click',  () => redirectToCheckout('yearly'));
    }
  }

  function renderProfile(){
    const streak = computeStreak(activeCompletions());
    $('stat-streak').textContent  = streak;
    $('stat-best').textContent    = Math.max(state.bestStreak, streak);
    $('stat-total').textContent   = activeCompletions().length;
    $('stat-points').textContent  = state.points;
    $('invite-code-profile').textContent = state.referralCode || '—';
    $('reminder-time-2').value    = activeHabit()?.reminderTime || '08:00';
    $('profile-habit-name').textContent  = (activeHabit()?.emo||'') + ' ' + (activeHabit()?.title||'');
    $('profile-email').textContent = window.fbAuth.currentUser?.email || '—';
    const d = new Date(activeHabit()?.startDate || todayStr());
    $('profile-start-date').textContent = d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});

    // Premium avatar section
    const avatarSection = $('profile-avatar-section');
    if(state.isPremium){
      avatarSection.classList.remove('hidden');
      $('display-name-input').value = state.displayName || window.fbAuth.currentUser?.displayName || '';
      const initials = (state.displayName || window.fbAuth.currentUser?.displayName || '?')[0].toUpperCase();
      $('avatar-initials').textContent = initials;
      if(state.photoURL){
        $('avatar-img').src = state.photoURL;
        $('avatar-img').classList.remove('hidden');
        $('avatar-initials').style.display = 'none';
      } else {
        $('avatar-img').classList.add('hidden');
        $('avatar-initials').style.display = '';
      }
    } else {
      avatarSection.classList.add('hidden');
    }

    renderUpgradeCard();
  }

  $('btn-profile').addEventListener('click', () => { renderProfile(); openOverlay('overlay-profile'); });
  $('close-profile').addEventListener('click',     () => closeOverlay('overlay-profile'));
  $('overlay-profile').addEventListener('click',  e  => { if(e.target.id==='overlay-profile') closeOverlay('overlay-profile'); });

  $('copy-invite-profile').addEventListener('click', async () => {
    try{ await navigator.clipboard.writeText(`habitshare.app/${state.referralCode}`); showToast('Invite link copied'); }
    catch{ showToast("Couldn't copy"); }
  });

  $('reminder-time-2').addEventListener('change', async e => {
    if(activeHabit()) activeHabit().reminderTime = e.target.value;
    await saveState();
    showToast('Reminder time saved');
    scheduleReminderNotification();
  });

  // ── Avatar upload (premium) ───────────────────────────────────
  $('avatar-circle').addEventListener('click',     () => { if(state.isPremium) $('avatar-file-input').click(); });
  $('avatar-upload-btn').addEventListener('click', () => $('avatar-file-input').click());

  $('avatar-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = async () => {
        const MAX    = 150, ratio = Math.min(MAX/img.width, MAX/img.height);
        const canvas = document.createElement('canvas');
        canvas.width = img.width*ratio; canvas.height = img.height*ratio;
        canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
        const b64      = canvas.toDataURL('image/jpeg',0.72);
        state.photoURL = b64;
        await saveState();
        $('avatar-img').src = b64;
        $('avatar-img').classList.remove('hidden');
        $('avatar-initials').style.display = 'none';
        updateTopbarAvatar();
        showToast('Profile photo updated! 📸');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // ── Display name (premium) ────────────────────────────────────
  $('save-display-name').addEventListener('click', async () => {
    const name = $('display-name-input').value.trim();
    if(!name){ showToast('Please enter a name'); return; }
    state.displayName = name;
    try{ await window.fbAuth.currentUser?.updateProfile({ displayName: name }); }catch{}
    await saveState();
    updateTopbarAvatar();
    showToast('Name saved! ✅');
  });

  // ── Razorpay Checkout ──────────────────────────────────────────
  async function redirectToCheckout(priceType){
    const user = window.fbAuth.currentUser;
    if(!user){ showToast('Please sign in first'); return; }
    showToast('Opening payment window… ⏳');
    try{
      // 1. Create order on the backend
      const res = await fetch(`${SERVER_URL}/checkout/razorpay-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceType, uid: user.uid, email: user.email || '' }),
      });
      if(!res.ok) throw new Error((await res.json().catch(()=>({}))).error || `Server ${res.status}`);
      
      const orderData = await res.json();
      
      // 2. Open Razorpay Standard Checkout overlay modal
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "HabitShare",
        description: `Upgrade to Premium (${priceType === 'yearly' ? 'Yearly' : 'Monthly'})`,
        image: "icons/logo-192.png",
        order_id: orderData.orderId,
        handler: async function (response) {
          showToast('Verifying payment... ⏳');
          try {
            // 3. Send successful payment details to backend verification endpoint
            const verifyRes = await fetch(`${SERVER_URL}/checkout/razorpay-verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                uid: orderData.uid,
                priceType: orderData.priceType
              })
            });
            if (!verifyRes.ok) throw new Error((await verifyRes.json().catch(()=>({}))).error || `Server ${verifyRes.status}`);
            
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              showToast('Premium Activated! 🎉 Welcome onboard!');
              await loadState();
              renderDashboard();
              closeOverlay('overlay-profile');
            } else {
              showToast('Payment verification failed');
            }
          } catch (verifyErr) {
            console.error('[HabitShare] Verification error:', verifyErr);
            showToast('Verification failed: ' + verifyErr.message);
          }
        },
        prefill: {
          email: user.email || ''
        },
        theme: {
          color: "#8B5CF6" // Indigo branding color
        },
        modal: {
          ondismiss: function () {
            showToast('Payment cancelled');
          }
        }
      };

      const rzp = new Razorpay(options);
      
      // Handle payment failure event
      rzp.on('payment.failed', function (resp) {
        console.error('[HabitShare] Payment failed event:', resp.error);
        showToast('Payment failed: ' + resp.error.description);
      });

      rzp.open();

    } catch (err) {
      console.error('[HabitShare] Razorpay checkout error:', err);
      showToast(err.message.includes('fetch') || err.message.includes('Failed')
        ? '⚠️ Payment server not running. Run: node server/index.js'
        : 'Payment error: ' + err.message);
    }
  }

  // ── Custom confirm modal (replaces window.confirm to avoid ugly domain popups on mobile) ──
  function showConfirm(message, onOk) {
    // Reuse or create the modal
    let modal = document.getElementById('custom-confirm-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'custom-confirm-modal';
      modal.style.cssText = [
        'position:fixed','inset:0','z-index:9999',
        'background:rgba(0,0,0,0.55)','display:flex',
        'align-items:center','justify-content:center','padding:24px'
      ].join(';');
      modal.innerHTML = `
        <div style="background:var(--surface,#fff);border-radius:18px;padding:24px 20px;max-width:320px;width:100%;box-shadow:0 20px 60px -10px rgba(0,0,0,0.4);">
          <p id="ccm-msg" style="font-size:15px;font-weight:600;color:var(--ink,#15132B);margin:0 0 20px;line-height:1.5;text-align:center;"></p>
          <div style="display:flex;gap:10px;">
            <button id="ccm-cancel" style="flex:1;padding:13px;border-radius:12px;border:1.5px solid #ECEAF6;background:transparent;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;color:var(--ink-soft,#6B6B8D);">Cancel</button>
            <button id="ccm-ok" style="flex:1;padding:13px;border-radius:12px;border:none;background:var(--error,#EF4444);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Confirm</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    document.getElementById('ccm-msg').textContent = message;
    modal.style.display = 'flex';
    const hide = () => { modal.style.display = 'none'; };
    document.getElementById('ccm-ok').onclick    = () => { hide(); onOk(); };
    document.getElementById('ccm-cancel').onclick = () => { hide(); };
    modal.onclick = (e) => { if (e.target === modal) hide(); };
  }

  // ── Reset ─────────────────────────────────────────────────────
  $('btn-reset').addEventListener('click', () => {
    showConfirm("Reset your habit and streak history? This can't be undone.", async () => {
      state = defaultState();
      await saveState();
      closeOverlay('overlay-profile');
      $('screen-dashboard').classList.add('hidden');
      $('btn-profile').classList.add('hidden');
      $('screen-onboarding').classList.remove('hidden');
      selectedOption = null;
      $('btn-start').disabled = true;
      $('custom-habit').value = '';
      renderHabitGrid();
      document.body.classList.remove('premium');
      if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
    });
  });

  // ── Sign out ──────────────────────────────────────────────────
  $('btn-signout').addEventListener('click', () => {
    showConfirm('Sign out of HabitShare?', async () => {
      closeOverlay('overlay-profile');
      if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
      await window.fbAuth.signOut();
    });
  });

  // ── Payment return ────────────────────────────────────────────
  function handlePaymentReturn(){
    const params  = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    if(!payment) return;
    window.history.replaceState({}, '', window.location.pathname);
    if(payment === 'success'){
      showToast('🎉 Payment successful! Welcome to Premium!');
      setTimeout(async () => {
        await loadState();
        applyPremiumTheme();
        updateTopbarAvatar();
        renderHabitTabs();
        renderUpgradeCard();
        showToast('✨ Golden theme & multi-habit unlocked!');
      }, 3000);
    } else if(payment === 'cancel'){
      showToast('Payment cancelled — you can upgrade anytime.');
    }
  }

  // ── Init ──────────────────────────────────────────────────────
  window.initApp = async function(user){
    selectedOption = null;
    renderHabitGrid();
    await loadState();
    handlePaymentReturn();
    applyPremiumTheme();
    setupNotifications();
    if(state.onboarded && state.habits.length > 0){
      showDashboard();
    } else {
      $('screen-onboarding').classList.remove('hidden');
      $('screen-dashboard').classList.add('hidden');
      $('btn-profile').classList.add('hidden');
    }
  };

})();
