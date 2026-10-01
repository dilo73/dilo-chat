# Dilo Chat — Setup Guide

Follow these steps in order. Each step is short. You only do this once.

---

## Step 1: Install Node.js

1. Go to **https://nodejs.org**
2. Download the **LTS** version (the big green button).
3. Install it like a normal program.
4. To check it worked, open a terminal and type:
   ```
   node --version
   ```
   You should see a version number like `v22.x.x`.

---

## Step 2: Install the app's code libraries

1. Open a terminal **inside the `dilochat` folder**.
2. Type this and press Enter:
   ```
   npm install
   ```
3. Wait until it finishes (it can take 2–5 minutes). Do not close the terminal.

---

## Step 3: Try it right away (demo mode — no setup needed!)

The app works immediately in **demo mode**:

1. In the terminal, inside the `dilochat` folder, type:
   ```
   npx expo start
   ```
2. A QR code appears.
3. On your phone, install the **Expo Go** app (free, from the Play Store / App Store).
4. Open Expo Go and **scan the QR code**.
5. The app opens on your phone! Enter any name and phone number, then type **any 6-digit code** (like `123456`).
6. You will see a demo chat waiting for you. Try the VIP themes in Settings.

> Demo mode works on one phone only. For two phones to chat with each other, do Step 4.

---

## Step 4: Create a free Firebase project (for real accounts + real chat)

This gives the app a free backend so two phones can message each other.

1. Go to **https://console.firebase.google.com** and sign in with Google.
2. Click **"Create a project"** → name it `dilo-chat` → Continue → Continue (you can turn off Analytics).
3. In the left menu, click **Build** → **Firestore Database** → **Create database** → choose **"Start in production mode"** → Enable.
4. In the left menu, click **Build** → **Authentication** → **Get started** → open the **Sign-in method** tab → enable **Phone**.
5. Get your keys: click the **gear icon** (top left, next to "Project Overview") → **Project settings** → scroll to **"Your apps"** → click the **`</>`** (web) icon → give it a nickname like `dilo-web` → **Register app**.
6. You will see a code block called `firebaseConfig`. Copy these 6 values.
7. Open the file `lib/firebase.ts` in the `dilochat` folder and **paste your values** over the `PASTE_YOUR_...` placeholders.
8. Save the file. Done!

### Firestore security rules (important — paste these)

1. In Firebase Console, go to **Build** → **Firestore Database** → the **Rules** tab.
2. Delete everything there and paste this:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }

    match /chats/{chatId} {
      allow create: if request.auth != null
                    && request.auth.uid in request.resource.data.participants;
      allow read, update: if request.auth != null
                    && request.auth.uid in resource.data.participants;

      match /messages/{messageId} {
        allow read, create, update: if request.auth != null
          && request.auth.uid in
             get(/databases/$(database)/documents/chats/$(chatId)).data.participants;
      }
    }
  }
}
```

3. Click **Publish**.

> Note about real SMS codes: the free Firebase plan sends real SMS on the **web version** (`npm run web`). On a physical phone, real SMS needs a special "dev build" — until then, demo login still works everywhere and is perfect for testing.

---

## Step 5: Build the installable APK (free)

1. Create a free account at **https://expo.dev** (Sign up).
2. In the terminal, inside the `dilochat` folder:
   ```
   npm install -g eas-cli
   eas login
   ```
   Log in with your expo.dev account.
3. Start the build:
   ```
   eas build -p android --profile preview
   ```
4. It asks a few questions — press Enter for the defaults.
5. The build runs in the cloud (free). Wait about 10–20 minutes.
6. When it finishes, you get a **download link for an `.apk` file**.

---

## Step 6: Install on two phones and chat!

1. Download the `.apk` on **both phones** and install it (Android may ask "install from unknown sources" — allow it for this file).
2. Open Dilo Chat on phone 1 → register with **phone 1's number**.
3. Open Dilo Chat on phone 2 → register with **phone 2's number**.
4. On either phone: go to **Contacts** → tap the other person → say salaam! 🎉
5. Messages now go in real time between the two phones, with ticks.

---

## The cool features to try

- **Settings → VIP Themes**: 6 themes (Midnight Gold, Royal Purple, Ocean, Crimson, Emerald, Dilo Dark).
- **Settings → Chat Font**: 6 stylish fonts for your messages.
- **Settings → Always show single tick**: privacy mode — your messages always show one grey tick.
- **Settings → App Off**: stops all syncing, shows a banner, and queues your messages. Turn it back on and they auto-send.

---

## If something breaks

- `npx expo start` shows an error → run `npm install` again, then retry.
- QR code does not scan → make sure the phone and computer are on the **same Wi-Fi**.
- Chats do not sync between phones → check that you pasted the Firebase keys in `lib/firebase.ts` **and** published the security rules above.
- EAS build fails → run `eas build -p android --profile preview` again; the free tier sometimes needs a retry.
