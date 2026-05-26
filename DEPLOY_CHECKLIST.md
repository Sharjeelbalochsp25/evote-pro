# Deploy Checklist

## Prebuild

- [ ] `npm install`
- [ ] `npm run validate:firebase`
- [ ] `npm run build`
- [ ] Confirm no demo mode in production

## Firebase

- [ ] Auth is enabled with Email/Password
- [ ] Firestore rules are deployed
- [ ] Firestore indexes are deployed
- [ ] Service account exists and is stored securely
- [ ] Smoke test passes with `npm run smoke:firebase`

## Hosting

- [ ] All `VITE_FIREBASE_*` vars are set in Preview and Production
- [ ] `VITE_DEPLOYMENT_ENV` is set for preview builds
- [ ] `FIREBASE_SERVICE_ACCOUNT` is set where backend/API runs
- [ ] `FIREBASE_PROJECT_ID` matches the Firebase project

## Verification

- [ ] Login works
- [ ] Create election works
- [ ] Public vote works
- [ ] Audit log writes appear in Firestore
- [ ] No localStorage demo banner appears in production

## Rollback

- [ ] Keep the previous deployment URL or release artifact available
- [ ] Revert only the hosting release, not the Firebase project config
- [ ] Re-run smoke tests after rollback
