# archimodel


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
