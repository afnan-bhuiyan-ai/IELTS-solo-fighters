/**
 * app.js
 * ======
 * IELTS Solo Fighters — main application logic
 * Author: Afnan Ahmed Bhuiyan
 *
 * Sections:
 *  1. Imports & state
 *  2. Auth (login, signup, Google, logout)
 *  3. Tab navigation
 *  4. Overview tab
 *  5. 14-Week Plan tab
 *  6. Modules tab
 *  7. Vocab tab
 *  8. Study Log tab (calendar + log entries + checklist)
 *  9. Modals (task detail, add log, vocab detail)
 * 10. Firebase data sync helpers
 * 11. Init
 */

// import { auth, db, provider } from './firebase-config.js';
import { auth, db, provider } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc,
  collection, addDoc, getDocs, deleteDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =============================================
   1. STATE
   ============================================= */
let currentUser   = null;
let userData      = {};       // cached Firestore profile
let vocabWords    = [];       // all user vocab
let logEntries    = [];       // practice log entries
let studiedDays   = new Set();  // YYYY-MM-DD strings
let checkedTasks  = new Set();  // taskId strings
let checkedItems  = new Set();  // daily checklist ids
let calMonth      = new Date(); // currently displayed calendar month
let currentVocabFilter = 'all';
let currentVocabModalWord = null; // for delete

/* =============================================
   2. AUTH
   ============================================= */
window.switchAuthTab = (tab) => {
  document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
  document.getElementById('form-signup').classList.toggle('hidden', tab !== 'signup');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
};

window.handleLogin = async (e) => {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    errEl.textContent = friendlyAuthError(err.code);
  }
};

window.handleSignup = async (e) => {
  e.preventDefault();
  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const target   = document.getElementById('signup-target').value;
  const errEl    = document.getElementById('signup-error');
  errEl.textContent = '';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    // Save user profile to Firestore
    await setDoc(doc(db, 'users', cred.user.uid), {
      name, email, target, createdAt: new Date().toISOString()
    });
  } catch (err) {
    errEl.textContent = friendlyAuthError(err.code);
  }
};

window.handleGoogleLogin = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user   = result.user;
    // Create profile doc if new
    const ref  = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        name: user.displayName || 'Fighter',
        email: user.email,
        target: '7.5',
        createdAt: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error('Google login error:', err);
  }
};

window.handleLogout = async () => {
  await signOut(auth);
};

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':       'No account with that email. Try signing up.',
    'auth/wrong-password':       'Incorrect password. Please try again.',
    'auth/email-already-in-use': 'That email is already registered. Sign in instead.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/too-many-requests':    'Too many attempts. Wait a moment and try again.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed. Please try again.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// Auth state listener — the heart of the app
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await loadUserData();
    showApp();
  } else {
    currentUser = null;
    showAuth();
  }
});

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('app-screen').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  initApp();
}

/* =============================================
   3. TAB NAVIGATION
   ============================================= */
window.switchTab = (tabId) => {
  // Hide all pages, deactivate all tabs
  document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.bottom-tab').forEach(t => t.classList.remove('active'));
  // Show selected
  document.getElementById('tab-' + tabId).classList.add('active');
  document.getElementById('btab-' + tabId).classList.add('active');

  // Lazy-init tabs
  if (tabId === 'overview')  renderOverviewStats();
  if (tabId === 'plan')      renderWeeks();
  if (tabId === 'modules')   renderModule('listening');
  if (tabId === 'vocab')     renderVocabList();
  if (tabId === 'log')       renderCalendar();
};

/* =============================================
   4. OVERVIEW
   ============================================= */
function renderOverviewStats() {
  const name = currentUser?.displayName || 'Fighter';
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  document.getElementById('hero-greeting').textContent = `${greet}, ${name}! 👊`;

  const target = userData.target || '8.0';
  document.getElementById('hero-target').textContent = 'Band ' + target;

  // Weeks remaining (count from signup or today)
  document.getElementById('hero-weeks').textContent = '14 weeks';
  document.getElementById('user-greeting').textContent = `Hi, ${name.split(' ')[0]}`;

  // Stats
  document.getElementById('stat-days').textContent  = studiedDays.size;
  document.getElementById('stat-vocab').textContent  = vocabWords.length;
  document.getElementById('stat-tasks').textContent  = checkedTasks.size;
  document.getElementById('stat-streak').textContent = calcStreak();

  // Ring progress: tasks done / total tasks (280 tasks across 14 weeks)
  const totalTasks = WEEKS_DATA.reduce((sum, w) => sum + w.tasks.length, 0);
  const pct = totalTasks > 0 ? Math.round((checkedTasks.size / totalTasks) * 100) : 0;
  document.getElementById('ring-pct').textContent = pct + '%';
  const circumference = 201;
  const offset = circumference - (pct / 100) * circumference;
  document.getElementById('ring-progress').style.strokeDashoffset = offset;
}

function calcStreak() {
  // Count consecutive days studied ending today
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dateKey(d);
    if (studiedDays.has(key)) streak++;
    else break;
  }
  return streak;
}

/* =============================================
   5. 14-WEEK PLAN
   ============================================= */
