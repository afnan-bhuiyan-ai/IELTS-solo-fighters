# IELTS Solo Fighters 🥊

**Your personal Band 8.0 Academic IELTS preparation system**

Made by **Afnan Ahmed Bhuiyan**
- 🔗 [LinkedIn](https://www.linkedin.com/in/afnan-ahmed-bhuiyan/)
- 📘 [Facebook](https://www.facebook.com/afnan.ahmed.bhuiyan)
- 📧 [afnan.bhuiyan.ai@gmail.com](mailto:afnan.bhuiyan.ai@gmail.com)

---

## Features

- **Login/Signup** — Email/password + Google login (Firebase Auth)
- **Overview** — Live stats, top scorer insights, 14-week roadmap visual
- **14-Week Plan** — Expandable weeks with tap-to-learn task dialogs
- **Module Strategies** — Listening, Reading, Writing, Speaking with common mistakes
- **Vocabulary Tracker** — Add/delete words with meaning + example, daily goal progress
- **Study Log** — Tap-to-mark calendar + practice log with notes

---

## Setup Instructions (Free)

### Step 1 — Firebase (free account)

1. Go to [https://firebase.google.com](https://firebase.google.com)
2. Click **"Add project"** → name it anything (e.g. `ielts-solo-fighters`)
3. Disable Google Analytics (optional) → **Create project**
4. In your project dashboard, click the **Web icon** `</>` → Register app
5. Copy the `firebaseConfig` object

### Step 2 — Enable Auth

1. In Firebase Console → **Authentication** → **Get started**
2. Enable **Email/Password** provider
3. Enable **Google** provider (select your project support email)

### Step 3 — Enable Firestore

1. In Firebase Console → **Firestore Database** → **Create database**
2. Select **"Start in test mode"** (allows open read/write for 30 days)
3. Choose any region → **Done**

> After 30 days, update your security rules. Recommended rules:
> ```
> rules_version = '2';
> service cloud.firestore {
>   match /databases/{database}/documents {
>     match /users/{userId}/{document=**} {
>       allow read, write: if request.auth != null && request.auth.uid == userId;
>     }
>   }
> }
> ```

### Step 4 — Add your Firebase config

Open `js/firebase-config.js` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",          // ← paste your values here
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

### Step 5 — Deploy to GitHub Pages

1. Push the entire project folder to a GitHub repository
2. Go to **Settings → Pages** in your repo
3. Source: **Deploy from a branch → main → / (root)**
4. Your site will be live at `https://yourusername.github.io/ielts-solo-fighters`

---

## File Structure

```
ielts-solo-fighters/
├── index.html              ← Main app (all screens)
├── css/
│   └── style.css           ← Apple-inspired styles + glass morphism
├── js/
│   ├── firebase-config.js  ← 🔧 PUT YOUR FIREBASE CONFIG HERE
│   └── app.js              ← All app logic, data, Firebase sync
└── README.md
```

## Customization Notes

All customization points are marked with comments in the code:

- **Change target band score default** → `app.js` → `DEMO_WORD` and `userData.target`
- **Add/edit weekly tasks** → `app.js` → `WEEKS_DATA` array (each week has `tasks[]` with `text`, `why`, `steps`, `resource`)
- **Add/edit module strategies** → `app.js` → `MODULES` object
- **Change accent colors** → `css/style.css` → `:root` → `--color-accent`
- **Add a 5th module** → Follow the pattern in `MODULES` and add a pill button in `index.html`

---

## Tech Stack

- Vanilla HTML/CSS/JS (no build tools needed)
- Firebase Auth + Firestore (free tier)
- ES Modules (`type="module"`)
- Apple SF Pro font stack + Inter fallback
- CSS custom properties throughout (easy theming)
