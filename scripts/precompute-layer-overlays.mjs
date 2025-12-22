import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

import * as THREE from "three"
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js"
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function normalizeName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
}

function convexHull(points) {
  if (points.length <= 2) return points

  const pts = points
    .map((p) => ({ x: p.x, y: p.y }))
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))

  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }

  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }

  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

function pathFromHull(hull) {
  if (!hull || hull.length === 0) return ""
  if (hull.length === 1) {
    const p = hull[0]
    return `M ${p.x} ${p.y} m -6 0 a 6 6 0 1 0 12 0 a 6 6 0 1 0 -12 0`
  }
  let d = `M ${hull[0].x} ${hull[0].y}`
  for (let i = 1; i < hull.length; i++) {
    d += ` L ${hull[i].x} ${hull[i].y}`
  }
  d += " Z"
  return d
}

function snapSharedHorizontalEdge(perLayer, aName, bName, { edgeTol = 0.75, snapTol = 2 } = {}) {
  const a = perLayer?.[aName]
  const b = perLayer?.[bName]
  const ha = a?.hull
  const hb = b?.hull
  if (!Array.isArray(ha) || !Array.isArray(hb) || ha.length < 2 || hb.length < 2) return

  let aMaxY = -Infinity
  for (const p of ha) aMaxY = Math.max(aMaxY, p.y)
  let bMinY = Infinity
  for (const p of hb) bMinY = Math.min(bMinY, p.y)

  if (!Number.isFinite(aMaxY) || !Number.isFinite(bMinY)) return
  if (Math.abs(aMaxY - bMinY) > snapTol) return

  const aIdx = []
  for (let i = 0; i < ha.length; i++) {
    if (Math.abs(ha[i].y - aMaxY) <= edgeTol) aIdx.push(i)
  }
  const bIdx = []
  for (let i = 0; i < hb.length; i++) {
    if (Math.abs(hb[i].y - bMinY) <= edgeTol) bIdx.push(i)
  }
  if (!aIdx.length || !bIdx.length) return

  const snapY = (aMaxY + bMinY) * 0.5
  for (const i of aIdx) ha[i].y = snapY
  for (const i of bIdx) hb[i].y = snapY

  a.d = pathFromHull(ha)
  b.d = pathFromHull(hb)
}

function findLayerNodes(root, layerName) {
  const matches = []
  root.traverse((node) => {
    const nName = normalizeName(node.name)
    if (!nName) return
    if (nName === layerName || nName.includes(layerName)) {
      matches.push(node)
    }
  })

  const filtered = []
  for (const n of matches) {
    let parent = n.parent
    let coveredByParent = false
    while (parent) {
      if (matches.includes(parent)) {
        coveredByParent = true
        break
      }
      parent = parent.parent
    }
    if (!coveredByParent) filtered.push(n)
  }
  return filtered.length ? filtered : matches
}

