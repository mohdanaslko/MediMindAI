/* ══════════════════════════════════════════════════════════════
   MediMind — app.js

   HOW TO CONNECT TO YOUR FASTAPI BACKEND
   ───────────────────────────────────────
   1. Start your FastAPI server:
        uvicorn main:app --reload

   2. Change API_BASE below to match your server URL.
      Default is localhost:8000 for local development.

   3. The frontend calls two endpoints:
        GET /symptoms          → loads the symptom list on startup
        GET /predict?symptoms= → Step 1 check (may return fuzzy matches)
        GET /confirm?symptoms= → Step 2 confirm (returns final prediction)

   4. If you just want to run the frontend standalone (demo mode),
      set USE_BACKEND = false and it will use the Claude AI fallback.
══════════════════════════════════════════════════════════════ */

/* ── Configuration ───────────────────────────────────────── */
const API_BASE    = "http://127.0.0.1:8000";   // ← change to your FastAPI URL
const USE_BACKEND = true;                      // ← set false for demo/AI-fallback mode

/* ══════════════════════════════════════════════════════════════
   SYMPTOM LIST
   This is populated automatically from GET /symptoms on load.
   The fallback list below is used when USE_BACKEND = false.
══════════════════════════════════════════════════════════════ */
let SYM_LIST = [
  "itching","skin rash","nodal skin eruptions","continuous sneezing","shivering","chills",
  "joint pain","stomach pain","acidity","ulcers on tongue","muscle wasting","vomiting",
  "burning micturition","spotting urination","fatigue","weight gain","anxiety",
  "cold hands and feets","mood swings","weight loss","restlessness","lethargy",
  "patches in throat","irregular sugar level","cough","high fever","breathlessness",
  "sweating","dehydration","indigestion","headache","yellowish skin","dark urine",
  "nausea","loss of appetite","pain behind the eyes","back pain","constipation",
  "abdominal pain","diarrhoea","mild fever","yellow urine","yellowing of eyes",
  "acute liver failure","fluid overload","swelling of stomach","swelled lymph nodes",
  "malaise","blurred and distorted vision","phlegm","throat irritation","redness of eyes",
  "sinus pressure","runny nose","congestion","chest pain","weakness in limbs",
  "fast heart rate","pain during bowel movements","pain in anal region","bloody stool",
  "irritation in anus","neck pain","dizziness","cramps","bruising","obesity",
  "swollen legs","swollen blood vessels","puffy face and eyes","enlarged thyroid",
  "brittle nails","swollen extremities","excessive hunger","extra marital contacts",
  "drying and tingling lips","slurred speech","knee pain","hip joint pain","muscle weakness",
  "stiff neck","swelling joints","movement stiffness","spinning movements","loss of balance",
  "unsteadiness","weakness of one body side","loss of smell","bladder discomfort",
  "foul smell of urine","continuous feel of urine","passage of gases","internal itching",
  "toxic look (typhos)","depression","irritability","muscle pain","altered sensorium",
  "red spots over body","belly pain","abnormal menstruation","dischromic patches",
  "watering from eyes","increased appetite","polyuria","family history","mucoid sputum",
  "rusty sputum","lack of concentration","visual disturbances","receiving blood transfusion",
  "receiving unsterile injections","coma","stomach bleeding","distention of abdomen",
  "history of alcohol consumption","blood in sputum","prominent veins on calf",
  "palpitations","painful walking","pus filled pimples","blackheads","scurring",
  "skin peeling","silver like dusting","small dents in nails","inflammatory nails",
  "blister","red sore around nose","yellow crust ooze"
];

/* ══════════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════════ */
let addedSymptoms = [];   // Array of { text: string, exact: bool, suggestions: string[] }
let fuzzyMap      = {};   // { original: [suggestions] }   — populated at Step 2
let confirmed     = {};   // { original: chosen | null }   — filled as user clicks pills

/* ══════════════════════════════════════════════════════════════
   INIT — load symptom list from backend on page load
══════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  if (!USE_BACKEND) return;

  fetch(`${API_BASE}/symptoms`)
    .then(r => r.json())
    .then(data => {
      if (data.symptoms && Array.isArray(data.symptoms)) {
        // Replace the fallback list in-place so all references stay valid
        SYM_LIST.splice(0, SYM_LIST.length, ...data.symptoms);
        console.log(`✅ Loaded ${SYM_LIST.length} symptoms from backend.`);
      }
    })
    .catch(() => {
      console.warn("⚠️ Could not load symptoms from backend. Using built-in fallback list.");
    });
});

/* ══════════════════════════════════════════════════════════════
   CLIENT-SIDE FUZZY MATCHING
   Used only for the live dropdown suggestions while typing.
   The backend does its own, more authoritative matching.
══════════════════════════════════════════════════════════════ */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
    for (let j = 1; j <= n; j++) dp[i][j] = i === 0 ? j : 0;
  }
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n];
}