// Data: 14 weeks with tasks and how-to instructions
const WEEKS_DATA = [
  {
    w: 1, phase: 1,
    focus: "Diagnostic & orientation",
    tasks: [
      {
        id: 't1-1',
        text: "Take a full mock test (all 4 modules)",
        why: "You need a baseline score to know exactly which modules to prioritize. Without this, you're studying blind.",
        steps: [
          "Download Cambridge IELTS Book 1 or 13 from a library or buy it (~$20). These are the gold-standard practice tests.",
          "Set a timer: Listening 40min → Reading 60min → Writing 60min → Speaking 15min. Do NOT stop the timer.",
          "Mark your answers using the answer key at the back of the book.",
          "Write down your score for each module separately. This is your starting point."
        ],
        resource: "Cambridge IELTS books 1–18 | Free practice: britishcouncil.org/exam/ielts/preparation"
      },
      {
        id: 't1-2',
        text: "Identify your weakest module from the mock",
        why: "Your weakest module is where you'll gain the most points the fastest. Target it first.",
        steps: [
          "Compare your 4 module scores. Which is lowest?",
          "Note the question types you got wrong within that module.",
          "Write this down: 'My weakest module is ___ because I struggle with ___'.",
          "This week's extra 20 min/day goes to that module."
        ],
        resource: "Band score calculator: ielts.org/ielts-test/academic/how-is-ielts-scored"
      },
      {
        id: 't1-3',
        text: "Learn all Listening question types",
        why: "Band 8–9 scorers know every question type before starting — they never waste time figuring out what to do during the test.",
        steps: [
          "Go to E2 IELTS on YouTube. Watch the 'Listening Overview' video (15 min).",
          "Write down the 6 types: multiple choice, completion, matching, labelling, map/diagram, short answer.",
          "For each type, write one sentence: 'For completion questions, I will ___'.",
          "Do 1 short practice section (10 questions) to test your understanding."
        ],
        resource: "E2 IELTS YouTube: youtube.com/@E2IELTS | ieltsliz.com/ielts-listening-lessons"
      },
      {
        id: 't1-4',
        text: "Learn all Reading question types",
        why: "Knowing what question types expect from you changes how you read. Many students lose marks not from poor English, but from misunderstanding question instructions.",
        steps: [
          "Watch IELTS Simon's Reading overview on YouTube (search 'IELTS Simon Reading Overview').",
          "Note the 8 types: T/F/NG, Y/N/NG, matching headings, matching information, MC, short answer, sentence completion, list selection.",
          "The most misunderstood: TRUE vs NOT GIVEN. Write in your notes: NOT GIVEN = the passage doesn't mention it (not that it's wrong).",
          "Practice 1 T/F/NG passage today."
        ],
        resource: "IELTS Simon: ielts-simon.com | ieltsliz.com/ielts-reading-lessons"
      },
    ]
  },
  {
    w: 2, phase: 1,
    focus: "Reading & Listening foundations",
    tasks: [
      {
        id: 't2-1',
        text: "Daily T/F/NG practice — 20 questions each day",
        why: "T/F/NG and Y/N/NG are the most commonly missed question types. Daily repetition trains your brain to think in 'Is this stated? Is this not stated?'",
        steps: [
          "Open a Cambridge IELTS book or ieltsliz.com. Find a T/F/NG passage.",
          "Read the questions FIRST. For each statement, ask: 'Does the passage say this directly?'",
          "TRUE = passage states this directly. FALSE = passage contradicts this. NOT GIVEN = passage doesn't mention it.",
          "Check your answers. For every wrong answer, read why it's right. This review step doubles your improvement."
        ],
        resource: "ieltsliz.com/ielts-reading-practice-true-false-not-given"
      },
      {
        id: 't2-2',
        text: "Skimming & scanning drills on 2 news articles",
        why: "Top Reading scorers skim for main ideas and scan for specific words. They never read every word — that wastes precious time.",
        steps: [
          "Pick any Guardian or BBC article (guardian.com or bbc.com/news).",
          "SKIM: Read only the first sentence of each paragraph. Write 1 sentence: 'This article is about ___'.",
          "SCAN: Write 3 keywords from a made-up 'question' (e.g. 'date', 'country', 'percentage'). Find them without reading everything.",
          "Time yourself: aim to answer 5 fake comprehension questions in under 4 minutes."
        ],
        resource: "The Guardian: theguardian.com | BBC: bbc.com/news"
      },
      {
        id: 't2-3',
        text: "Full Listening test + transcript review",
        why: "Reviewing the transcript after every listening test is the #1 listening improvement technique. You discover exactly what you missed and why.",
        steps: [
          "Do a full Cambridge listening test (40 questions, 30 minutes). Listen ONCE — no replays.",
          "Mark your answers. Note your score.",
          "Read the transcript while listening to the audio again. Circle every answer you missed.",
          "For each missed answer, ask: was it a distractor? Spelling error? Missed word? Write it down."
        ],
        resource: "Cambridge IELTS listening audio downloads come with the book. Transcripts are at the back."
      },
      {
        id: 't2-4',
        text: "Add 10 academic words to your Vocab Tracker daily",
        why: "B2→C1 vocabulary transition is the single biggest factor for jumping from Band 6.5 to Band 7.5+. 10 words/day = 140 words this month alone.",
        steps: [
          "Go to the Vocab tab in this app. Click '+ Add word'.",
          "Start with words from the built-in starter list in the Vocab tab.",
          "For each word, write: the word, meaning in simple English, and one example sentence.",
          "Tomorrow morning, review yesterday's 10 words before adding new ones."
        ],
        resource: "Academic Word List: victoria.ac.nz/lals/resources/awl"
      },
    ]
  },
  {
    w: 3, phase: 1,
    focus: "Writing Task 2 structure",
    tasks: [
      {
        id: 't3-1',
        text: "Learn the 4 Writing Task 2 essay types",
        why: "Different question types need different essay structures. Using the wrong structure can drop your score by 1–2 bands on Task Achievement.",
        steps: [
          "The 4 types are: Opinion (Agree/Disagree) · Discussion (Both views) · Problem-Solution · Advantage-Disadvantage.",
          "Watch IELTS Liz's 'Task 2 question types' video on YouTube.",
          "For each type, memorize the template: Intro structure → Body para 1 focus → Body para 2 focus → Conclusion.",
          "Print or write out one template per type and keep it visible when you study."
        ],
        resource: "ieltsliz.com/ielts-writing-task-2 | IELTS Advantage: ieltsadvantage.com/writing-task-2"
      },
      {
        id: 't3-2',
        text: "Write 2 full Task 2 essays (timed, 40 min each)",
        why: "The only way to improve writing is by writing. Two timed essays this week trains both your structure AND your time management.",
        steps: [
          "Set a timer for 40 minutes. Do NOT go over.",
          "First 5 minutes: READ the question carefully. Identify the type. Plan: thesis + 2 body points.",
          "Next 30 minutes: Write intro (3-4 sentences) + body para 1 (5-6 sentences) + body para 2 (5-6 sentences) + conclusion (2-3 sentences).",
          "Last 5 minutes: Proofread. Check for grammar errors, word repetition, unclear sentences."
        ],
        resource: "Essay prompts: ieltsadvantage.com/ielts-writing-task-2-questions"
      },
      {
        id: 't3-3',
        text: "Study 3 Band 9 model essays and analyze structure",
        why: "Seeing what Band 9 looks like tells you exactly where you're falling short. Analyze, don't just read.",
        steps: [
          "Go to ieltsliz.com/ielts-sample-essay and read 3 essays.",
          "For each essay, highlight: intro (thesis), body para topic sentences, linking words, advanced vocabulary used.",
          "Count the linking words (Moreover, However, As a result...). Good essays use 3–5 different ones.",
          "Write down 5 vocabulary words from these essays you want to use in your own writing."
        ],
        resource: "ieltsliz.com/ielts-sample-essay | ieltspodcast.com/writing-task-2/band-9-essay"
      },
      {
        id: 't3-4',
        text: "Grammar focus: complex sentences and passive voice",
        why: "Grammatical Range & Accuracy is 25% of your Writing score. Using only simple sentences caps you at Band 6.",
        steps: [
          "Complex sentence = main clause + subordinate clause. Example: 'Although technology improves lives, it also creates dependency.'",
          "Write 10 complex sentences using: although, while, despite, because of, which, who, unless, if.",
          "Passive voice: 'The government introduced the policy' → 'The policy was introduced by the government'.",
          "Rewrite 5 simple sentences in your essays from this week using passive voice where it improves flow."
        ],
        resource: "British Council grammar: learnenglish.britishcouncil.org/grammar"
      },
    ]
  },
  {
    w: 4, phase: 1,
    focus: "Speaking & Writing Task 1",
    tasks: [
      {
        id: 't4-1',
        text: "Learn Writing Task 1 (Academic): chart/graph description",
        why: "Task 1 is worth 33% of your Writing score. Most students neglect it and lose easy marks.",
        steps: [
          "Task 1 rule: DESCRIBE, never give opinions. Just report what the data shows.",
          "Structure: Introduction (paraphrase the chart title) → Overview (2 main trends) → Detail para 1 → Detail para 2.",
          "Key language: 'peaked at', 'declined sharply', 'remained stable', 'accounted for', 'a significant proportion'.",
          "Write one Task 1 response today (20 minutes, minimum 150 words)."
        ],
        resource: "ieltsliz.com/ielts-writing-task-1 | ielts-simon.com/ielts-help-and-english-pr/ielts-writing-task-1"
      },
      {
        id: 't4-2',
        text: "Record a 2-min Speaking Part 2 response",
        why: "Recording yourself is the most underused IELTS strategy. You can't hear your own mistakes in real time. Recording forces you to hear them.",
        steps: [
          "Pick a Part 2 topic card (Google 'IELTS Speaking Part 2 topics' and pick any card).",
          "Use 1 minute to make notes: Who/What/Where/When/Why/How.",
          "Record yourself on your phone. Speak for exactly 2 minutes.",
          "Listen back. Note: Did you stop early? Use 'um/uh' a lot? Repeat words? Speak too fast or slow?"
        ],
        resource: "IELTS Speaking topics: ieltsliz.com/ielts-speaking | E2 IELTS Speaking on YouTube"
      },
      {
        id: 't4-3',
        text: "Watch 4 E2 IELTS Speaking sample videos",
        why: "Watching real responses calibrates your brain to what Band 7–9 speaking sounds like. Most students underestimate fluency requirements.",
        steps: [
          "Go to YouTube → search 'E2 IELTS Speaking Band 7' and 'E2 IELTS Speaking Band 9'.",
          "Watch 2 Band 7 responses and 2 Band 9 responses.",
          "For Band 9: note what vocabulary they use, how they extend answers, their pacing.",
          "Write down 5 phrases you want to steal for your own speaking practice."
        ],
        resource: "E2 IELTS YouTube: youtube.com/@E2IELTS"
      },
      {
        id: 't4-4',
        text: "Practice paraphrasing Task 2 question prompts",
        why: "Your first sentence in every Task 2 essay should paraphrase the question. This immediately signals vocabulary range to the examiner.",
        steps: [
          "Take 5 Task 2 questions from ieltsadvantage.com.",
          "For each, rewrite the question in your own words WITHOUT using the same words.",
          "Example: 'Many people believe that social media has a negative effect on society.' → 'It is widely argued that platforms such as social networking sites are detrimental to communities.'",
          "The trick: replace nouns with synonyms, change sentence structure, use academic tone."
        ],
        resource: "Synonyms for IELTS: magoosh.com/ielts/advanced-vocabulary-for-ielts-writing-task-2"
      },
    ]
  },
  {
    w: 5, phase: 2,
    focus: "Listening deep practice",
    tasks: [
      { id: 't5-1', text: "2 full Listening tests per day", why: "Volume is critical in Phase 2. Two tests/day means 80 questions daily — your brain quickly learns to track complex conversations.", steps: ["Morning: Cambridge test. Evening: British Council or E2 IELTS test.", "Always listen ONCE only — simulate exam conditions.", "Review transcripts after EVERY test.", "Track your score daily. You should see improvement after 1 week."], resource: "Cambridge IELTS books | britishcouncil.org/exam/ielts/preparation" },
      { id: 't5-2', text: "Record 10 new phrases per listening section", why: "The best listening learners don't just do tests — they collect useful phrases they hear and actively use them.", steps: ["During transcript review, highlight 10 phrases (3–5 words each) per section.", "Write them in your notebook: the phrase + what context it appeared in.", "Examples: 'in the vicinity of', 'subject to change', 'regardless of'.", "Review all collected phrases every Sunday."], resource: "Keep a dedicated 'phrase journal' — physical notebook works better than digital for retention." },
      { id: 't5-3', text: "Accent exposure: BBC Radio and Australian podcasts", why: "IELTS uses British, Australian, NZ and American accents. Most students only practice with one. This is a silent mark-killer.", steps: ["BBC Sounds app: listen to any BBC Radio 4 programme for 20 min.", "For Australian accent: 'This Australian Life' or ABC News Australia on YouTube.", "Focus on vowel differences: British 'bath' vs Australian 'bath'. Write 3 differences you notice.", "After 1 week, you will find Listening tests significantly easier."], resource: "BBC Sounds app | ABC Australia: abc.net.au/news" },
      { id: 't5-4', text: "Identify your distractor patterns", why: "IELTS speakers intentionally say the wrong answer first, then correct it. If you don't know this, you'll keep getting tricked.", steps: ["In your next listening test, put a star next to every question where the speaker 'changed' the answer.", "Common distractor patterns: 'I was thinking Tuesday, but actually Wednesday works better' (answer = Wednesday).", "Rule: the LAST thing said is usually the answer. Train yourself to wait for the final answer.", "Track how many distractors you fall for per test. Aim for 0 by Week 7."], resource: "E2 IELTS 'Listening Distractors' video on YouTube" },
    ]
  },
  {
    w: 6, phase: 2,
    focus: "Reading speed & accuracy",
    tasks: [
      { id: 't6-1', text: "Speed drill: finish 40 questions in 60 min", why: "Most students run out of time in Reading. If you can't do 40 questions in 55 minutes in practice, you'll struggle in the exam.", steps: ["Take a full Cambridge reading test.", "Set a timer for 20 minutes per passage (60 min total).", "If you're stuck on a question for 2 min, mark your best guess and move on. Never sacrifice time for one question.", "Track: which passage took longest? That's your weakness to drill."], resource: "Cambridge IELTS books 10–18 (latest books = closest to actual exam difficulty)" },
      { id: 't6-2', text: "Matching Headings practice (hardest question type)", why: "Matching Headings has the lowest accuracy rate in IELTS. Most students try to match by keywords — that's wrong. Match by main idea.", steps: ["Rule: Read the heading, then read ONLY the first and last sentence of each paragraph.", "The heading matches the MAIN IDEA of the paragraph, not just a keyword found in it.", "Watch 'IELTS Reading Matching Headings' by IELTS Simon on YouTube.", "Do 2 full Matching Headings exercises today."], resource: "ielts-simon.com — Matching Headings lessons" },
      { id: 't6-3', text: "Synonyms drill: replace 10 words in a passage", why: "In IELTS Reading, the passage and the question NEVER use the same words. Training synonym recognition is essential.", steps: ["Take a paragraph from a Cambridge reading passage.", "Highlight 10 content words (nouns, verbs, adjectives).", "Find a synonym for each using a thesaurus (thesaurus.com).", "Now create 'questions' where your synonym is used and the passage uses the original word. Practice finding the answer."], resource: "Thesaurus: thesaurus.com | Power Thesaurus: powerthesaurus.org" },
      { id: 't6-4', text: "Read 2 Economist or Guardian articles and note paraphrasing", why: "Reading academic material daily builds the passive vocabulary and sentence structure awareness needed for Band 7.5+.", steps: ["Read one Economist article (economist.com) and one Guardian opinion piece.", "As you read, circle any word you don't know. Look it up. Add it to your Vocab Tracker.", "Find one sentence per article that uses academic tone. Rewrite it in simpler English to check understanding.", "Aim for 30 minutes of this reading daily through all of Phase 2."], resource: "The Economist: economist.com/free | The Guardian: theguardian.com/commentisfree" },
    ]
  },
  {
    w: 7, phase: 2,
    focus: "Writing Task 2 advanced",
    tasks: [
      { id: 't7-1', text: "Write 2 timed Task 2 essays under 40 min each", why: "By Week 7, your essays should be getting faster and more structured. Timed practice with review is the only way to measure improvement.", steps: ["Pick prompts from different question types (one Opinion, one Discussion this week).", "Plan for 5 minutes: write your thesis and 2-3 key points. Never skip planning.", "Write: intro (3-4 sentences) + 2 body paras (6-7 sentences each) + conclusion (2-3 sentences).", "After writing, count your words. Should be 270–280 words. Over 300 wastes time. Under 250 loses marks."], resource: "ieltsadvantage.com/writing-task-2/questions for prompts" },
      { id: 't7-2', text: "Learn and use 10 academic collocations in writing", why: "Collocations (word combinations that naturally go together) are what separate Band 6 essays from Band 8 essays.", steps: ["Key collocations: 'fundamental reason', 'significant impact', 'alleviate poverty', 'advocate for change', 'mitigate the effects', 'address the issue', 'substantial evidence', 'raise awareness', 'pose a threat', 'foster development'.", "Write one sentence using each collocation.", "In your next essay, intentionally use at least 5 of these collocations naturally.", "Add them to your Vocab Tracker with an example sentence."], resource: "Collocation dictionary: ozdic.com" },
      { id: 't7-3', text: "Linking words advanced usage practice", why: "Coherence & Cohesion is 25% of your Writing score. Using only 'However' and 'Moreover' repeatedly signals limited range.", steps: ["Advanced linkers to learn this week: 'Despite this', 'Notwithstanding', 'In light of this', 'That said', 'Consequently', 'It follows that', 'In this regard', 'By the same token'.", "Write one sentence using each linker in a paragraph on any topic.", "Review your last 2 essays: highlight every linking word. Are you using at least 6 different ones?", "Swap out any repeated linkers with new ones from the list above."], resource: "ieltsliz.com/cohesive-devices — comprehensive linker list" },
      { id: 't7-4', text: "Proofread someone else's IELTS essay", why: "Spotting errors in others' writing trains your eye to spot the same errors in your own. This is a professional editing technique.", steps: ["Find a Band 6 sample essay on ieltsliz.com (she grades them and explains why).", "Read the essay and highlight every grammar error, repetition, and unclear argument you find.", "Compare your findings to Liz's analysis below the essay.", "Now reread your own essays with the same critical eye."], resource: "ieltsliz.com/ielts-writing-task-2-samples-with-answers" },
    ]
  },
  {
    w: 8, phase: 2,
    focus: "Speaking fluency",
    tasks: [
      { id: 't8-1', text: "Daily 10-min speaking recording + filler word review", why: "Fluency & Coherence is 25% of your Speaking score. Every 'um', 'uh', 'like', 'you know' drags your score down.", steps: ["Every day: answer one Part 1, one Part 2, one Part 3 question. Record yourself.", "Listen back. Count filler words. Write the number down. Goal: under 5 per minute.", "Replace fillers with pauses. A 1-second pause sounds more confident than 'um'.", "Track your filler count daily. Within 2 weeks it should drop by 50%."], resource: "IELTS Speaking Part 1/2/3 question banks: ielts-simon.com/ielts-speaking" },
      { id: 't8-2', text: "Speaking Part 3: abstract answers with 3-part structure", why: "Part 3 is where Band 7–9 candidates separate themselves. Examiners want complex ideas, not simple yes/no answers.", steps: ["3-part structure: Opinion + Reason + Example. Always use all three.", "Example question: 'Do you think governments should control the internet?'", "Answer: 'I believe governments should impose some regulation on the internet [OPINION]. The reason is that unrestricted access can lead to the spread of harmful misinformation [REASON]. For instance, false information during elections has had documented impacts on voting behavior in multiple countries [EXAMPLE].'", "Practice 5 Part 3 questions today using this structure."], resource: "Part 3 topics: ieltsliz.com/ielts-speaking-part-3" },
      { id: 't8-3', text: "Find a speaking partner on HelloTalk or italki", why: "Real conversations build real fluency. Talking to yourself in recordings is good, but a real partner adds challenge and spontaneity.", steps: ["Download HelloTalk (free) or sign up on italki.com.", "On HelloTalk: set your native language to Bengali, learning English. Find English-native speakers who want to learn a language you know.", "Or on italki: book a community tutor (cheaper than professional teachers, ~$5–10/hour).", "Do at least 2 conversation sessions this week. Focus on speaking without stopping."], resource: "HelloTalk: hellotalk.com | italki: italki.com" },
      { id: 't8-4', text: "Learn 10 Speaking-specific connectors", why: "Using connectors smoothly in speaking (not robotically) signals Lexical Resource and Fluency to the examiner.", steps: ["Spoken connectors (natural, not written-English): 'The way I see it', 'What I mean by that is', 'Building on that point', 'Having said that', 'Interestingly', 'What's more', 'In other words', 'At the end of the day', 'Broadly speaking', 'To put it another way'.", "Practice saying each connector out loud 5 times until it feels natural.", "Record one Part 3 answer using at least 4 of these connectors.", "They should flow naturally — not sound memorized."], resource: "IELTS speaking phrases: ieltsliz.com/ielts-speaking-vocabulary" },
    ]
  },
  {
    w: 9, phase: 2,
    focus: "Full mock test #2 + gap analysis",
    tasks: [
      { id: 't9-1', text: "Full mock test #2 under exam conditions", why: "Your second mock test measures how much you've improved and reveals which strategies are working — and which aren't.", steps: ["Use a Cambridge IELTS book you haven't opened yet.", "Replicate exam conditions exactly: quiet room, no phone, timer, no replays on listening.", "Complete all 4 modules in order: Listening (40min) → Reading (60min) → Writing (60min) → Speaking (15min).", "Do NOT check answers during the test."], resource: "Cambridge IELTS 16 or 17 recommended for this test" },
      { id: 't9-2', text: "Compare scores: Mock 1 vs Mock 2", why: "Progress tracking is how top scorers stay motivated and strategic. If you didn't improve, you need to change your approach — not just study more.", steps: ["Score all 4 modules. Write: 'Week 1: L=___ R=___ W=___ S=___  |  Week 9: L=___ R=___ W=___ S=___'", "Which module improved most? Which didn't improve? That's your Phase 3 target.", "Listening and Reading scores should have improved most by now.", "If Writing/Speaking haven't improved, increase feedback loops (speaking partner, essay review)."], resource: "IELTS band descriptor charts: ielts.org/ielts-test/academic/how-is-ielts-scored" },
      { id: 't9-3', text: "Drill your weakest question type from Mock 2", why: "Don't spread your effort evenly. Attack your weakest point with targeted practice.", steps: ["From your Mock 2 analysis: which question types had the most errors?", "For that question type only: do 30 practice questions this week (not full tests).", "Review every wrong answer. Write the rule you violated.", "After 30 questions, your accuracy on that type should visibly improve."], resource: "Question-type specific practice: ieltsliz.com/ielts-reading-lessons (by question type)" },
      { id: 't9-4', text: "Vocabulary focus: collocations over isolated words", why: "At B2→C1 transition, isolated vocabulary memorization stops working. Collocations are how fluent speakers actually think.", steps: ["From your vocab list: pick 20 words. For each, find 2 collocations (word + common partner).", "Example: instead of just 'alleviate', learn 'alleviate poverty', 'alleviate symptoms', 'measures to alleviate'.", "Use ozdic.com — type any word and see its most common collocations in academic writing.", "Add the collocations (not just the words) to your Vocab Tracker."], resource: "Collocation dictionary: ozdic.com | Collocations for IELTS: magoosh.com/ielts" },
    ]
  },
  {
    w: 10, phase: 2,
    focus: "Writing Task 1 mastery",
    tasks: [
      { id: 't10-1', text: "Practice all 5 Task 1 types: bar, line, pie, process, map", why: "Different Task 1 types need different language. Process diagrams and maps have totally different vocabulary from line charts.", steps: ["Bar/line charts: use trend language — 'peaked at', 'declined steadily', 'fluctuated between'.", "Pie charts: use proportion language — 'accounted for', 'represented', 'the majority of'.", "Process diagrams: use passive voice — 'the material is heated', 'water is filtered'.", "Maps: use location language — 'to the north of', 'adjacent to', 'was replaced by'.", "Write one of each type this week."], resource: "Task 1 language: ieltsliz.com/ielts-writing-task-1" },
      { id: 't10-2', text: "Write Task 1 in exactly 20 minutes", why: "Task 1 is only 33% of your Writing score, but students often spend 30+ minutes on it, robbing Task 2 time. 20 minutes is the hard limit.", steps: ["Set a timer for 20 minutes. When it rings, STOP.", "In your 20 minutes: 1 min read + 2 min overview + 15 min write + 2 min proofread.", "The overview paragraph is the highest-value part. Write it first: 'Overall, it is clear that ___'.", "Target: 150–175 words. Under 150 loses marks. Over 180 wastes time."], resource: "Task 1 writing models: ielts-simon.com/ielts-writing-task-1" },
      { id: 't10-3', text: "Learn the 'overview paragraph' technique", why: "Most students skip or write a weak overview. The overview is the single most important paragraph in Task 1 — it addresses the examiner's 'what's the main message?' question.", steps: ["The overview summarizes the 2 BIGGEST trends — not specific data points.", "Place it as paragraph 2 (after intro). Never at the end.", "Good overview example: 'Overall, it is evident that Country A consistently outperformed Country B throughout the period, while both countries showed a general upward trend.'", "Write 5 overview paragraphs for 5 different charts this week."], resource: "Overview technique: ieltsliz.com/ielts-writing-task-1-overview-paragraph" },
      { id: 't10-4', text: "No opinions in Task 1 — practice the rule", why: "Adding opinions to Task 1 is a guaranteed mark deduction. Examiners mark Task Response, and opinions violate the task requirement.", steps: ["Wrong: 'This increase in pollution is very concerning and governments must act.' (opinion!)", "Right: 'The data illustrates a significant rise in pollution levels between 2010 and 2020.'", "Review your Task 1 essays from the past weeks. Highlight any sentence starting with 'I think', 'It is good/bad', 'Governments should'.", "Delete or rewrite every opinion sentence you find."], resource: "Task 1 academic language: ieltsliz.com/ielts-academic-writing-task-1-lesson-1" },
    ]
  },
  {
    w: 11, phase: 3,
    focus: "Mock test #3 + Speaking intensive",
    tasks: [
      { id: 't11-1', text: "Full mock test #3 under exam conditions", why: "Phase 3 is about performing, not learning. Each full mock test builds the mental endurance needed to stay focused for a 3-hour exam.", steps: ["Use a Cambridge book you haven't touched yet. Same conditions as always.", "This time: after Writing, take a 10-minute break before Speaking (as you would in the real exam).", "Score all 4 modules. Compare to Mock 1 and Mock 2.", "Write your projected band score for each module."], resource: "Cambridge IELTS 17 or 18 (most recent = closest to current exam)" },
      { id: 't11-2', text: "Record Speaking Parts 1, 2 & 3 — analyze pronunciation", why: "Pronunciation is 25% of Speaking score. Many students overlook it because they focus only on vocabulary and grammar.", steps: ["Record yourself doing a full speaking test (Parts 1, 2, and 3 — about 15 minutes).", "Listen specifically for: word stress errors (comPUter not COMputer), intonation (rising for questions?), linking sounds between words.", "Common Bengali-speaker errors: 'th' sounds, final consonants, 'v' vs 'b'.", "Pick 3 specific words you mispronounced. Practice them 20 times until correct."], resource: "Pronunciation guide: pronuncian.com | BBC Learning English pronunciation: bbc.co.uk/learningenglish/english/features/pronunciation" },
      { id: 't11-3', text: "Fix your top 3 recurring grammar errors", why: "Everyone has specific grammar patterns they repeat in errors. Fixing 3 patterns in Week 11 eliminates them before the exam.", steps: ["Look at your Writing essays from Weeks 3–10. What errors appear repeatedly?", "Common errors: subject-verb agreement, article usage (a/an/the), prepositions (in/at/on), tense consistency.", "For each error, write the rule. Then write 10 correct sentences using that rule.", "In your next essay, actively focus on not making those 3 errors."], resource: "Grammar rules: learnenglish.britishcouncil.org/grammar" },
      { id: 't11-4', text: "Vocabulary revision: 200 words from your tracker", why: "By Week 11, you should have 500+ words in your tracker. Reviewing ensures they move from short-term to long-term memory.", steps: ["Go to your Vocab Tracker in this app. Filter by each category.", "For each word, quiz yourself: cover the meaning and try to recall it from just the word.", "Words you can recall immediately: ✓ (keep, reduce review frequency).", "Words you struggle with: put them on a sticky note on your desk for daily exposure."], resource: "Your Vocab Tracker in this app" },
    ]
  },
  {
    w: 12, phase: 3,
    focus: "Refinement and consolidation",
    tasks: [
      { id: 't12-1', text: "Target your weakest module only (focused drills)", why: "In the final phase, spread effort is the enemy. Every hour spent on your strong module is an hour not spent improving your weakest.", steps: ["Identify your weakest module from Mock 3 scores.", "Spend 60% of study time this week on that module only.", "Use targeted question-type drills, not full tests.", "Track your improvement daily on that specific question type."], resource: "Your Study Log in this app shows your weakest module trends" },
      { id: 't12-2', text: "Write 1 Task 1 + 1 Task 2 under exam conditions", why: "Writing under exam conditions (no internet, no dictionary, no stopping) builds the cognitive stamina needed on test day.", steps: ["No phone, no dictionary. Just pen, paper, and a timer.", "Task 1: exactly 20 minutes. Task 2: exactly 40 minutes.", "After writing, read it aloud. Does it flow? Is the argument clear?", "Get feedback: post to r/IELTS on Reddit, or share with a tutor."], resource: "r/IELTS Reddit for peer feedback: reddit.com/r/IELTS" },
      { id: 't12-3', text: "Do NOT learn new strategies — consolidate existing ones", why: "Learning new strategies in the final phase creates confusion and undermines confidence. You know what works. Now execute it consistently.", steps: ["If you're tempted to watch a new IELTS video: only watch it if it's about a strategy you already know but want to sharpen.", "Review your notes from Weeks 1–10. What strategies did you plan to use but forget?", "Write a one-page 'exam day strategy sheet' for each module.", "This sheet should list your 3 key strategies per module, nothing more."], resource: "Your notes from this app + your own study notes" },
      { id: 't12-4', text: "Speaking: record yourself answering 20 Part 3 questions", why: "Part 3 is spontaneous. 20 questions forces you to respond to topics you haven't prepared for — which is exactly what the exam does.", steps: ["Find a list of 20 Part 3 questions (ieltsliz.com or ielts-simon.com).", "Record yourself answering each. Do not stop to think for more than 5 seconds.", "Use the 3-part structure: Opinion + Reason + Example.", "Listen back to at least 5 answers. Fix any that were under 30 seconds."], resource: "Part 3 question banks: ieltsliz.com/ielts-speaking-part-3" },
    ]
  },
  {
    w: 13, phase: 3,
    focus: "Final mock test + error correction",
    tasks: [
      { id: 't13-1', text: "Full mock test #4 — simulate exam day exactly", why: "This is your dress rehearsal. Every detail matters: the timing, the break, the sitting position, the anxiety management.", steps: ["Wake up at the same time you will on exam day.", "Eat what you'll eat on exam day.", "Go to a quiet room. Sit at a desk. No phone in the room.", "Complete all 4 modules with exactly the same timing as the real exam."], resource: "Cambridge IELTS 18 (the most current available)" },
      { id: 't13-2', text: "Review every wrong answer and write the reason why", why: "Understanding WHY you got something wrong (distractor? misread? vocabulary gap?) prevents the same error on exam day.", steps: ["For Listening: categorize wrong answers: distractor, spelling, missed word, vocabulary.", "For Reading: categorize: skim too fast, synonym not recognized, T/F/NG confusion.", "For Writing: categorize: grammar, vocabulary, task response, coherence.", "For each wrong answer category, write a 1-line rule to prevent it."], resource: "Error analysis sheet — keep in your notebook for exam day review" },
      { id: 't13-3', text: "Speaking: answer 20 Part 3 questions back-to-back", why: "Endurance practice. The exam speaking section lasts 15 minutes — you need to stay sharp for the full duration.", steps: ["Set a timer. Go through 20 Part 3 questions without stopping.", "For each: aim for 45–90 seconds. Use the Opinion + Reason + Example structure.", "After all 20: which topics did you struggle with most? Practice those 5 again.", "You should feel comfortable with any topic by now."], resource: "ielts-simon.com/ielts-speaking — large bank of Part 3 questions" },
      { id: 't13-4', text: "200-word final vocabulary review flash session", why: "The last week before the exam is not for learning new words — it's for making sure your existing vocabulary is instantly retrievable.", steps: ["Go to your Vocab Tracker. Filter by all categories.", "Go through every word. If you can recall the meaning instantly: skip it.", "If you hesitate: write the word + meaning on a sticky note. Put it on your desk.", "Spend 15 minutes each day reading these sticky notes until exam day."], resource: "Your Vocab Tracker in this app" },
    ]
  },
  {
    w: 14, phase: 3,
    focus: "Exam week — light prep only",
    tasks: [
      { id: 't14-1', text: "Light listening practice only — 30 min max", why: "Your brain needs rest to perform. Heavy studying in exam week causes fatigue and anxiety, not improvement.", steps: ["One light listening session: 1 section only (10 questions), not a full test.", "Review the transcript if you miss any answers.", "Do NOT start any new Cambridge books or new practice materials.", "Just maintain your listening ear, don't train it."], resource: "Avoid heavy study materials this week" },
      { id: 't14-2', text: "Review your best 2 Task 2 essays for confidence", why: "Reviewing your best work right before the exam boosts confidence and reminds you of the strategies you execute well.", steps: ["Find your 2 best-scored Task 2 essays from Phase 2 or 3.", "Read them slowly. Notice what you did well: structure, vocabulary, linking words.", "Make a mental note: 'I am capable of writing like this on exam day.'", "Do NOT rewrite them. Just read and absorb the quality."], resource: "Your essays from Phase 2 (Weeks 5–10)" },
      { id: 't14-3', text: "Prepare exam documents and logistics", why: "Exam day logistics stress is real and wastes cognitive energy. Sort everything 2 days early.", steps: ["Check your IELTS confirmation email. Note the exact time, location, and what ID to bring.", "Charge your phone. Get your ID ready (passport or NID).", "Plan your route. If the test center is far, do a practice journey.", "Prepare what you'll eat and drink. Avoid heavy meals. Stay hydrated."], resource: "Your IELTS booking confirmation email" },
      { id: 't14-4', text: "Trust your preparation — rest and sleep well", why: "Sleep is the most underrated exam performance factor. A well-rested brain retrieves vocabulary faster, processes listening better, and writes more coherently.", steps: ["Aim for 7–8 hours of sleep every night this week.", "Light review only: read your exam strategy sheet (1 page per module, 10 minutes).", "On exam day morning: eat, drink water, arrive 20 minutes early.", "When you sit down: breathe slowly. You've put in 14 weeks. Trust it."], resource: "You've got this. ✦" },
    ]
  },
];

