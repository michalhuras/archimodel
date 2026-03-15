# archimodel

## License

This project is proprietary and confidential. No use, copying, modification,
distribution, or deployment is permitted without a prior written agreement
signed by the copyright holder. See `LICENSE`.

## Local development

Use `npm run dev` to run the project locally with automatic rebuilds and live refresh through Netlify Dev.
The app is served by Netlify Dev, and webpack watches source files in the background so changes are applied without running `npm run build` manually.

## Data inputs

* _.max_ - 3DS max privat format. There is no library to use it.
* _.fbx_ -
* _.mtl_ -
* _.obj_ - 

## Preprocessing

### Calculate layer possiotions from fbx file

```bash
node scripts/precompute-layer-overlays.mjs --camerasFbx "data/paczka - makieta 3d/test-makieta-fbx.fbx" --fovDeg 73 --occlusionEps 2
```

* occlusionEps - visibility of layers
* fovDeg - field of view of camera (match layer with rendered images)
