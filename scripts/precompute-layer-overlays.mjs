import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

import * as THREE from "three"
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js"

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

function projectLayerPoints({ nodes, camera, w, h }) {
  const pts = []

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

        const facing = Math.abs(n.dot(camDir))
        if (facing < 0.25) continue

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

  return pts
}

function parseArgs(argv) {
  const args = {
    model: null,
    apartments: null,
    out: null,
    step: 5,
    width: 1100,
    height: 520
  }

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--model") args.model = argv[++i]
    else if (a === "--apartments") args.apartments = argv[++i]
    else if (a === "--out") args.out = argv[++i]
    else if (a === "--step") args.step = Number(argv[++i])
    else if (a === "--width") args.width = Number(argv[++i])
    else if (a === "--height") args.height = Number(argv[++i])
  }

  return args
}

async function main() {
  const args = parseArgs(process.argv)

  const repoRoot = path.join(__dirname, "..")
  const modelPath = path.resolve(repoRoot, args.model || path.join("data", "paczka - makieta 3d", "test-makieta-obj.obj"))
  const apartmentsPath = path.resolve(repoRoot, args.apartments || path.join("netlify", "functions", "apartments.json"))
  const outPath = path.resolve(repoRoot, args.out || path.join("netlify", "functions", "layer-overlays.json"))

  const w = Number.isFinite(args.width) && args.width > 0 ? args.width : 1100
  const h = Number.isFinite(args.height) && args.height > 0 ? args.height : 520
  const step = Number.isFinite(args.step) && args.step > 0 ? args.step : 5

  const apartments = JSON.parse(fs.readFileSync(apartmentsPath, "utf8"))
  const layerNames = [...new Set((Array.isArray(apartments) ? apartments : []).map((a) => normalizeName(a?.layer_name)).filter(Boolean))]

  const objText = fs.readFileSync(modelPath, "utf8")
  const loader = new OBJLoader()
  const root = loader.parse(objText)

  root.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())

  const maxDim = Math.max(size.x, size.y, size.z) || 1

  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000)

  const fov = camera.fov * (Math.PI / 180)
  const dist = (maxDim / 2) / Math.tan(fov / 2)

  const target = center
  const baseOffset = new THREE.Vector3(dist * 1.2, dist * 0.7, dist * 1.2)

  camera.near = Math.max(0.1, dist / 100)
  camera.far = Math.max(5000, dist * 10)
  camera.updateProjectionMatrix()

  const layers = new Map()
  for (const ln of layerNames) {
    const nodes = findLayerNodes(root, ln)
    if (nodes.length) layers.set(ln, nodes)
  }

  const angles = {}
  for (let deg = 0; deg < 360; deg += step) {
    const rad = (deg * Math.PI) / 180
    const offset = baseOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rad)
    camera.position.copy(target).add(offset)
    camera.lookAt(target)
    camera.updateMatrixWorld(true)

    root.updateMatrixWorld(true)

    const perLayer = {}
    for (const [layerName, nodes] of layers.entries()) {
      const pts = projectLayerPoints({ nodes, camera, w, h })
      if (pts.length < 3) continue
      const hull = convexHull(pts)
      const d = pathFromHull(hull)
      if (d) perLayer[layerName] = { d, hull }
    }

    angles[String(deg)] = perLayer
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        width: w,
        height: h,
        stepDeg: step,
        generatedAt: new Date().toISOString(),
        angles
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