window.filterPhase = (phase, btn) => {
  document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.week-card').forEach(card => {
    if (phase === 'all' || parseInt(card.dataset.phase) === phase) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
};

function renderWeeks() {
  const container = document.getElementById('weeks-container');
  if (container.childElementCount > 0) return; // already rendered

  WEEKS_DATA.forEach(week => {
    const card = document.createElement('div');
    card.className = 'week-card';
    card.dataset.phase = week.phase;
    card.dataset.week  = week.w;

    const phaseLabel = ['', 'Phase 1', 'Phase 2', 'Phase 3'][week.phase];
    const phaseDot   = ['', '🔵', '🟢', '🟠'][week.phase];

    card.innerHTML = `
      <div class="week-header" onclick="toggleWeek(this)">
        <div>
          <div class="week-num">${phaseDot} ${phaseLabel} · Week ${week.w}</div>
          <div class="week-focus">${week.focus}</div>
        </div>
        <span class="week-chevron">▾</span>
      </div>
      <div class="week-tasks">
        <ul class="task-list" id="tasklist-w${week.w}"></ul>
      </div>
    `;

    container.appendChild(card);

    const ul = card.querySelector('.task-list');
    week.tasks.forEach(task => {
      const li = document.createElement('li');
      li.className = 'task-item' + (checkedTasks.has(task.id) ? ' done' : '');
      li.dataset.id = task.id;
      li.innerHTML = `
        <div class="task-checkbox">${checkedTasks.has(task.id) ? '✓' : ''}</div>
        <span class="task-text">${task.text}</span>
        <span class="task-hint-icon" title="Tap to see how to do this">ℹ</span>
      `;
      // Click: left side toggles check, right side opens modal
      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('task-hint-icon')) {
          openTaskModal(task);
        } else {
          toggleTask(li, task.id);
        }
      });
      ul.appendChild(li);
    });
  });
}

