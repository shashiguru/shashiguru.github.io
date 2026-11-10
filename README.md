# Shashiguru Keluth — Portfolio

Single-page portfolio built with plain HTML/CSS/JS, [Three.js](https://threejs.org) (interactive neural-network background) and [GSAP](https://gsap.com) (scroll animations). No build step; libraries load from the jsDelivr CDN.

Live: https://shashiguru.github.io

## Run locally

ES modules need an HTTP server (opening `index.html` via `file://` will not work):

```bash
npx serve .
# or
python -m http.server 8080
```

## Structure

- `index.html` — page content and import map
- `assets/css/styles.css` — theme and layout
- `assets/js/main.js` — bootstrap, nav, cursor, loader
- `assets/js/scene.js` — Three.js scene
- `assets/js/animations.js` — GSAP / ScrollTrigger animations

## Deploy

GitHub Pages: Settings > Pages > Deploy from branch `main`, folder `/ (root)`.