function clientSimilarity(a, b) {
  const dist = levenshtein(a.toLowerCase(), b.toLowerCase());
  return 1 - dist / Math.max(a.length, b.length);
}

/**
 * Returns up to `limit` symptoms from SYM_LIST closest to `input`.
 * Also boosts symptoms whose words start with the query prefix.
 */
function clientFuzzy(input, limit = 5, cutoff = 0.42) {
  const inp = input.toLowerCase().trim();
  return SYM_LIST
    .map(s => {
      const base  = clientSimilarity(inp, s);
      const boost = s.split(" ").some(w =>
        w.startsWith(inp.slice(0, Math.min(4, inp.length)))
      ) ? 0.14 : 0;
      return { s, score: Math.min(1, base + boost) };
    })
    .filter(x => x.score >= cutoff)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.s);
}

/* ══════════════════════════════════════════════════════════════
   DROPDOWN
══════════════════════════════════════════════════════════════ */
const inputEl  = document.getElementById("sym-input");
const dropEl   = document.getElementById("dropdown");

inputEl.addEventListener("input", () => {
  const val = inputEl.value.trim();
  if (val.length < 2) { closeDropdown(); return; }

  // Exact prefix matches shown first, then fuzzy
  const exact  = SYM_LIST.filter(s => s.startsWith(val.toLowerCase())).slice(0, 3);
  const fuzzy  = clientFuzzy(val, 5, 0.46).filter(s => !exact.includes(s)).slice(0, 3);
  const merged = [
    ...exact.map(s => ({ s, type: "exact" })),
    ...fuzzy.map(s => ({ s, type: "close" })),
  ].slice(0, 6);

  if (!merged.length) { closeDropdown(); return; }

  dropEl.innerHTML = merged.map(({ s, type }) => `
    <li class="dropdown-item"
        role="option"
        onclick="selectSuggestion('${s.replace(/'/g, "\\'")}')">
      <span>${highlightMatch(s, val)}</span>
      <span class="match-badge ${type === 'exact' ? 'match-exact' : 'match-close'}">
        ${type === 'exact' ? 'exact' : 'close match'}
      </span>
    </li>
  `).join("");

  dropEl.style.display = "block";
});

inputEl.addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); addSymptom(); }
  if (e.key === "Escape") closeDropdown();
});

document.addEventListener("click", e => {
  if (!dropEl.contains(e.target) && e.target !== inputEl) closeDropdown();
});

function closeDropdown() {
  dropEl.style.display = "none";
}

/** Bold the matched portion of a suggestion label. */
function highlightMatch(str, query) {
  const idx = str.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return str;
  return (
    str.slice(0, idx) +
    `<strong style="font-weight:500;">${str.slice(idx, idx + query.length)}</strong>` +
    str.slice(idx + query.length)
  );
}

function selectSuggestion(sym) {
  inputEl.value = sym;
  closeDropdown();
  addSymptom();
}

/* ══════════════════════════════════════════════════════════════
   ADD / REMOVE SYMPTOMS
══════════════════════════════════════════════════════════════ */
function addSymptom() {
  const val = inputEl.value.trim().toLowerCase();
  if (!val) return;

  // Prevent duplicates
  if (addedSymptoms.find(s => s.text === val)) {
    inputEl.value = "";
    return;
  }

  const isExact     = SYM_LIST.includes(val);
  const suggestions = isExact ? [] : clientFuzzy(val, 5, 0.46);

  addedSymptoms.push({ text: val, exact: isExact, suggestions });
  inputEl.value = "";
  closeDropdown();
  renderTags();
  updateCheckBtn();
}

function removeSymptom(idx) {
  addedSymptoms.splice(idx, 1);
  renderTags();
  updateCheckBtn();
}

function renderTags() {
  const row = document.getElementById("tag-row");
  if (!addedSymptoms.length) {
    row.innerHTML = `<span class="empty-hint">No symptoms added yet.</span>`;
    return;
  }
  row.innerHTML = addedSymptoms.map((s, i) => `
    <span class="tag ${s.exact ? "tag-exact" : "tag-fuzzy"}" role="listitem">
      ${s.text}
      <span class="tag-rm" onclick="removeSymptom(${i})" aria-label="Remove ${s.text}">×</span>
    </span>
  `).join("");
}

