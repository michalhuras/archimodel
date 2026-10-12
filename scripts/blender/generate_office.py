"""
Generates a simple 3-storey office building in Blender, renders a 32-frame turntable
and exports OBJ (geometry) + FBX (cameras) compatible with precompute-layer-overlays.mjs.

Usage:
  blender -b -P scripts/blender/generate_office.py -- --out data/biurowiec [--samples 64] [--device CUDA|OPTIX|CPU] [--noRender]

Conventions expected by the overlay pipeline:
  * each storey is a separate object named kondygnacja_NN (everything else is an occluder),
    containing only its glazing volume (no overhangs, no far-facade details like mullions),
  * cameras are exported to FBX as empties Corona_CameraNNN + Corona_CameraNNNTarget,
  * frame i of the turntable is rendered from camera i+1.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

# --- Parameters -------------------------------------------------------------

FLOORS = [4.2, 3.6, 3.6]  # storey heights in metres (ground floor first)
WIDTH = 40.0  # X
DEPTH = 20.0  # Y
SLAB = 0.35  # visible slab band thickness
SLAB_OVERHANG = 0.25
GLASS_INSET = 0.3
MULLION_SPACING = 2.5
MULLION_SIZE = 0.12
PARAPET = 1.0

FRAMES = 32
FOV_DEG = 40.0
CAM_DISTANCE = 72.0
CAM_HEIGHT = 16.0
TARGET_Z = 6.0
RESOLUTION = 1280


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = {"out": "data/biurowiec", "samples": 64, "device": None, "render": True}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--out":
            args["out"] = argv[i + 1]
            i += 1
        elif a == "--samples":
            args["samples"] = int(argv[i + 1])
            i += 1
        elif a == "--device":
            args["device"] = argv[i + 1].upper()
            i += 1
        elif a == "--noRender":
            args["render"] = False
        i += 1
    return args


# --- Scene helpers ------------------------------------------------------------


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    return scene


def make_material(name, color, roughness=0.5, metallic=0.0, coat=0.0):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
    mat.diffuse_color = (*color, 1.0)
    return mat


def add_box(bm, center, size, mat_index):
    """Adds an axis-aligned box to a bmesh."""
    res = bmesh.ops.create_cube(bm, size=1.0)
    verts = res["verts"]
    bmesh.ops.scale(bm, vec=Vector(size), verts=verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=verts)
    for f in {f for v in verts for f in v.link_faces}:
        f.material_index = mat_index


def mesh_object(name, build, materials):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    build(bm)
    bm.to_mesh(mesh)
    bm.free()
    for m in materials:
        mesh.materials.append(m)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mullion_positions(length):
    count = int(length // MULLION_SPACING)
    step = length / count
    return [-length / 2 + step * i for i in range(count + 1)]


# --- Building -----------------------------------------------------------------


def build_storey(index, z0, height, mats):
    """Glazed storey: inset glass box with a slab band on top.

    The overlay script projects every camera-facing triangle of a layer, so the
    layer object holds only the glass volume, running the full storey height
    (its top is hidden inside the slab). This keeps the outline vertical along
    the glazing and makes consecutive storeys meet without gaps. The overhanging
    slab and the mullions (which would also add far-facade points) are separate
    occluder objects.
    """
    gw = WIDTH - 2 * GLASS_INSET
    gd = DEPTH - 2 * GLASS_INSET
    glass_h = height - SLAB
    # Slightly below the slab top to avoid coplanar faces (z-fighting on the roof).
    volume_h = height - 0.01

    def storey(bm):
        add_box(bm, (0, 0, z0 + volume_h / 2), (gw, gd, volume_h), 0)

    def slab(bm):
        add_box(
            bm,
            (0, 0, z0 + glass_h + SLAB / 2),
            (WIDTH + 2 * SLAB_OVERHANG, DEPTH + 2 * SLAB_OVERHANG, SLAB),
            0,
        )

    def mullions(bm):
        mz = z0 + glass_h / 2
        for x in mullion_positions(gw):
            for y in (-gd / 2, gd / 2):
                add_box(bm, (x, y, mz), (MULLION_SIZE, MULLION_SIZE * 2, glass_h), 0)
        for y in mullion_positions(gd)[1:-1]:
            for x in (-gw / 2, gw / 2):
                add_box(bm, (x, y, mz), (MULLION_SIZE * 2, MULLION_SIZE, glass_h), 0)

    # Name must not contain "kondygnacja_NN" (layer lookup matches by substring).
    mesh_object(f"slupki_k{index:02d}", mullions, [mats["frame"]])
    mesh_object(f"strop_k{index:02d}", slab, [mats["concrete"]])
    return mesh_object(f"kondygnacja_{index:02d}", storey, [mats["glass"]])


def build_building(mats):
    z = 0.0
    for i, h in enumerate(FLOORS, start=1):
        build_storey(i, z, h, mats)
        z += h
    top = z

    def roof(bm):
        t = 0.2
        w = WIDTH + 2 * SLAB_OVERHANG
        d = DEPTH + 2 * SLAB_OVERHANG
        zc = top + PARAPET / 2
        add_box(bm, (0, d / 2 - t / 2, zc), (w, t, PARAPET), 0)
        add_box(bm, (0, -d / 2 + t / 2, zc), (w, t, PARAPET), 0)
        add_box(bm, (w / 2 - t / 2, 0, zc), (t, d, PARAPET), 0)
        add_box(bm, (-w / 2 + t / 2, 0, zc), (t, d, PARAPET), 0)
        # Rooftop technical box (stairs / HVAC)
        add_box(bm, (8.0, 2.0, top + 1.5), (9.0, 6.0, 3.0), 1)

    mesh_object("dach", roof, [mats["concrete"], mats["metal"]])

    def canopy(bm):
        add_box(bm, (0, -DEPTH / 2 - 2.0, 3.4), (10.0, 4.0, 0.25), 0)
        for x in (-4.6, 4.6):
            add_box(bm, (x, -DEPTH / 2 - 3.8, 1.65), (0.2, 0.2, 3.3), 0)

    mesh_object("zadaszenie_wejscia", canopy, [mats["frame"]])

    def ground(bm):
        add_box(bm, (0, 0, -0.05), (400.0, 400.0, 0.1), 0)
        add_box(bm, (0, 0, 0.02), (WIDTH + 12, DEPTH + 16, 0.04), 1)

    mesh_object("teren", ground, [mats["grass"], mats["paving"]])


# --- Cameras / lights / world -------------------------------------------------


def camera_positions():
    """Blender (Z-up) positions. Matches the original turntable order:
    frame 0 looks from -X, then rotates through -Z(three.js) = +Y(Blender)."""
    out = []
    for i in range(FRAMES):
        a = 2 * math.pi * i / FRAMES
        out.append(Vector((-CAM_DISTANCE * math.cos(a), CAM_DISTANCE * math.sin(a), CAM_HEIGHT)))
    return out


def setup_cameras(scene):
    target_pos = Vector((0, 0, TARGET_Z))
    cams = []
    for i, pos in enumerate(camera_positions(), start=1):
        base = f"Corona_Camera{i:03d}"

        target = bpy.data.objects.new(f"{base}Target", None)
        target.location = target_pos
        scene.collection.objects.link(target)

        marker = bpy.data.objects.new(base, None)
        marker.location = pos
        scene.collection.objects.link(marker)

        cam_data = bpy.data.cameras.new(f"render_cam_{i:02d}")
        cam_data.lens_unit = "FOV"
        cam_data.sensor_fit = "VERTICAL"
        cam_data.angle = math.radians(FOV_DEG)
        cam_data.clip_start = 0.1
        cam_data.clip_end = 2000
        cam = bpy.data.objects.new(f"render_cam_{i:02d}", cam_data)
        cam.location = pos
        cam.rotation_euler = (target_pos - pos).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(cam)
        cams.append(cam)
    return cams


def setup_lighting(scene):
    sun_data = bpy.data.lights.new("slonce", type="SUN")
    sun_data.energy = 3.5
    sun_data.angle = math.radians(1.5)
    sun = bpy.data.objects.new("slonce", sun_data)
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    scene.collection.objects.link(sun)

    world = bpy.data.worlds.new("niebo")
    scene.world = world
    try:
        world.use_nodes = True
    except AttributeError:
        pass
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    bg = nodes.get("Background")
    bg.inputs["Strength"].default_value = 1.0
    # Vertical gradient: pale horizon -> deeper blue zenith (also gives the glass something to reflect).
    coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.82, 0.86, 0.9, 1)
    ramp.color_ramp.elements[1].position = 0.6
    ramp.color_ramp.elements[1].color = (0.25, 0.45, 0.75, 1)
    links.new(coord.outputs["Generated"], sep.inputs[0])
    links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bg.inputs["Color"])


def setup_render(scene, samples, device=None):
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = RESOLUTION
    scene.render.resolution_y = RESOLUTION
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 88
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True

    prefs = bpy.context.preferences.addons["cycles"].preferences
    # CUDA first: OptiX kernels can fail to compile with some driver versions.
    backends = (device,) if device else ("CUDA", "OPTIX", "HIP", "ONEAPI", "METAL")
    if device == "CPU":
        backends = ()
    for backend in backends:
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == backend]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == backend
                scene.cycles.device = "GPU"
                print(f"Cycles device: GPU ({backend})")
                return
        except TypeError:
            continue
    scene.cycles.device = "CPU"
    print("Cycles device: CPU")


# --- Export -------------------------------------------------------------------


def export_obj(path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.context.scene.objects:
        o.select_set(o.type == "MESH")
    bpy.ops.wm.obj_export(
        filepath=path,
        export_selected_objects=True,
        forward_axis="NEGATIVE_Z",
        up_axis="Y",
        export_materials=True,
        export_uv=False,
    )


def export_fbx(path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.context.scene.objects:
        o.select_set(o.type == "EMPTY" and o.name.startswith("Corona_Camera"))
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=True,
        object_types={"EMPTY"},
        axis_forward="-Z",
        axis_up="Y",
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_ALL",
        bake_space_transform=True,
    )


def main():
    args = parse_args()
    out_dir = os.path.abspath(args["out"])
    os.makedirs(os.path.join(out_dir, "render_webp"), exist_ok=True)

    scene = reset_scene()
    mats = {
        "glass": make_material("szklo", (0.05, 0.09, 0.12), roughness=0.04, coat=0.6),
        "concrete": make_material("beton", (0.78, 0.77, 0.74), roughness=0.8),
        "frame": make_material("rama", (0.12, 0.12, 0.13), roughness=0.35, metallic=1.0),
        "metal": make_material("blacha", (0.55, 0.56, 0.58), roughness=0.4, metallic=1.0),
        "grass": make_material("trawa", (0.18, 0.3, 0.12), roughness=0.95),
        "paving": make_material("chodnik", (0.55, 0.54, 0.52), roughness=0.9),
    }

    build_building(mats)
    cams = setup_cameras(scene)
    setup_lighting(scene)
    setup_render(scene, args["samples"], args["device"])

    export_obj(os.path.join(out_dir, "biurowiec.obj"))
    export_fbx(os.path.join(out_dir, "biurowiec-kamery.fbx"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "biurowiec.blend"))

    if args["render"]:
        for i, cam in enumerate(cams, start=1):
            scene.camera = cam
            scene.render.filepath = os.path.join(out_dir, "render_webp", f"render {i:02d}.webp")
            bpy.ops.render.render(write_still=True)
            print(f"Rendered frame {i}/{len(cams)}")

    print(f"Done: {out_dir}")


if __name__ == "__main__":
    main()