window.toggleWeek = (header) => {
  header.parentElement.classList.toggle('open');
};

function toggleTask(li, taskId) {
  const isDone = li.classList.contains('done');
  if (isDone) {
    li.classList.remove('done');
    li.querySelector('.task-checkbox').textContent = '';
    checkedTasks.delete(taskId);
  } else {
    li.classList.add('done');
    li.querySelector('.task-checkbox').textContent = '✓';
    checkedTasks.add(taskId);
  }
  saveCheckedTasks();
  renderOverviewStats();
}

/* =============================================
   6. MODULES TAB
   ============================================= */
const MODULES = {
  listening: {
    emoji: '🎧',
    title: 'Listening',
    subtitle: 'Easiest module to improve quickly with daily practice',
    strategies: [
      { title: 'Read questions BEFORE the audio starts', body: 'You get 30–45 seconds before each section. Use every second to read the questions, underline keywords, and predict what type of answer is coming (number? name? date? place?).' },
      { title: 'Predict the answer type', body: 'If the blank says "Date of birth: ___", the answer is a date. If it says "Number of ___", it\'s a number. Prediction means you listen for specific information, not everything.' },
      { title: 'Watch for distractors', body: 'IELTS speakers often say the wrong answer first, then correct it. Example: "I was thinking Monday — actually Tuesday works better." The answer is Tuesday. Train yourself to wait for the final answer.' },
      { title: 'Follow word limits strictly', body: '"No more than two words" means exactly that. Writing 3 words = wrong, even if the meaning is correct. Practise underlining the word limit instruction at the start of every section.' },
      { title: 'Review transcripts after every test', body: 'After every listening test, read the full transcript while replaying the audio. Circle every wrong answer and ask: was it a distractor, a spelling error, a missed word, or a vocabulary gap?' },
      { title: 'Expose yourself to multiple accents daily', body: 'IELTS uses British, Australian, NZ, and American accents. Listen to BBC Radio 4 (British), ABC Australia (Australian), and NPR (American) for 20 minutes daily.' },
    ],
    mistakes: [
      { label: 'Writing the first thing you hear', bad: 'Hearing "Monday" → writing Monday immediately', good: 'Waiting for the speaker to confirm the final answer before writing' },
      { label: 'Ignoring word limits', bad: 'Writing "a yellow bicycle" when the limit is 2 words (answer: yellow bicycle)', good: 'Always checking "No more than ___ words" and counting your answer' },
      { label: 'Falling behind on the question sheet', bad: 'Losing track of which question you\'re on and missing the next answer', good: 'Tracking questions physically with your pencil as you listen' },
      { label: 'Skipping the pre-listening reading time', bad: 'Waiting for audio to start instead of reading ahead', good: 'Using every second of preview time to read, predict, and prepare' },
    ]
  },
  reading: {
    emoji: '📖',
    title: 'Reading',
    subtitle: 'Not a reading test — an information-finding test',
    strategies: [
      { title: 'Read questions FIRST, passage second', body: 'Never read the passage from start to finish first. Read all questions for the passage, then scan the passage for answers. This is how Band 9 scorers work.' },
      { title: 'Skim for structure, scan for answers', body: 'SKIM: Read the first sentence of each paragraph to understand the passage structure (30 seconds). SCAN: Look for specific keywords, capital letters, numbers, and italics to find answers quickly.' },
      { title: 'True/False/Not Given — know the difference', body: 'TRUE = the passage directly states this. FALSE = the passage directly contradicts this. NOT GIVEN = the passage does not mention this at all. NOT GIVEN is not "I can\'t find it" — it means the information is genuinely absent.' },
      { title: 'Matching Headings — match main ideas, not keywords', body: 'Read each paragraph\'s first and last sentence only. Match to the heading that captures the MAIN IDEA of the whole paragraph, not just a keyword you spot.' },
      { title: 'Answers follow passage order', body: 'In most question types (completion, short answer, MC), answers appear in the same order as the passage. Use this to track your position and avoid backtracking.' },
      { title: 'Synonyms rule', body: 'The passage and the question NEVER use the same words. Train yourself to recognize synonyms: "benefit" in the question might be "advantage" or "positive impact" in the passage.' },
    ],
    mistakes: [
      { label: 'Reading every word from the beginning', bad: 'Starting from paragraph 1 and reading everything before looking at questions', good: 'Questions first → skim for structure → scan for specific answers' },
      { label: 'Confusing "False" with "Not Given"', bad: 'Marking NOT GIVEN when the passage contradicts the statement (that\'s FALSE)', good: 'FALSE = passage says the opposite. NOT GIVEN = passage is silent on the topic.' },
      { label: 'Spending too long on one question', bad: 'Spending 4 minutes on one question and running out of time for the rest', good: 'Maximum 2 minutes per question. Mark your best guess and move on.' },
      { label: 'Matching headings by keyword spotting', bad: 'Choosing a heading because it contains the same word as the paragraph', good: 'Reading first + last sentence of paragraph, then choosing the heading that matches the main idea' },
    ]
  },
  writing: {
    emoji: '✍️',
    title: 'Writing',
    subtitle: 'The module that takes the most time investment — start early',
    strategies: [
      { title: 'Task 1 (20 min, 150+ words): describe, never opine', body: 'Task 1 is purely descriptive. Write what the data shows. Never write "This is concerning" or "Governments should...". Describe trends with: peaked at, declined sharply, remained stable, accounted for.' },
      { title: 'Task 2 (40 min, 270–280 words): plan first', body: 'Spend 5 minutes planning BEFORE writing. Identify the essay type (opinion/discussion/problem-solution). Write your thesis and 2 body paragraph points. Planning prevents structural collapse mid-essay.' },
      { title: 'Paraphrase the question in your introduction', body: 'Your first sentence must restate the question in different words. This immediately demonstrates vocabulary range. Replace nouns with synonyms, change the sentence structure, use academic tone.' },
      { title: 'Use collocations, not just vocabulary', body: 'Examiner Language Assessment criteria rewards collocations — words that naturally go together. "Alleviate poverty", "pose a significant threat", "foster economic development" score higher than individual complex words.' },
      { title: 'Coherence through linking devices variety', body: 'Use at least 6 different linking devices per essay. Avoid repeating "However" and "Moreover" every paragraph. Use: Despite this / Notwithstanding / In light of this / That said / Consequently / By the same token.' },
      { title: 'No idioms in academic writing', body: 'Idioms are informal. "You\'re barking up the wrong tree" does not belong in an IELTS essay. Use collocations and academic vocabulary instead. Phrasal verbs used correctly are acceptable.' },
    ],
    mistakes: [
      { label: 'Starting Task 2 without planning', bad: 'Beginning to write immediately and changing direction halfway through', good: '5-minute planning: essay type → thesis → 2 body points → conclusion approach' },
      { label: 'Using opinions in Task 1', bad: '"This increase in pollution levels is very worrying." (opinion)', good: '"The data illustrates a significant rise in pollution levels between 2010 and 2020."' },
      { label: 'Repeating vocabulary throughout the essay', bad: 'Using "important" 6 times in one essay', good: 'Rotating synonyms: essential, crucial, significant, fundamental, vital, critical' },
      { label: 'Writing under 250 words in Task 2', bad: 'Stopping at 230 words because you "covered the topic"', good: 'Target 270–280 words. Under 250 causes automatic Task Response score reduction.' },
    ]
  },
  speaking: {
    emoji: '🗣️',
    title: 'Speaking',
    subtitle: 'Fluency + confidence wins — not perfect grammar',
    strategies: [
      { title: 'Part 1: natural, conversational, extended', body: 'Part 1 tests everyday topics. Don\'t give one-word answers. Extend every answer: Answer + Reason + Example or Detail. "Do you like reading?" → "Yes, I enjoy reading quite a lot, especially non-fiction books. I find that they help me learn about different perspectives — for instance, I recently finished a book about behavioral economics."' },
      { title: 'Part 2: use your 1-minute prep time', body: 'In your 1-minute preparation, jot 3–4 bullet points: WHO (people involved) / WHAT (details) / WHEN (timeframe) / HOW YOU FELT. Then tell a story, not a list.' },
      { title: 'Part 3: Opinion + Reason + Example always', body: '"Do you think governments should control social media?" → "I believe some regulation is necessary [OPINION] because misinformation can directly harm public health and democratic processes [REASON]. During the COVID pandemic, for instance, false treatment advice spread widely and caused real harm [EXAMPLE]."' },
      { title: 'Replace fillers with pauses', body: 'Every "um", "uh", "like", "you know" reduces your Fluency score. Replace them with a 1-second pause. A confident pause sounds better than a filler. Record yourself daily and count fillers.' },
      { title: 'Pronunciation: word stress and intonation', body: 'Word stress matters: comPUter, phoTOgraphy, eCONomy. Practice these with a native speaker app or YouTube. IELTS examiners don\'t penalize accents — they penalize unclear pronunciation.' },
      { title: 'Think in English, not Bengali first', body: 'The biggest fluency bottleneck for Bengali speakers is translation delay. Practice thinking in English during daily tasks: narrate what you\'re doing, describe what you see, think through problems in English.' },
    ],
    mistakes: [
      { label: 'One-word or two-word answers in Part 1', bad: 'Examiner: "Do you like cooking?" You: "Yes, I do." (end)', good: '"Yes, I enjoy cooking a lot — I find it relaxing after a long day. I particularly like making traditional Bengali dishes like biryani."' },
      { label: 'Memorized scripts in Part 2', bad: 'Reciting a prepared speech that sounds unnatural and robotic', good: 'Using your bullet notes as anchors and speaking naturally, even if imperfect' },
      { label: 'Using filler words constantly', bad: '"Um, well, I think, um, that, you know, technology is, um, very important..."', good: '"Technology plays a crucial role in modern society." [pause to think] "One clear example is..."' },
      { label: 'Stopping speaking too early in Part 2', bad: 'Speaking for only 45 seconds when 2 minutes is expected', good: 'Practice until you can easily fill 2 minutes. Use: details, feelings, reasons, examples, comparisons.' },
    ]
  }
};