function projectLayerPoints({ nodes, camera, w, h, debug }) {
  const pts = []
  let triTested = 0
  let triFront = 0
  let visTested = 0
  let visPassed = 0

  const debugSamples = []

  const raycaster = new THREE.Raycaster()
  const tmpDir = new THREE.Vector3()

  for (const node of nodes) {
    node.traverse((desc) => {
      if (!desc || !desc.isMesh || !desc.geometry) return
      const geo = desc.geometry
      const pos = geo.attributes?.position
      if (!pos || typeof pos.count !== "number") return

      const idx = geo.index
      const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3)
      if (!triCount) return

      const triStep = Math.max(1, Math.ceil(triCount / 4000))

      const a = new THREE.Vector3()
      const b = new THREE.Vector3()
      const c = new THREE.Vector3()
      const ab = new THREE.Vector3()
      const ac = new THREE.Vector3()
      const n = new THREE.Vector3()
      const center = new THREE.Vector3()
      const camDir = new THREE.Vector3()
      const v2 = new THREE.Vector3()
      const triCenter = new THREE.Vector3()

      for (let t = 0; t < triCount; t += triStep) {
        const i0 = idx ? idx.getX(t * 3 + 0) : t * 3 + 0
        const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1
        const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2

        a.fromBufferAttribute(pos, i0).applyMatrix4(desc.matrixWorld)
        b.fromBufferAttribute(pos, i1).applyMatrix4(desc.matrixWorld)
        c.fromBufferAttribute(pos, i2).applyMatrix4(desc.matrixWorld)

        ab.copy(b).sub(a)
        ac.copy(c).sub(a)
        n.copy(ab).cross(ac)
        const len = n.length()
        if (len < 1e-8) continue
        n.multiplyScalar(1 / len)

        if (Math.abs(n.y) > 0.85) continue

        center.copy(a).add(b).add(c).multiplyScalar(1 / 3)
        camDir.copy(camera.position).sub(center).normalize()

        triTested++
        const facing = n.dot(camDir)
        if (facing < 0.25) continue
        triFront++

        // Occlusion sampling: raycast from camera to triangle center.
        // If the closest hit is significantly closer than the triangle center, the point is occluded.
        if (visTested < 80) {
          triCenter.copy(a).add(b).add(c).multiplyScalar(1 / 3)
          tmpDir.copy(triCenter).sub(camera.position)
          const dist = tmpDir.length()
          if (dist > 1e-6) {
            const eps = Number.isFinite(globalThis.__occlusionEps)
              ? globalThis.__occlusionEps
              : Number.isFinite(globalThis.__sceneDiag)
                ? Math.max(2e-2, globalThis.__sceneDiag * 1e-3)
                : 2e-2
            tmpDir.multiplyScalar(1 / dist)
            raycaster.set(camera.position, tmpDir)
            raycaster.near = 0
            raycaster.far = dist + eps
            const meshes = globalThis.__occluderMeshes || globalThis.__raycastMeshes || []
            const hits = raycaster.intersectObjects(meshes, true)
            // Count the sample even if we get no hits, otherwise the layer can slip through
            // the visTested>=10 gate.
            visTested++

            // Interpret occlusion by comparing distances:
            // - if closest occluder hit is significantly closer than the tested point -> occluded
            // - if no hit, or hit is roughly at the same distance -> visible
            const hit0 = hits && hits.length ? hits[0] : null
            const hitDist = hit0 ? hit0.distance : null
            const hitName = hit0 ? String(hit0.object?.name || "") : "(none)"
            const visible = !hit0 || hitDist >= dist - eps
            if (visible) visPassed++
            if (debug?.enabled && debugSamples.length < (debug.maxSamples || 12)) {
              debugSamples.push({ hit: hitName, hitDist, dist, eps, visible })
            }
          }
        }

        const verts = [a, b, c]
        for (const vv of verts) {
          v2.copy(vv).project(camera)
          if (v2.z < -1 || v2.z > 1) continue
          const x = (v2.x * 0.5 + 0.5) * w
          const y = (-v2.y * 0.5 + 0.5) * h
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue
          pts.push({ x, y })
        }
      }
    })
  }

  return { pts, triTested, triFront, visTested, visPassed, debugSamples }
}

function parseArgs(argv) {
  const args = {
    model: null,
    camerasFbx: null,
    listCameraCandidates: false,
    debugVisibility: false,
    debugFrame: null,
    debugLayer: null,
    occlusionEps: null,
    apartments: null,
    out: null,
    width: 1280,
    height: 1280,
    fovDeg: null,
    near: null,
    far: null
  }

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--model") args.model = argv[++i]
    else if (a === "--camerasFbx") args.camerasFbx = argv[++i]
    else if (a === "--listCameraCandidates") args.listCameraCandidates = true
    else if (a === "--debugVisibility") args.debugVisibility = true
    else if (a === "--debugFrame") args.debugFrame = Number(argv[++i])
    else if (a === "--debugLayer") args.debugLayer = String(argv[++i])
    else if (a === "--occlusionEps") args.occlusionEps = Number(argv[++i])
    else if (a === "--apartments") args.apartments = argv[++i]
    else if (a === "--out") args.out = argv[++i]
    else if (a === "--width") args.width = Number(argv[++i])
    else if (a === "--height") args.height = Number(argv[++i])
    else if (a === "--fovDeg") args.fovDeg = Number(argv[++i])
    else if (a === "--near") args.near = Number(argv[++i])
    else if (a === "--far") args.far = Number(argv[++i])
  }

  return args
}

