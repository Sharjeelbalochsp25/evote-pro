# Hosting Guide for E-VotePro

This guide explains how to deploy E-VotePro on Firebase Hosting with Firestore and Firebase Auth only.

## Prerequisites
1. **Node.js**: Ensure you have Node.js installed on your machine. [Download Here](https://nodejs.org/).
2. **GitHub Account**: You will need a GitHub account to push your code.

## Step 1: Install Dependencies Local
Since the files were generated manually, you first need to install the project dependencies.

1. Open a terminal in the `evotepro` folder.
2. Run:
   ```bash
   npm install
   ```
3. Test the app locally:
   ```bash
   npm run dev
   ```

## Step 2: Push to GitHub
1. Create a new repository on GitHub.
2. Initialize git in your project folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/evotepro-frontend.git
   git push -u origin main
   ```

## Step 3: Deploy to Firebase Hosting
1. Install and authenticate the Firebase CLI.
2. Confirm your Firebase project is selected.
3. Build the frontend:
   ```bash
   npm run build
   ```
4. Deploy hosting and Firestore rules:
   ```bash
   npx firebase-tools deploy --only firestore:rules,hosting --project evotepro-7deff
   ```
5. Open the generated Firebase Hosting URL and verify the public vote route, creator login, and dashboard.

## Notes
- **Data Persistence**:
   - If you configure Firebase (Auth + Firestore) via `VITE_FIREBASE_*` env vars, election data is stored in Firestore and is available across devices.
   - If Firebase env vars are missing, the app intentionally falls back to `localStorage` (single-browser demo mode).
   - For Firebase Hosting, set the same `VITE_FIREBASE_*` variables in your local build environment and CI environment before deploy.