function updateCheckBtn() {
  const btn = document.getElementById("check-btn");
  const has = addedSymptoms.length > 0;
  btn.disabled       = !has;
  btn.ariaDisabled   = String(!has);
  btn.className      = has ? "action-btn ready" : "action-btn";
  btn.textContent    = has
    ? `Check ${addedSymptoms.length} symptom${addedSymptoms.length > 1 ? "s" : ""}`
    : "Check symptoms";
}

/* ══════════════════════════════════════════════════════════════
   STEP 1 → call /predict
══════════════════════════════════════════════════════════════ */
function checkSymptoms() {
  const symptomStr = addedSymptoms.map(s => s.text).join(",");

  if (!USE_BACKEND) {
    // Demo mode — classify locally then skip straight to prediction
    const needsConfirm = addedSymptoms.filter(s => !s.exact && s.suggestions.length);
    if (!needsConfirm.length) {
      runPrediction(addedSymptoms.filter(s => s.exact).map(s => s.text));
    } else {
      buildConfirmPhase(
        addedSymptoms.filter(s => s.exact).map(s => s.text),
        needsConfirm,
        addedSymptoms.filter(s => !s.exact && !s.suggestions.length)
      );
    }
    return;
  }

  // Show loading on the button while waiting
  const btn = document.getElementById("check-btn");
  btn.textContent = "Checking…";
  btn.disabled    = true;

  fetch(`${API_BASE}/predict?symptoms=${encodeURIComponent(symptomStr)}`)
    .then(r => r.json())
    .then(data => {
      btn.disabled = false;

      if (data.status === "predicted") {
        // All exact — show result immediately
        setStep(3);
        showPhase("phase-result");
        showResult(data, data.matched_symptoms || []);

      } else if (data.status === "confirmation_required") {
        // Backend found fuzzy matches — show confirm phase
        const needsConfirm = (data.confirmation_needed || []).map(c => ({
          text:        c.you_entered,
          exact:       false,
          suggestions: c.did_you_mean,
        }));
        buildConfirmPhase(
          data.exact_matched || [],
          needsConfirm,
          data.not_found    || []
        );

      } else if (data.status === "no_match") {
        showPhase("phase-result");
        showError("None of the symptoms you entered were recognised. Please try different terms.");

      } else {
        showPhase("phase-result");
        showError(data.message || "An unexpected error occurred.");
      }
    })
    .catch(() => {
      btn.disabled    = false;
      btn.textContent = `Check ${addedSymptoms.length} symptom${addedSymptoms.length > 1 ? "s" : ""}`;
      showPhase("phase-result");
      showError("Could not reach the API server. Make sure FastAPI is running on " + API_BASE);
    });
}

/* ══════════════════════════════════════════════════════════════
   BUILD PHASE 2 — CONFIRM CARDS
══════════════════════════════════════════════════════════════ */
function buildConfirmPhase(exactList, needsConfirmList, notFoundList) {
  fuzzyMap  = {};
  confirmed = {};

  needsConfirmList.forEach(s => { fuzzyMap[s.text] = s.suggestions; });

  const cards = document.getElementById("confirm-cards");
  cards.innerHTML = needsConfirmList.map((s, idx) => `
    <div class="confirm-card" id="cc-${idx}">
      <div class="confirm-card-head">
        <div class="warn-icon" aria-hidden="true">!</div>
        <p class="confirm-entered">
          You typed <strong>"${s.text}"</strong> — did you mean:
        </p>
      </div>
      <div class="confirm-card-body">
        <div class="opts-row" id="opts-${idx}" role="group" aria-label="Options for ${s.text}">
          ${s.suggestions.map(opt => `
            <button class="opt-btn"
              onclick="selectOption('${s.text.replace(/'/g,"\\'")}',
                                    '${opt.replace(/'/g,"\\'")}',
                                    this, ${idx})">
              ${opt}
            </button>
          `).join("")}
          <button class="none-btn"
            onclick="selectNone('${s.text.replace(/'/g,"\\'")}', this, ${idx})">
            None of these
          </button>
        </div>
      </div>
    </div>
  `).join("");

  if (notFoundList.length) {
    const names = notFoundList.map(s =>
      typeof s === "string" ? s : s.text
    ).join(", ");
    cards.innerHTML += `
      <p class="no-match-note">
        These couldn't be matched and will be skipped:
        <strong style="font-weight:500;">${names}</strong>
      </p>`;
  }

  // Store exact list so /confirm can include them
  cards.dataset.exactList = JSON.stringify(exactList);

  setStep(2);
  showPhase("phase-confirm");
  updateConfirmBtn();
}