function objectPath(o) {
  const parts = []
  let cur = o
  while (cur) {
    const n = String(cur.name || "")
    if (n) parts.push(n)
    cur = cur.parent
  }
  return parts.reverse().join("/") || "(unnamed)"
}

function dumpHierarchy(root, { maxDepth = 6, maxChildren = 80 } = {}) {
  const lines = []
  function rec(node, depth) {
    if (!node) return
    if (depth > maxDepth) return
    const indent = "  ".repeat(depth)
    const name = String(node.name || "") || "(unnamed)"
    const type = String(node.type || "")
    const tag = node.isMesh ? "[MESH]" : "[NODE]"
    lines.push(`${indent}${tag} ${name} type=${type} children=${node.children?.length || 0}`)
    const children = Array.isArray(node.children) ? node.children : []
    for (let i = 0; i < Math.min(children.length, maxChildren); i++) {
      rec(children[i], depth + 1)
    }
    if (children.length > maxChildren) {
      lines.push(`${indent}  ... (${children.length - maxChildren} more child(ren))`)
    }
  }
  rec(root, 0)
  return lines
}

function listCamerasFromFbx({ fbxPath }) {
  const fbxBuf = fs.readFileSync(fbxPath)
  const ab = fbxBuf.buffer.slice(fbxBuf.byteOffset, fbxBuf.byteOffset + fbxBuf.byteLength)
  const loader = new FBXLoader()
  const scene = loader.parse(ab, path.dirname(fbxPath))
  scene.updateMatrixWorld(true)

  // Corona cameras exported from 3ds Max are often Groups/Dummies (not isCamera).
  // We treat nodes named Corona_Camera### as cameras and Corona_Camera###Target as their lookAt target.
  const byName = new Map()
  const nodes = []
  scene.traverse((o) => {
    if (!o) return
    nodes.push(o)
    const n = String(o.name || "")
    if (n) byName.set(n, o)
  })

  const coronaRe = /^Corona_Camera(\d+)$/i
  const coronaCameras = []
  for (const [name, o] of byName.entries()) {
    const m = name.match(coronaRe)
    if (!m) continue

    const idx = m[1]
    const baseName = `Corona_Camera${idx}`
    const targetName = `Corona_Camera${idx}Target`
    const targetObj = byName.get(targetName)

    o.updateMatrixWorld(true)
    const pos = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)

    let camLike = null
    // 1) Prefer a real camera under the Corona group (if exported that way)
    o.traverse((child) => {
      if (camLike) return
      if (!child || !child.isCamera) return
      camLike = child
    })
    // 2) If not found, look for any isCamera node with a matching base name
    if (!camLike) {
      for (const n of nodes) {
        if (!n || !n.isCamera) continue
        const nn = String(n.name || "")
        if (!nn) continue
        if (nn === baseName || nn.startsWith(baseName) || nn.includes(baseName)) {
          camLike = n
          break
        }
      }
    }

    let target = null
    if (targetObj) {
      targetObj.updateMatrixWorld(true)
      target = new THREE.Vector3().setFromMatrixPosition(targetObj.matrixWorld)
    }

    // FOV is not guaranteed on Group nodes.
    const fov = Number.isFinite(o.fov) ? o.fov : Number.isFinite(camLike?.fov) ? camLike.fov : null
    const near = Number.isFinite(o.near) ? o.near : Number.isFinite(camLike?.near) ? camLike.near : null
    const far = Number.isFinite(o.far) ? o.far : Number.isFinite(camLike?.far) ? camLike.far : null
    coronaCameras.push({ name, order: Number(idx), position: pos, target, fov, near, far })
  }

  coronaCameras.sort((a, b) => (a.order === b.order ? a.name.localeCompare(b.name) : a.order - b.order))
  process.stdout.write(`FBX traverse: nodes=${nodes.length}, coronaCameras=${coronaCameras.length}\n`)
  for (const c of coronaCameras.slice(0, 40)) {
    process.stdout.write(
      ` - corona camera: name='${c.name}' fov=${c.fov ?? "(null)"} near=${c.near ?? "(null)"} far=${c.far ?? "(null)"} pos=${c.position.x},${c.position.y},${c.position.z} target=${c.target ? `${c.target.x},${c.target.y},${c.target.z}` : "(none)"}\n`
    )
  }

  // If no Corona cameras were found, fall back to anything marked as isCamera.
  if (!coronaCameras.length) {
    const cams = []
    scene.traverse((o) => {
      if (o && o.isCamera) cams.push(o)
    })
    cams.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    process.stdout.write(`FBX isCamera fallback: ${cams.length}\n`)
    return cams
  }

  return coronaCameras
}