window.showModule = (modId, btn) => {
  document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  renderModule(modId);
};

function renderModule(modId) {
  const mod = MODULES[modId];
  const container = document.getElementById('module-content');

  container.innerHTML = `
    <div class="module-panel">
      <div class="module-hero glass">
        <div class="module-emoji">${mod.emoji}</div>
        <div>
          <h3>${mod.title}</h3>
          <p>${mod.subtitle}</p>
        </div>
      </div>

      <div class="section-card glass">
        <h3 class="section-title">Key strategies</h3>
        <div class="strategy-list">
          ${mod.strategies.map(s => `
            <div class="strategy-item">
              <strong>${s.title}</strong>
              <p>${s.body}</p>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="mistakes-card">
        <h4>⚠ Common mistakes & how to avoid them</h4>
        ${mod.mistakes.map(m => `
          <div class="mistake-item">
            <div class="mistake-label">${m.label}</div>
            <div class="mistake-bad">${m.bad}</div>
            <div class="mistake-good">${m.good}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* =============================================
   7. VOCAB TAB
   ============================================= */
// Demo word shown on first load
const DEMO_WORD = {
  id: 'demo-alleviate',
  word: 'alleviate',
  meaning: 'to reduce or lessen pain, suffering, or a problem',
  example: '"Governments must introduce policies to alleviate poverty in rural communities."',
  category: 'academic',
  isDemo: true,
  addedAt: new Date().toISOString()
};

window.addVocabWord = async () => {
  const word     = document.getElementById('vocab-word').value.trim();
  const meaning  = document.getElementById('vocab-meaning').value.trim();
  const example  = document.getElementById('vocab-example').value.trim();
  const category = document.getElementById('vocab-category').value;

  if (!word || !meaning) {
    alert('Please fill in the word and meaning at minimum.');
    return;
  }

  const entry = {
    word, meaning, example, category,
    addedAt: new Date().toISOString()
  };

  try {
    const ref = await addDoc(collection(db, 'users', currentUser.uid, 'vocab'), entry);
    entry.id = ref.id;
    vocabWords.unshift(entry);
    renderVocabList();
    updateVocabProgress();

    // Clear form
    document.getElementById('vocab-word').value    = '';
    document.getElementById('vocab-meaning').value  = '';
    document.getElementById('vocab-example').value  = '';
  } catch (err) {
    console.error('Error saving vocab:', err);
    alert('Could not save. Check your Firebase connection.');
  }
};

window.filterVocab = (cat, btn) => {
  document.querySelectorAll('#tab-vocab .filter-pills .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  currentVocabFilter = cat;
  renderVocabList();
};

function renderVocabList() {
  const container = document.getElementById('vocab-list');
  const allWords  = [DEMO_WORD, ...vocabWords];
  const filtered  = currentVocabFilter === 'all' ? allWords : allWords.filter(w => w.category === currentVocabFilter);

  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-state">No words in this category yet.</p>';
    return;
  }

  container.innerHTML = `<div class="vocab-cards">${filtered.map(w => `
    <div class="vocab-word-card" onclick="openVocabModal('${w.id}')">
      <div class="vocab-word-left">
        <div class="word-title">${w.word}${w.isDemo ? ' <span style="font-size:10px;color:rgba(245,245,247,0.3)">(demo)</span>' : ''}</div>
        <div class="word-meaning">${w.meaning}</div>
      </div>
      <span class="vocab-cat-badge ${w.category}">${w.category}</span>
    </div>
  `).join('')}</div>`;

  // Update stats
  document.getElementById('stat-vocab').textContent  = vocabWords.length;
  document.getElementById('vocab-count') && (document.getElementById('vocab-count').textContent = vocabWords.length);
}

function updateVocabProgress() {
  // Count words added today
  const today = dateKey(new Date());
  const todayCount = vocabWords.filter(w => w.addedAt && w.addedAt.startsWith(today)).length;
  const pct = Math.min(100, (todayCount / 10) * 100);
  document.getElementById('today-vocab-count').textContent = `${todayCount} / 10`;
  document.getElementById('vocab-progress-fill').style.width = pct + '%';
}

/* =============================================
   8. STUDY LOG TAB
   ============================================= */
function renderCalendar() {
  const grid  = document.getElementById('cal-grid');
  const label = document.getElementById('cal-month-label');
  grid.innerHTML = '';

  const year  = calMonth.getFullYear();
  const month = calMonth.getMonth();
  label.textContent = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  // First weekday of month (0=Sun → Monday-first adjustment)
  const firstDay = new Date(year, month, 1).getDay();
  const offset   = firstDay === 0 ? 6 : firstDay - 1; // Monday-first

  // Empty cells before first day
  for (let i = 0; i < offset; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  // Day cells
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement('div');
    const key  = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    const isStudied = studiedDays.has(key);

    cell.className = 'cal-day' + (isStudied ? ' studied' : '') + (isToday ? ' today' : '');
    cell.textContent = d;
    cell.addEventListener('click', () => toggleStudiedDay(cell, key));
    grid.appendChild(cell);
  }
}

window.changeMonth = (dir) => {
  calMonth.setMonth(calMonth.getMonth() + dir);
  renderCalendar();
};

async function toggleStudiedDay(cell, key) {
  if (studiedDays.has(key)) {
    studiedDays.delete(key);
    cell.classList.remove('studied');
  } else {
    studiedDays.add(key);
    cell.classList.add('studied');
  }
  await saveStudiedDays();
  renderOverviewStats();
}

// Log entries
window.openAddLogModal = () => {
  document.getElementById('log-modal').classList.remove('hidden');
};
window.closeLogModal = (e) => {
  if (!e || e.target === document.getElementById('log-modal')) {
    document.getElementById('log-modal').classList.add('hidden');
  }
};

window.saveLogEntry = async () => {
  const module   = document.getElementById('log-module').value;
  const duration = document.getElementById('log-duration').value;
  const notes    = document.getElementById('log-notes').value.trim();
  const score    = document.getElementById('log-score').value.trim();

  if (!duration) { alert('Please enter how long you studied.'); return; }

  const entry = { module, duration: parseInt(duration), notes, score, date: new Date().toISOString() };

  try {
    const ref = await addDoc(collection(db, 'users', currentUser.uid, 'log'), entry);
    entry.id = ref.id;
    logEntries.unshift(entry);
    renderLogEntries();
    closeLogModal();
    // Clear form
    document.getElementById('log-notes').value = '';
    document.getElementById('log-score').value = '';
    document.getElementById('log-duration').value = '';
  } catch (err) {
    console.error('Error saving log:', err);
    alert('Could not save entry. Check Firebase connection.');
  }
};

function renderLogEntries() {
  const container = document.getElementById('log-entries');
  if (logEntries.length === 0) {
    container.innerHTML = '<p class="empty-state">No entries yet. Log your practice sessions!</p>';
    return;
  }

  const moduleEmoji = { listening:'🎧', reading:'📖', writing:'✍️', speaking:'🗣️', vocab:'📚', mock:'📋' };
  container.innerHTML = logEntries.map(e => `
    <div class="log-entry">
      <div class="log-entry-header">
        <div class="log-entry-module">${moduleEmoji[e.module] || '📝'} ${e.module.charAt(0).toUpperCase() + e.module.slice(1)}</div>
        <div class="log-entry-meta">${e.duration} min · ${new Date(e.date).toLocaleDateString()}</div>
      </div>
      ${e.notes ? `<div class="log-entry-notes">${e.notes}</div>` : ''}
      ${e.score ? `<div class="log-entry-score">Result: ${e.score}</div>` : ''}
    </div>
  `).join('');
}

// Daily checklist
const DAILY_CHECKS = [
  { id: 'dc1', text: '🎧 Completed a Listening practice session' },
  { id: 'dc2', text: '📖 Did a Reading practice passage' },
  { id: 'dc3', text: '✍️ Wrote a Task 1 or Task 2 response' },
  { id: 'dc4', text: '🗣️ Recorded a Speaking response' },
  { id: 'dc5', text: '📚 Added 10 vocabulary words' },
  { id: 'dc6', text: '📰 Read an academic/news article in English' },
  { id: 'dc7', text: '🔊 Listened to English for 20+ min (podcast/radio)' },
  { id: 'dc8', text: '🔁 Reviewed yesterday\'s vocabulary words' },
];

function renderDailyChecklist() {
  const container = document.getElementById('daily-checklist');
  container.innerHTML = DAILY_CHECKS.map(item => `
    <div class="checklist-item ${checkedItems.has(item.id) ? 'done' : ''}" onclick="toggleChecklistItem(this, '${item.id}')">
      <div class="checklist-box">${checkedItems.has(item.id) ? '✓' : ''}</div>
      <span class="item-text">${item.text}</span>
    </div>
  `).join('');
}

window.toggleChecklistItem = (el, id) => {
  el.classList.toggle('done');
  const box = el.querySelector('.checklist-box');
  if (el.classList.contains('done')) {
    box.textContent = '✓';
    checkedItems.add(id);
  } else {
    box.textContent = '';
    checkedItems.delete(id);
  }
  // Note: daily checklist is session-only (resets each day)
  renderOverviewStats();
};

/* =============================================
   9. MODALS
   ============================================= */
window.openTaskModal = (task) => {
  document.getElementById('modal-title').textContent = task.text;
  document.getElementById('modal-body').innerHTML = `
    <p class="task-modal-why">${task.why}</p>
    <h4 style="font-size:14px;font-weight:600;margin-bottom:12px;color:rgba(245,245,247,0.6)">How to do it:</h4>
    <div class="task-steps">
      ${task.steps.map((step, i) => `
        <div class="task-step">
          <div class="step-num">${i + 1}</div>
          <div>${step}</div>
        </div>
      `).join('')}
    </div>
    ${task.resource ? `
      <div class="task-resource">
        <strong>🔗 Resources</strong>
        ${task.resource}
      </div>
    ` : ''}
  `;
  document.getElementById('task-modal').classList.remove('hidden');
};

window.closeTaskModal = (e) => {
  if (!e || e.target === document.getElementById('task-modal')) {
    document.getElementById('task-modal').classList.add('hidden');
  }
};

window.openVocabModal = (wordId) => {
  const allWords = [DEMO_WORD, ...vocabWords];
  const word = allWords.find(w => w.id === wordId);
  if (!word) return;

  currentVocabModalWord = word;
  document.getElementById('vocab-modal-word').textContent = word.word;
  document.getElementById('vocab-modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div>
        <div style="font-size:12px;color:rgba(245,245,247,0.4);margin-bottom:4px">Meaning</div>
        <div style="font-size:15px">${word.meaning}</div>
      </div>
      ${word.example ? `
        <div>
          <div style="font-size:12px;color:rgba(245,245,247,0.4);margin-bottom:4px">Example sentence</div>
          <div style="font-size:14px;color:rgba(245,245,247,0.6);font-style:italic;line-height:1.5">${word.example}</div>
        </div>
      ` : ''}
      <div>
        <div style="font-size:12px;color:rgba(245,245,247,0.4);margin-bottom:4px">Category</div>
        <span class="vocab-cat-badge ${word.category}">${word.category}</span>
      </div>
      <div style="font-size:12px;color:rgba(245,245,247,0.3)">Added: ${new Date(word.addedAt).toLocaleDateString()}</div>
    </div>
  `;

  // Set up delete button
  const deleteBtn = document.getElementById('vocab-delete-btn');
  if (word.isDemo) {
    deleteBtn.style.display = 'none';
  } else {
    deleteBtn.style.display = '';
    deleteBtn.onclick = () => deleteVocabWord(word.id);
  }

  document.getElementById('vocab-modal').classList.remove('hidden');
};

window.closeVocabModal = (e) => {
  if (!e || e.target === document.getElementById('vocab-modal')) {
    document.getElementById('vocab-modal').classList.add('hidden');
  }
};

async function deleteVocabWord(wordId) {
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'vocab', wordId));
    vocabWords = vocabWords.filter(w => w.id !== wordId);
    closeVocabModal();
    renderVocabList();
    updateVocabProgress();
  } catch (err) {
    console.error('Delete error:', err);
    alert('Could not delete word.');
  }
}

