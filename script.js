/* =========================
   Cyber Learning Pro — script.js (fixed)
   ========================= */

/* ---------- Utils ---------- */
async function readFileAsBase64(file) {
  const buf = await file.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return b64;
}

async function extractText(file) {
  const base64 = await readFileAsBase64(file);
  const res = await fetch('/api/extract-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, base64 })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'extract failed');
  return data.text || '';
}

async function generateQuestions(text, n, difficulty, apiKeyOpt) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKeyOpt && apiKeyOpt.startsWith('sk-')) headers['x-api-key'] = apiKeyOpt;

  const res = await fetch('/api/generate-questions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ text, numQuestions: n, difficulty })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'generate failed');
  return data.questions;
}

/* ---------- App ---------- */
(function () {
  /* Theme */
  const sel = document.getElementById('themeSel');
  const applyTheme = (m) => {
    const r = document.documentElement;
    if (m === 'light') r.classList.add('light');
    else r.classList.remove('light');
    localStorage.setItem('clp_theme', m);
  };
  const savedTheme = localStorage.getItem('clp_theme') || 'dark';
  if (sel) sel.value = savedTheme;
  applyTheme(savedTheme);
  if (sel) sel.onchange = () => applyTheme(sel.value);

  /* Elements */
  const apiKeyInp   = document.getElementById('apiKey');
  const clearKeyBtn = document.getElementById('clearKey');
  const fileInput   = document.getElementById('fileInput');
  const manualText  = document.getElementById('manualText');
  const difficulty  = document.getElementById('difficulty');
  const numQ        = document.getElementById('numQ');
  const timeLimit   = document.getElementById('timeLimit');
  const makeBtn     = document.getElementById('makeBtn');
  const statusEl    = document.getElementById('status');

  const quizCard     = document.getElementById('quizCard');
  const questionZone = document.getElementById('questionZone');
  const quizTitle    = document.getElementById('quizTitle');
  const nextBtn      = document.getElementById('nextBtn');
  const skipBtn      = document.getElementById('skipBtn');
  const finishBtn    = document.getElementById('finishBtn');
  const feedback     = document.getElementById('feedback');

  /* Quiz state */
  let questions = [];
  let idx = 0, score = 0, wrongTopics = [];
  let busy = false;

  /* ---------- API Key storage (safe) ---------- */
  const KEY_STORAGE = 'clp_openai';

  function loadStoredKey() {
    try {
      const k = localStorage.getItem(KEY_STORAGE) || '';
      if (k && apiKeyInp) {
        // לא מציגים טקסט דמה בשדה כדי לא לשבור ולידציה
        apiKeyInp.value = '';
        apiKeyInp.placeholder = 'מפתח שמור מקומית';
        apiKeyInp.dataset.hasStored = '1';
      }
      return k;
    } catch { return ''; }
  }

  function clearStoredKey() {
    try {
      localStorage.removeItem(KEY_STORAGE);
      if (apiKeyInp) {
        apiKeyInp.value = '';
        apiKeyInp.placeholder = '...sk-';
        delete apiKeyInp.dataset.hasStored;
      }
    } catch {}
  }

  function resolveApiKeyFromUI() {
    let key = (apiKeyInp?.value || '').trim();
    const stored = loadStoredKey(); // לא מזיק אם נקרא שוב
    if (key.startsWith('sk-')) {
      // נשמור לשימוש עתידי
      try { localStorage.setItem(KEY_STORAGE, key); } catch {}
    } else {
      key = stored;
    }
    return key;
  }

  /* Init key UI */
  loadStoredKey();
  clearKeyBtn?.addEventListener('click', clearStoredKey);

  /* ---------- Quiz flow ---------- */
  function setStatus(msg) { if (statusEl) statusEl.textContent = msg || ''; }
  function lockUI(lock)  { makeBtn && (makeBtn.disabled = !!lock); busy = !!lock; }

  makeBtn.onclick = async () => {
    if (busy) return;
    lockUI(true);
    try {
      let key = resolveApiKeyFromUI();
      // אם אין מפתח כלל – ניתן להמשיך: ה-API בצד שרת ישתמש ב-ENV.
      // אם אתה רוצה לחייב מפתח: בטל את שתי השורות הבאות
      if (!key) key = ''; 

      setStatus('מכין תוכן...');
      let text = (manualText?.value || '').trim();

      const f = fileInput?.files?.[0];
      if (f) {
        setStatus('מחלץ טקסט מהקובץ...');
        const ext = f.name.toLowerCase().split('.').pop();
        if (ext === 'txt') text = (await f.text()) + '\n' + text;
        else if (ext === 'pdf' || ext === 'docx') text = (await extractText(f)) + '\n' + text;
        else { alert('סוג קובץ לא נתמך: ' + ext); lockUI(false); return; }
      }

      if (!text || text.length < 60) {
        alert('נדרש טקסט בסיסי (לפחות כמה משפטים).');
        lockUI(false);
        return;
      }

      setStatus('יוצר שאלות בעזרת GPT-4o...');
      const n = parseInt(numQ?.value || '8', 10);
      const diff = difficulty?.value || 'בינוני';

      questions = await generateQuestions(text.slice(0, 40000), n, diff, key);
      if (!Array.isArray(questions) || !questions.length) throw new Error('לא התקבלו שאלות');

      idx = 0; score = 0; wrongTopics = [];
      if (quizCard) quizCard.style.display = 'block';
      if (feedback) feedback.innerHTML = '';
      renderQuestion();
      if (quizCard) window.scrollTo({ top: quizCard.offsetTop - 20, behavior: 'smooth' });
      setStatus('');
    } catch (e) {
      console.error(e);
      setStatus('שגיאה: ' + (e?.message || ''));
    } finally {
      lockUI(false);
    }
  };

  function renderQuestion() {
    const q = questions[idx];
    if (!q) return;
    if (quizTitle) quizTitle.textContent = `שאלה ${idx + 1} מתוך ${questions.length}`;
    if (questionZone) {
      questionZone.innerHTML = `
        <div style="font-weight:800;margin-bottom:8px">${q.q}</div>
        <div class="options">
          ${q.options.map((opt, i) =>
            `<div class="option">
               <label><input type="radio" name="opt" value="${i}"> ${['א','ב','ג','ד'][i]}) ${opt}</label>
             </div>`
          ).join('')}
        </div>`;
    }
  }

  nextBtn && (nextBtn.onclick = () => {
    const sel = document.querySelector('input[name="opt"]:checked');
    if (!sel) { alert('בחר/י תשובה'); return; }
    const choice = parseInt(sel.value, 10);
    const q = questions[idx];
    const ok = choice === q.answer;

    if (feedback) {
      feedback.innerHTML = ok
        ? `<div style="color:var(--ok);font-weight:700">✅ נכון</div><div>${q.explanation || ''}</div>`
        : `<div style="color:var(--bad);font-weight:700">❌ לא נכון</div>
           <div>תשובה נכונה: ${['א','ב','ג','ד'][q.answer]} — ${q.options[q.answer]}</div>
           <div>${q.explanation || ''}</div>`;
    }

    if (ok) score++; else wrongTopics.push(q.topic || 'כללי');

    setTimeout(() => {
      idx++;
      if (feedback) feedback.innerHTML = '';
      if (idx >= questions.length) finish();
      else renderQuestion();
    }, 900);
  });

  skipBtn && (skipBtn.onclick = () => {
    idx++;
    if (idx >= questions.length) finish();
    else { if (feedback) feedback.innerHTML = ''; renderQuestion(); }
  });

  finishBtn && (finishBtn.onclick = finish);

  function finish() {
    const payload = { score, total: questions.length, wrongTopics, questions };
    try { localStorage.setItem('clp_results', JSON.stringify(payload)); } catch {}
    window.location.href = './results.html';
  }
})();