function listCameraCandidatesFromFbx({ fbxPath }) {
  const fbxBuf = fs.readFileSync(fbxPath)
  const ab = fbxBuf.buffer.slice(fbxBuf.byteOffset, fbxBuf.byteOffset + fbxBuf.byteLength)
  const loader = new FBXLoader()
  const scene = loader.parse(ab, path.dirname(fbxPath))
  scene.updateMatrixWorld(true)

  const candidates = []
  scene.traverse((o) => {
    if (!o) return
    const t = String(o.type || "")
    const n = String(o.name || "")
    const isLike = /camera/i.test(t) || /cam/i.test(n) || Boolean(o.isCamera)
    if (!isLike) return

    o.updateMatrixWorld(true)
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scl = new THREE.Vector3()
    o.matrixWorld.decompose(pos, quat, scl)

    candidates.push({
      name: n,
      type: t,
      isCamera: Boolean(o.isCamera),
      fov: Number.isFinite(o.fov) ? o.fov : null,
      near: Number.isFinite(o.near) ? o.near : null,
      far: Number.isFinite(o.far) ? o.far : null,
      position: [pos.x, pos.y, pos.z],
      quaternion: [quat.x, quat.y, quat.z, quat.w]
    })
  })

  candidates.sort((a, b) => String(a.name).localeCompare(String(b.name)))
  return candidates
}

function makePerspectiveFromAnyCamera({ srcCam, w, h }) {
  const fov =
    Number.isFinite(srcCam?.fov) ? srcCam.fov : Number.isFinite(srcCam?.fovDeg) ? srcCam.fovDeg : Number.isFinite(srcCam?.__overrideFovDeg) ? srcCam.__overrideFovDeg : 45
  const near =
    Number.isFinite(srcCam?.near) ? srcCam.near : Number.isFinite(srcCam?.__overrideNear) ? srcCam.__overrideNear : 0.1
  const far =
    Number.isFinite(srcCam?.far) ? srcCam.far : Number.isFinite(srcCam?.__overrideFar) ? srcCam.__overrideFar : 5000
  const cam = new THREE.PerspectiveCamera(fov, w / h, near, far)

  if (srcCam && srcCam.isObject3D) {
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scl = new THREE.Vector3()
    srcCam.updateMatrixWorld(true)
    srcCam.matrixWorld.decompose(pos, quat, scl)
    cam.position.copy(pos)
    cam.quaternion.copy(quat)
  } else if (srcCam && srcCam.position) {
    cam.position.copy(srcCam.position)
  }

  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  return cam
}