/* =============================================
   10. FIREBASE DATA SYNC
   ============================================= */
async function loadUserData() {
  try {
    // User profile
    const profileSnap = await getDoc(doc(db, 'users', currentUser.uid));
    userData = profileSnap.exists() ? profileSnap.data() : { target: '8.0', name: currentUser.displayName };

    // Vocabulary
    const vocabSnap = await getDocs(query(collection(db, 'users', currentUser.uid, 'vocab'), orderBy('addedAt', 'desc')));
    vocabWords = vocabSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Log entries
    const logSnap = await getDocs(query(collection(db, 'users', currentUser.uid, 'log'), orderBy('date', 'desc')));
    logEntries = logSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Studied days
    const studiedSnap = await getDoc(doc(db, 'users', currentUser.uid, 'progress', 'studied'));
    if (studiedSnap.exists()) studiedDays = new Set(studiedSnap.data().days || []);

    // Checked tasks
    const tasksSnap = await getDoc(doc(db, 'users', currentUser.uid, 'progress', 'tasks'));
    if (tasksSnap.exists()) checkedTasks = new Set(tasksSnap.data().ids || []);

  } catch (err) {
    console.error('Load error:', err);
    // Gracefully continue with empty data if Firestore isn't set up yet
  }
}

async function saveStudiedDays() {
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'progress', 'studied'), {
      days: [...studiedDays]
    });
  } catch (err) { console.error('Save studied days error:', err); }
}

async function saveCheckedTasks() {
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'progress', 'tasks'), {
      ids: [...checkedTasks]
    });
  } catch (err) { console.error('Save tasks error:', err); }
}

/* =============================================
   11. UTILITIES & INIT
   ============================================= */
function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function initApp() {
  // Set up nav greeting, stats, render default tab
  renderOverviewStats();
  renderDailyChecklist();
  renderLogEntries();

  // Default to overview tab
  switchTab('overview');
}