/* ══════════════════════════════════════════════════════════════
   CONFIRMATION HELPERS
══════════════════════════════════════════════════════════════ */
function selectOption(original, choice, btn, cardIdx) {
  const row = document.getElementById(`opts-${cardIdx}`);
  row.querySelectorAll(".opt-btn, .none-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  confirmed[original] = choice;
  updateConfirmBtn();
}

function selectNone(original, btn, cardIdx) {
  const row = document.getElementById(`opts-${cardIdx}`);
  row.querySelectorAll(".opt-btn, .none-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  confirmed[original] = null;   // null = skipped
  updateConfirmBtn();
}

function updateConfirmBtn() {
  const total = Object.keys(fuzzyMap).length;
  const done  = Object.keys(confirmed).length;
  const btn   = document.getElementById("confirm-btn");
  const prog  = document.getElementById("confirm-progress");

  prog.innerHTML = `Confirmed <span>${done}</span> of <span>${total}</span>`;

  const allDone   = done >= total;
  btn.disabled    = !allDone;
  btn.ariaDisabled = String(!allDone);
  btn.className   = allDone ? "action-btn ready" : "action-btn";
  btn.textContent = allDone
    ? "Predict disease →"
    : `Confirm all symptoms (${done}/${total})`;
}

/* ══════════════════════════════════════════════════════════════
   STEP 2 → call /confirm (or AI fallback)
══════════════════════════════════════════════════════════════ */
function runPrediction(directSymptoms) {
  // Build final symptom list:
  //   directSymptoms  — passed in when all exact (skips confirm phase)
  //   OR exact list stored in cards.dataset + user-confirmed fuzzy choices
  let finalSymptoms;

  if (directSymptoms) {
    finalSymptoms = directSymptoms;
  } else {
    const stored  = JSON.parse(document.getElementById("confirm-cards").dataset.exactList || "[]");
    const choices = Object.values(confirmed).filter(Boolean);
    finalSymptoms = [...stored, ...choices];
  }

  setStep(3);
  showPhase("phase-result");
  document.getElementById("result-body").innerHTML = `
    <div class="loading-wrap">
      <div class="spinner"></div>
      <p class="loading-text">Analyzing your symptoms…</p>
    </div>`;

  if (USE_BACKEND) {
    callBackendConfirm(finalSymptoms);
  } else {
    callAIFallback(finalSymptoms);
  }
}

/* ── Option A: FastAPI /confirm ───────────────────────────── */
function callBackendConfirm(finalSymptoms) {
  fetch(`${API_BASE}/confirm?symptoms=${encodeURIComponent(finalSymptoms.join(","))}`)
    .then(r => r.json())
    .then(data => {
      if (data.status === "predicted") {
        showResult(data, data.confirmed_symptoms || finalSymptoms);
      } else {
        showError(data.message || "Prediction failed. Please try again.");
      }
    })
    .catch(() =>
      showError("Could not reach the API server. Make sure FastAPI is running on " + API_BASE)
    );
}

/* ── Option B: Claude AI fallback (demo / no-backend mode) ── */
function callAIFallback(finalSymptoms) {
  const prompt = `A patient reports these symptoms: ${finalSymptoms.join(", ")}.
List the top 3 most likely diseases ranked by probability.
Reply ONLY with a valid JSON object — no markdown, no extra text:
{
  "top_predictions": [
    {"disease":"<name>","confidence":<0-100>,"description":"<2-sentence description>","precautions":["<step 1>","<step 2>","<step 3>"]},
    {"disease":"<name>","confidence":<0-100>,"description":"<2-sentence description>","precautions":["<step 1>","<step 2>","<step 3>"]},
    {"disease":"<name>","confidence":<0-100>,"description":"<2-sentence description>","precautions":["<step 1>","<step 2>","<step 3>"]}
  ]
}`;

  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 900,
      messages: [{ role: "user", content: prompt }],
    }),
  })
    .then(r => r.json())
    .then(data => {
      const raw = data.content.map(c => c.text || "").join("").replace(/```json|```/g, "").trim();
      try {
        showResult(JSON.parse(raw), finalSymptoms);
      } catch {
        showError("Could not parse the AI response. Please try again.");
      }
    })
    .catch(() => showError("Network error during AI prediction. Please try again."));
}

