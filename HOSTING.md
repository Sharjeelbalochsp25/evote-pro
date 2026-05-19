# Hosting Guide for E-VotePro

This guide explains how to deploy your E-VotePro frontend to the web. Since this is a Vite React application, it can be hosted easily on Vercel or Netlify.

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
1. Create a new repository on GitHub (e.g., `evotepro-frontend`).
2. Initialize git in your project folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/evotepro-frontend.git
   git push -u origin main
   ```

## Step 3: Hosting on Vercel (Recommended)
1. Go to [Vercel.com](https://vercel.com) and sign up with GitHub.
2. Click **"Add New Project"**.
3. Import your `evotepro-frontend` repository.
4. Vercel will auto-detect the Vite framework.
   - **Build Command**: `vite build` (or `npm run build`)
   - **Output Directory**: `dist`
5. Click **Deploy**.
6. Wait 1-2 minutes. Your site is now live!

## Step 4: Hosting on Netlify
1. Go to [Netlify.com](https://netlify.com) and sign up with GitHub.
2. Click **"Add new site"** -> **"Import an existing project"**.
3. Select GitHub and choose your `evotepro-frontend` repo.
4. Netlify will detect the settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
5. Click **Deploy site**.

## Notes
- **Data Persistence**:
   - If you configure Firebase (Auth + Firestore) via `VITE_FIREBASE_*` env vars, election data is stored in Firestore and is available across devices.
   - If Firebase env vars are missing, the app intentionally falls back to `localStorage` (single-browser demo mode).
   - For Vercel/Netlify deployments, add the same `VITE_FIREBASE_*` variables from `.env.example` in your hosting provider's Environment Variables settings.
