# Firebase Setup

## 1. Create or verify the Firebase project

- Use project `evotepro-7deff` or your own Firebase project.
- Enable Authentication with Email/Password sign-in.
- Create Firestore in production mode.

## 2. Configure Firestore rules and indexes

Deploy the committed rules and indexes:

```powershell
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project evotepro-7deff
```

The app assumes owner-only access for private election documents and public read access for `publicElections`.

## 3. Configure backend credentials

- Create a Firebase service account.
- Store the full JSON in `FIREBASE_SERVICE_ACCOUNT` for serverless/runtime use.
- Set `FIREBASE_PROJECT_ID` or `GOOGLE_CLOUD_PROJECT`.

## 4. Deploy Functions when used

```powershell
npx firebase-tools deploy --only functions --project evotepro-7deff
```

## 5. Smoke test Firebase access

```powershell
npm run smoke:firebase
```

This verifies Firestore read/write/delete access using the service account.
