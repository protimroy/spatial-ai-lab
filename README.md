# Spatial AI Lab: Performance Comparison

A React application demonstrating the performance difference between **Traditional DOM-based** rendering and **Pretext-based** arithmetic layout for streaming generative UI.

## Deployment to GitHub Pages

This app is configured for easy deployment to GitHub Pages.

### 1. Build the project
Run the following command to generate the production build:
```bash
npm run build
```

### 2. Deploy
You can use the `gh-pages` package for a one-command deployment:

1. Install the package:
   ```bash
   npm install gh-pages --save-dev
   ```
2. Add these scripts to your `package.json`:
   ```json
   "predeploy": "npm run build",
   "deploy": "gh-pages -d dist"
   ```
3. Run the deploy command:
   ```bash
   npm run deploy
   ```

Alternatively, you can manually upload the contents of the `dist/` folder to your GitHub repository's `gh-pages` branch.

## Features
- **Traditional Mode:** Uses `getBoundingClientRect()` for layout, demonstrating "Layout Thrashing."
- **Pretext Mode:** Uses `@chenglou/pretext` for arithmetic layout, maintaining 120fps.
- **Stress Test:** Increases stream speed and reflow pressure to exaggerate performance gaps.
- **Metrics:** Real-time FPS, Layout Budget, and Reflow-to-Token ratio tracking.