async function main() {
  const args = parseArgs(process.argv)

  // Minimal DOM polyfill for Node.js to support three.js loaders that assume a browser.
  // This is intentionally tiny: we only need to avoid hard crashes like "document is not defined".
  if (typeof globalThis.Image === "undefined") {
    globalThis.Image = class Image {
      constructor() {
        this.onload = null
        this.onerror = null
      }
      addEventListener(type, cb) {
        if (type === "load") this.onload = cb
        if (type === "error") this.onerror = cb
      }
      removeEventListener() {}
      set src(_) {
        // Immediately succeed; we only need FBXLoader to continue parsing.
        if (typeof this.onload === "function") setTimeout(() => this.onload(), 0)
      }
      get src() {
        return ""
      }
    }
  }

  if (typeof globalThis.document === "undefined") {
    globalThis.document = {
      createElementNS: (_ns, tag) => {
        const t = String(tag || "").toLowerCase()
        if (t === "img" || t === "image") return new globalThis.Image()
        return {}
      },
      createElement: (tag) => {
        const t = String(tag || "").toLowerCase()
        if (t === "img" || t === "image") return new globalThis.Image()
        return {}
      }
    }
  }
  if (typeof globalThis.window === "undefined") {
    globalThis.window = {}
  }

  if (args.listCameraCandidates) {
    if (!args.camerasFbx) {
      throw new Error("--listCameraCandidates requires --camerasFbx")
    }
    const repoRoot = path.join(__dirname, "..")
    const fbxPath = path.resolve(repoRoot, args.camerasFbx)
    process.stdout.write(`FBX cameras path: ${fbxPath}\n`)
    const ok = fs.existsSync(fbxPath)
    process.stdout.write(`FBX exists: ${ok}\n`)
    if (!ok) throw new Error(`FBX file not found: ${fbxPath}`)

    process.stdout.write("Listing camera candidates...\n")
    const candidates = listCameraCandidatesFromFbx({ fbxPath })
    process.stdout.write(`Found ${candidates.length} camera candidate(s)\n`)
    for (const c of candidates) {
      process.stdout.write(
        `${c.isCamera ? "[CAM]" : "[?]"} name='${c.name}' type='${c.type}' fov=${c.fov} pos=${c.position.join(",")} quat=${c.quaternion.join(",")}\n`
      )
    }
    return
  }

  const repoRoot = path.join(__dirname, "..")
  const modelPath = path.resolve(repoRoot, args.model || path.join("data", "paczka - makieta 3d", "test-makieta-obj.obj"))
  const camerasFbxPath = args.camerasFbx
    ? path.resolve(repoRoot, args.camerasFbx)
    : path.resolve(repoRoot, path.join("data", "paczka - makieta 3d", "test-makieta-3ds.fbx"))
  const apartmentsPath = path.resolve(repoRoot, args.apartments || path.join("netlify", "functions", "apartments.json"))
  const outPath = path.resolve(repoRoot, args.out || path.join("netlify", "functions", "layer-overlays.json"))

  const w = Number.isFinite(args.width) && args.width > 0 ? args.width : 1100
  const h = Number.isFinite(args.height) && args.height > 0 ? args.height : 520

  const apartments = JSON.parse(fs.readFileSync(apartmentsPath, "utf8"))
  const layerNames = [...new Set((Array.isArray(apartments) ? apartments : []).map((a) => normalizeName(a?.layer_name)).filter(Boolean))]

  const objText = fs.readFileSync(modelPath, "utf8")
  const loader = new OBJLoader()
  const root = loader.parse(objText)

  root.updateMatrixWorld(true)

  // Precompute mesh list for raycasting occlusion tests.
  // Stored on globalThis to avoid threading this through every function call.
  const raycastMeshes = []
  const occluderMeshes = []
  root.traverse((o) => {
    if (o && o.isMesh) {
      // Raycaster respects material.side. Ensure we can ray-hit both front and back faces
      // for occlusion testing from arbitrary camera angles.
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of mats) {
        if (m && m.side !== THREE.DoubleSide) m.side = THREE.DoubleSide
      }
      raycastMeshes.push(o)

      // For occlusion we only want "real" occluders (e.g. the main building mass),
      // not the layer meshes themselves, otherwise self-layer geometry will dominate hits.
      const nm = String(o.name || "")
      const isLayer = /^kondygnacja_\d+$/i.test(nm)
      if (!isLayer) occluderMeshes.push(o)
    }
  })
  globalThis.__raycastMeshes = raycastMeshes
  globalThis.__occluderMeshes = occluderMeshes

  if (Number.isFinite(args.occlusionEps)) {
    globalThis.__occlusionEps = args.occlusionEps
  } else {
    globalThis.__occlusionEps = null
  }

  if (args.debugVisibility) {
    process.stdout.write("\n=== VISIBILITY DEBUG (OBJ ROOT HIERARCHY) ===\n")
    for (const l of dumpHierarchy(root, { maxDepth: 7, maxChildren: 120 })) {
      process.stdout.write(l + "\n")
    }

    process.stdout.write("\n=== VISIBILITY DEBUG (RAYCAST MESHES) ===\n")
    process.stdout.write(`raycastMeshes: ${raycastMeshes.length}\n`)
    for (const m of raycastMeshes.slice(0, 300)) {
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
      const sides = mats.map((mm) => (mm ? mm.side : "(null)")).join(",")
      const matNames = mats.map((mm) => (mm ? String(mm.name || "") : "(null)")).join(",")
      process.stdout.write(
        ` - ${objectPath(m)} type=${m.type} matSide=[${sides}] matName=[${matNames}]\n`
      )
    }
    if (raycastMeshes.length > 300) {
      process.stdout.write(` ... (${raycastMeshes.length - 300} more mesh(es))\n`)
    }

    process.stdout.write("\n=== VISIBILITY DEBUG (OCCLUDER MESHES) ===\n")
    process.stdout.write(`occluderMeshes: ${occluderMeshes.length}\n`)
    for (const m of occluderMeshes.slice(0, 300)) {
      process.stdout.write(` - ${objectPath(m)}\n`)
    }
    if (occluderMeshes.length > 300) {
      process.stdout.write(` ... (${occluderMeshes.length - 300} more mesh(es))\n`)
    }
    process.stdout.write("=== END VISIBILITY DEBUG ===\n\n")
  }

  const box = new THREE.Box3().setFromObject(root)
  // Scene scale hint used to pick a reasonable occlusion epsilon.
  globalThis.__sceneDiag = box.min.distanceTo(box.max)
  const center = box.getCenter(new THREE.Vector3())

  const target = center

  const layers = new Map()
  for (const ln of layerNames) {
    const nodes = findLayerNodes(root, ln)
    if (nodes.length) layers.set(ln, nodes)
  }

  let cameras = []
  let cameraMeta = []
  const fbxExists = Boolean(camerasFbxPath && fs.existsSync(camerasFbxPath))
  process.stdout.write(`FBX cameras path: ${camerasFbxPath}\n`)
  process.stdout.write(`FBX exists: ${fbxExists}\n`)

  const requireFbxCameras = Boolean(args.camerasFbx)
  if (requireFbxCameras && !fbxExists) {
    throw new Error(`FBX file not found: ${camerasFbxPath}`)
  }

  if (!requireFbxCameras) {
    throw new Error("FBX cameras are required. Run with --camerasFbx <path-to-fbx>.")
  }

  if (fbxExists) {
    try {
      process.stdout.write(`Loading cameras from FBX: ${camerasFbxPath}\n`)
      cameras = listCamerasFromFbx({ fbxPath: camerasFbxPath })
      if (cameras.length) {
        process.stdout.write(`Loaded ${cameras.length} camera(s) from ${camerasFbxPath}\n`)

        cameraMeta = cameras.map((c) => {
          const pos = new THREE.Vector3()
          const quat = new THREE.Quaternion()
          const scl = new THREE.Vector3()

          if (c && c.isObject3D) {
            c.updateMatrixWorld(true)
            c.matrixWorld.decompose(pos, quat, scl)
          } else if (c && c.position) {
            pos.copy(c.position)
          }

          return {
            name: String(c.name || ""),
            fov: Number.isFinite(c.fov) ? c.fov : null,
            near: Number.isFinite(c.near) ? c.near : null,
            far: Number.isFinite(c.far) ? c.far : null,
            position: [pos.x, pos.y, pos.z],
            target: c && c.target ? [c.target.x, c.target.y, c.target.z] : null
          }
        })
      } else {
        process.stdout.write(`No cameras found in ${camerasFbxPath} (falling back to orbit)\n`)
      }
    } catch (e) {
      process.stdout.write(
        `Failed to parse cameras from FBX (${camerasFbxPath}), falling back to orbit: ${e?.message}\n`
      )
      cameras = []
      cameraMeta = []
    }
  }

  if (requireFbxCameras && cameras.length === 0) {
    // User explicitly requested FBX cameras; do not silently fall back and do not write output.
    throw new Error("FBX cameras requested but none could be loaded")
  }

  const frames = {}
  for (let i = 0; i < cameras.length; i++) {
    const srcCam = cameras[i]
    if (Number.isFinite(args.fovDeg)) srcCam.__overrideFovDeg = args.fovDeg
    if (Number.isFinite(args.near)) srcCam.__overrideNear = args.near
    if (Number.isFinite(args.far)) srcCam.__overrideFar = args.far

    const camera = makePerspectiveFromAnyCamera({ srcCam, w, h })
    // Corona cameras: if a Target exists, prefer lookAt(target); otherwise keep orientation.
    if (cameras[i] && cameras[i].target) {
      camera.lookAt(cameras[i].target)
    }
    if (i < 3) {
      process.stdout.write(
        `Using camera frame ${i}: fov=${camera.fov} aspect=${camera.aspect} near=${camera.near} far=${camera.far}\n`
      )
    }
    camera.updateMatrixWorld(true)

    root.updateMatrixWorld(true)

    const perLayer = {}
    for (const [layerName, nodes] of layers.entries()) {
      const debugEnabled = Number.isFinite(args.debugFrame) && args.debugFrame === i && (!args.debugLayer || args.debugLayer === layerName)
      const r = projectLayerPoints({ nodes, camera, w, h, debug: debugEnabled ? { enabled: true, maxSamples: 12 } : null })
      const pts = r?.pts || []
      const triTested = Number(r?.triTested) || 0
      const triFront = Number(r?.triFront) || 0
      const visTested = Number(r?.visTested) || 0
      const visPassed = Number(r?.visPassed) || 0

      if (debugEnabled) {
        process.stdout.write(
          `\n[debugFrame=${i}] layer='${layerName}' triTested=${triTested} triFront=${triFront} frontRatio=${triTested ? (triFront / triTested).toFixed(3) : "(n/a)"} visTested=${visTested} visPassed=${visPassed} visRatio=${visTested ? (visPassed / visTested).toFixed(3) : "(n/a)"}\n`
        )
        for (const s of r?.debugSamples || []) {
          process.stdout.write(
            `  hit=${s.hit} hitDist=${s.hitDist ?? "(null)"} dist=${s.dist} eps=${s.eps ?? "(null)"} visible=${
              s.visible ?? "(null)"
            }\n`
          )
        }
      }

      // If almost nothing is front-facing, skip the whole layer for this frame.
      if (triTested > 0 && triFront / triTested < 0.12) continue
      // If most sampled points are occluded by other geometry, skip the whole layer.
      const minVisTested = Math.min(10, Math.max(3, triFront))
      if (visTested >= minVisTested && visPassed / visTested < 0.08) continue

      if (pts.length < 3) continue
      const hull = convexHull(pts)
      const d = pathFromHull(hull)
      if (d) perLayer[layerName] = { d, hull }
    }

    snapSharedHorizontalEdge(perLayer, "kondygnacja_01", "kondygnacja_02") // TODO delete
    snapSharedHorizontalEdge(perLayer, "kondygnacja_02", "kondygnacja_03") // TODO delete

    frames[String(i)] = perLayer
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        width: w,
        height: h,
        generatedAt: new Date().toISOString(),
        mode: "fbx",
        frameCount: cameras.length,
        cameras: cameraMeta,
        frames
      },
      null,
      2
    ) + "\n",
    "utf8"
  )

  process.stdout.write(`Wrote ${outPath}\n`)
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n")
  process.exit(1)
})