/* ══════════════════════════════════════════════════════════════
   RENDER RESULT
══════════════════════════════════════════════════════════════ */
function showResult(data, symptoms) {
  markStepDone(3);

  // Normalise: backend now sends top_predictions array,
  // but keep backward-compat with old single-disease shape
  const predictions = data.top_predictions || [{
    disease:     data.disease,
    confidence:  100,
    description: data.description,
    precautions: data.precautions || [],
  }];

  const rankLabels  = ["🥇 Most Likely", "🥈 2nd Likely", "🥉 3rd Likely"];
  const rankClasses = ["rank-1", "rank-2", "rank-3"];

  document.getElementById("result-body").innerHTML = `
    <div class="result-card">

      <p class="result-eyebrow">Top predicted conditions</p>

      ${predictions.map((pred, i) => `
        <div class="pred-block ${rankClasses[i] || ''}">
          <div class="pred-header">
            <span class="pred-rank">${rankLabels[i] || `#${i+1}`}</span>
            <span class="pred-disease">${pred.disease}</span>
            <span class="pred-confidence">${pred.confidence}%</span>
          </div>

          <div class="confidence-bar-wrap">
            <div class="confidence-bar-fill"
                 style="width:${pred.confidence}%">
            </div>
          </div>

          <p class="pred-description">${pred.description}</p>

          ${pred.precautions && pred.precautions.length ? `
            <p class="section-title" style="margin-top:12px;">Precautions</p>
            <div class="prec-list">
              ${pred.precautions.map((p, j) => `
                <div class="prec-item">
                  <div class="prec-num">${j + 1}</div>
                  <span>${p}</span>
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>

        ${i < predictions.length - 1 ? '<hr class="result-divider">' : ""}
      `).join("")}

      <hr class="result-divider">

      <p class="section-title">Symptoms used</p>
      <div class="used-symptoms-row">
        ${symptoms.map(s => `<span class="used-sym-tag">${s}</span>`).join("")}
      </div>

      <div class="disclaimer" role="note">
        <span class="disclaimer-icon" aria-hidden="true">⚠</span>
        <span>
          This is not a medical diagnosis. Always consult a qualified healthcare
          professional for proper evaluation and treatment.
        </span>
      </div>

    </div>`;
}

function showError(msg) {
  document.getElementById("result-body").innerHTML = `
    <div class="error-box" role="alert">${msg}</div>`;
}

/* ══════════════════════════════════════════════════════════════
   STEP INDICATOR HELPERS
══════════════════════════════════════════════════════════════ */
function setStep(n) {
  [1, 2, 3].forEach(i => {
    const num = document.getElementById(`s${i}`);
    const lbl = document.getElementById(`sl${i}`);
    if (i < n) {
      num.className = "step-num done";
      num.innerHTML = "✓";
      lbl.className = "step-text";
    } else if (i === n) {
      num.className  = "step-num active";
      num.innerHTML  = `<span>${i}</span>`;
      num.setAttribute("aria-current", "step");
      lbl.className  = "step-text active";
    } else {
      num.className = "step-num pending";
      num.innerHTML = `<span>${i}</span>`;
      num.removeAttribute("aria-current");
      lbl.className = "step-text";
    }
  });
}

function markStepDone(n) {
  const num = document.getElementById(`s${n}`);
  num.className = "step-num done";
  num.innerHTML = "✓";
  num.removeAttribute("aria-current");
  document.getElementById(`sl${n}`).className = "step-text";
}

/* ══════════════════════════════════════════════════════════════
   PHASE SWITCHING
══════════════════════════════════════════════════════════════ */
function showPhase(id) {
  ["phase-input", "phase-confirm", "phase-result"].forEach(p => {
    document.getElementById(p).style.display = p === id ? "block" : "none";
  });
}

/* ══════════════════════════════════════════════════════════════
   BACK BUTTON (Phase 2 → Phase 1)
══════════════════════════════════════════════════════════════ */
function goBackToInput() {
  fuzzyMap  = {};
  confirmed = {};
  setStep(1);
  showPhase("phase-input");
}

/* ══════════════════════════════════════════════════════════════
   FULL RESET
══════════════════════════════════════════════════════════════ */
function reset() {
  addedSymptoms = [];
  fuzzyMap      = {};
  confirmed     = {};

  renderTags();
  updateCheckBtn();
  setStep(1);
  showPhase("phase-input");

  inputEl.value = "";
  document.getElementById("result-body").innerHTML = "";
}
