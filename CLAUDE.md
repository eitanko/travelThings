# TravelThings

Expo / React Native (iOS) app using expo-router. Includes an iOS share extension (`targets/`, `plugins/`).

## Commands

- `npm start` – Expo dev server
- `npm run ios` – build and run on iOS
- `npm run check` – typecheck + lint + tests (run before committing)
- `npm run typecheck`, `npm run lint`, `npm test`

## npm install

The default npm registry on this machine is a private AWS CodeArtifact one, so **always pass the full public registry URL** when installing:

```
npm install --registry=https://registry.npmjs.org/ <package>
```

This applies to every `npm install` / `npm i` (including plain `npm install` with no package name).
