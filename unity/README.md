# Chair GP – Unity Setup Guide

## What you need
| Tool | Version | Download |
|---|---|---|
| Unity Hub | Latest | unityhub://download |
| Unity Editor | **Unity 6 LTS (6000.0.x)** | Via Unity Hub → LTS tab |
| WebGL Build Support | (module) | Install alongside Unity |

---

## Step 1 – Install Unity Hub + Editor

1. Go to **https://unity.com/download** → Download Unity Hub
2. Open Unity Hub → **Installs** tab → **Install Editor** → click the **LTS** filter
3. Click the **LTS** tab → select **Unity 6 (6000.0.x)** — pick the highest 6000.0.x number shown
4. On the modules screen, tick:
   - ✅ **WebGL Build Support**
   - ✅ **Windows Build Support** (optional, for desktop testing)
5. Click Install (≈ 4 GB download)

---

## Step 2 – Open the project

1. Clone this repo (or it's already cloned)
2. Unity Hub → **Projects** → **Add** → browse to `unity/ChairGP/`
3. Unity will detect **2022.3.21f1** and open it
4. First open takes 2–5 minutes (importing packages)

---

## Step 3 – Configure URP (Universal Render Pipeline)

This is done **once** after first open:

1. `Edit` → `Project Settings` → `Graphics`
2. Under **Scriptable Render Pipeline Settings**, click the dot → select **UniversalRenderPipelineAsset**
   - If none exists: `Assets` → `Create` → `Rendering` → `URP Asset (with Universal Renderer)`
   - Assign it in Project Settings → Graphics
3. `Edit` → `Project Settings` → `Quality`
   - Set all quality levels to use your URP asset
4. `Edit` → `Project Settings` → `Player` → `WebGL` tab
   - Set **Color Space** to **Linear**
   - Set **Compression Format** to **Disabled** (for GitHub Pages compatibility)

---

## Step 4 – Build the race scene

1. In the top menu bar you'll see: **ChairGP ▶**
2. Click **ChairGP → Build Scene → Track 0 – Cubicle Canyon** (or 1/2)
3. A dialog will confirm: *"Track 0 built successfully!"*
4. Press **Play** in the editor to test it immediately

> **What gets built automatically:**
> - Full office environment (floor, walls, windows, ceiling grid)
> - All furniture: cubicle panels, desks with monitors, bookshelves with books, reception desk, coffee station, vending machine, printer, coat racks, plants, clocks, posters, noticeboards, fire extinguishers, trash bins, water coolers
> - Track road mesh with asphalt surface, dashed centre line, edge lines, red/white barriers
> - Start/finish chequered line
> - Player chair with animated office worker (legs kick/scoot)
> - AI opponent with rubber-band speed
> - Follow camera (Mario Kart style, FOV boost at speed)
> - Post-processing: bloom on lights, SSAO, ACES tone mapping, vignette, contrast
> - Checkpoints and lap system
> - Point lights at every fluorescent fixture and chandelier

---

## Step 5 – Set up the UI Canvas (one-time manual step)

Unity UI requires a Canvas component that can't be fully scripted from an Editor script. Do this once after building:

1. `GameObject` → `UI` → `Canvas` → name it **HUDCanvas**
   - Canvas Scaler: **Scale with Screen Size**, Reference 1920×1080
2. Add these child UI elements (right-click Canvas → UI):

| Element | Name | Component | Notes |
|---|---|---|---|
| TextMeshPro | LapText | TextMeshProUGUI | Top-left |
| TextMeshPro | TimeText | TextMeshProUGUI | Top-centre |
| TextMeshPro | BestLapText | TextMeshProUGUI | Top-right |
| TextMeshPro | SpeedText | TextMeshProUGUI | Bottom-centre |
| Slider | SpeedBar | Slider | Width: 160, bottom |
| TextMeshPro | PositionText | TextMeshProUGUI | Bottom-left, size 48 |
| TextMeshPro | OffRoadText | TextMeshProUGUI | Middle screen, red, hidden by default |
| TextMeshPro | CountdownText | TextMeshProUGUI | Centre screen, size 120 |

3. Create a **Panel** named **FinishPanel** (hidden by default) with:
   - TextMeshPro: FinishEmojiText (size 80)
   - TextMeshPro: FinishTitleText (size 48)
   - TextMeshPro: FinishTimeText (size 28)
   - Button: "Race Again" → calls `GameManager.RestartRace()`
   - Button: "Menu" → calls `GameManager.BackToMenu()`

4. Find the **HUDController** GameObject in Hierarchy
5. Drag all the above UI elements into the corresponding slots in **HUDController**'s Inspector

---

## Step 6 – Export to WebGL

1. `File` → `Build Settings`
2. Platform: **WebGL** → Switch Platform
3. Click **Add Open Scenes** (make sure your scene is listed)
4. `Player Settings`:
   - Product Name: **Chair GP**
   - WebGL Template: **Default**
   - Memory Size: **512 MB**
5. Click **Build** → choose output folder (e.g. `unity/WebGL-Build/`)
6. Copy the contents of `WebGL-Build/` into the repo root (replacing `index.html`, `js/` etc.)
7. `git add -A && git commit -m "Unity WebGL build" && git push`
8. GitHub Pages will serve it at: `https://clawdiabott.github.io/Claude-game-/`

---

## Controls

| Key | Action |
|---|---|
| W / ↑ | Accelerate |
| S / ↓ | Reverse |
| A / ← | Steer left |
| D / → | Steer right |
| Space | Brake |
| R | Reset position |

---

## Upgrading visuals further (optional)

Once the base game is working you can massively improve visuals by:

1. **Unity Asset Store** → search "Office Interior" (many free packs)
   - Replace procedural desk boxes with real GLTF models
   - Procedural shapes still work as collision proxies
2. **Shader Graph** → create a custom road shader with normal maps + wetness
3. **HDRP** (High Definition Render Pipeline) for ray-traced reflections
   - Switch via `Edit → Render Pipeline → Upgrade to HDRP`
   - Requires a mid-high-end GPU
4. **Cinemachine** (already in packages) → replace ChairCameraRig with a Cinemachine FreeLook or Dolly camera for more cinematic shots
5. **Unity Animation Rigging** → replace manual leg rotation with full IK-solved legs that plant feet on the floor correctly

---

## File map

```
unity/ChairGP/
  Assets/
    Scripts/
      Game/
        GameManager.cs      – singleton state machine
        RaceManager.cs      – laps, checkpoints, timing
        Checkpoint.cs       – trigger volume, notifies RaceManager
      Player/
        ChairController.cs  – Rigidbody physics, WASD input
        LegAnimator.cs      – animates thigh/shin/foot transforms
        ChairCameraRig.cs   – smooth follow camera, FOV boost
      AI/
        AIController.cs     – waypoint follower + rubber-band speed
      UI/
        HUDController.cs    – updates all HUD elements
    Editor/
      SceneBuilder.cs       – builds the entire scene from one menu click
  Packages/
    manifest.json           – URP, TextMeshPro, Cinemachine, Input System
  ProjectSettings/
    ProjectVersion.txt      – Unity 2022.3.21f1
```
