// Unity Editor script – builds the full ChairGP scene from code.
// Menu: ChairGP ▶ Build Scene (Track 0/1/2)
// Run this ONCE per scene. It creates all GameObjects, materials, lighting,
// post-processing, UI canvas, player, AI, checkpoints, and office deco.

#if UNITY_EDITOR
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

public static class SceneBuilder
{
    // ── Entry points ──────────────────────────────────────────────────────────
    [MenuItem("ChairGP/Build Scene/Track 0 – Cubicle Canyon")]
    static void BuildTrack0() => Build(0);

    [MenuItem("ChairGP/Build Scene/Track 1 – Open Office Chaos")]
    static void BuildTrack1() => Build(1);

    [MenuItem("ChairGP/Build Scene/Track 2 – Executive Suite")]
    static void BuildTrack2() => Build(2);

    // ── Master builder ────────────────────────────────────────────────────────
    static void Build(int trackIndex)
    {
        // Clear existing scene objects except Camera/EventSystem
        foreach (var obj in Object.FindObjectsOfType<GameObject>())
        {
            if (obj.name is "Main Camera" or "EventSystem" or "Directional Light") continue;
            Object.DestroyImmediate(obj);
        }

        SetupLighting(trackIndex);
        SetupPostProcessing(trackIndex);

        Vector3 startPos;
        List<Vector3> cpPositions;
        switch (trackIndex)
        {
            case 1:  (startPos, cpPositions) = BuildOpenOffice();   break;
            case 2:  (startPos, cpPositions) = BuildExecutiveSuite(); break;
            default: (startPos, cpPositions) = BuildCubicleCanyon(); break;
        }

        SpawnRacers(startPos, cpPositions);
        BuildCheckpoints(cpPositions);
        SetupCamera();
        SetupGameSystems(trackIndex);
        BuildUI();

        EditorUtility.DisplayDialog("ChairGP", $"Track {trackIndex} built successfully!\nPress Play to race.", "OK");
    }

    // ── Lighting ──────────────────────────────────────────────────────────────
    static void SetupLighting(int track)
    {
        RenderSettings.ambientMode = AmbientMode.Trilight;
        RenderSettings.ambientSkyColor     = new Color(0.88f, 0.90f, 0.85f);
        RenderSettings.ambientEquatorColor = new Color(0.72f, 0.70f, 0.68f);
        RenderSettings.ambientGroundColor  = new Color(0.28f, 0.28f, 0.32f);

        if (track == 2) // Executive – warmer, dimmer
        {
            RenderSettings.ambientSkyColor     = new Color(0.55f, 0.45f, 0.35f);
            RenderSettings.ambientEquatorColor = new Color(0.38f, 0.30f, 0.22f);
            RenderSettings.ambientGroundColor  = new Color(0.12f, 0.10f, 0.08f);
            RenderSettings.fogColor   = new Color(0.14f, 0.11f, 0.09f);
            RenderSettings.fogDensity = 0.022f;
        }
        else
        {
            RenderSettings.fogColor   = new Color(0.87f, 0.90f, 0.88f);
            RenderSettings.fogDensity = 0.012f;
        }
        RenderSettings.fog     = true;
        RenderSettings.fogMode = FogMode.ExponentialSquared;

        // Directional light (sun/overhead)
        var sun = new GameObject("Sun").AddComponent<Light>();
        sun.type      = LightType.Directional;
        sun.intensity = track == 2 ? 0.55f : 0.88f;
        sun.color     = track == 2 ? new Color(1f, 0.88f, 0.68f) : new Color(1f, 0.97f, 0.90f);
        sun.shadows   = LightShadows.Soft;
        sun.shadowStrength = 0.75f;
        sun.transform.rotation = Quaternion.Euler(52f, -28f, 0f);
    }

    // ── Post-processing (URP Volume) ──────────────────────────────────────────
    static void SetupPostProcessing(int track)
    {
        var volGO = new GameObject("PostProcessVolume");
        var vol   = volGO.AddComponent<Volume>();
        vol.isGlobal = true;

        var profile = ScriptableObject.CreateInstance<VolumeProfile>();
        vol.profile = profile;

        // Bloom
        var bloom = profile.Add<Bloom>(true);
        bloom.threshold.Override(0.68f);
        bloom.intensity.Override(0.35f);
        bloom.scatter.Override(0.65f);

        // Color adjustments
        var ca = profile.Add<ColorAdjustments>(true);
        ca.contrast.Override(track == 2 ? 18f : 10f);
        ca.saturation.Override(track == 2 ? -8f : 4f);
        ca.postExposure.Override(0.08f);

        // Ambient Occlusion (SSAO)
        var ao = profile.Add<ScreenSpaceAmbientOcclusion>(true);
        ao.intensity.Override(0.8f);
        ao.radius.Override(0.35f);

        // Vignette
        var vig = profile.Add<Vignette>(true);
        vig.intensity.Override(0.28f);
        vig.smoothness.Override(0.5f);

        // Depth of field (subtle, only at low speeds – set by script at runtime)
        // Left disabled here; ChairCameraRig can enable it.

        // Tone mapping
        var tm = profile.Add<Tonemapping>(true);
        tm.mode.Override(TonemappingMode.ACES);
    }

    // ── Material helpers ──────────────────────────────────────────────────────
    static Material Lit(Color c, float smoothness = 0.25f, float metallic = 0f)
    {
        var m = new Material(Shader.Find("Universal Render Pipeline/Lit"));
        m.color = c;
        m.SetFloat("_Smoothness", smoothness);
        m.SetFloat("_Metallic", metallic);
        return m;
    }
    static Material Emissive(Color c, float intensity = 1.2f)
    {
        var m = Lit(c);
        m.EnableKeyword("_EMISSION");
        m.SetColor("_EmissionColor", c * intensity);
        return m;
    }
    static Color C(float r, float g, float b) => new(r, g, b);

    // ── Primitive helpers ─────────────────────────────────────────────────────
    static GameObject Box(string name, Vector3 pos, Vector3 scale, Material mat, Transform parent = null)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = name;
        go.transform.SetParent(parent);
        go.transform.position = pos;
        go.transform.localScale = scale;
        go.GetComponent<Renderer>().sharedMaterial = mat;
        go.isStatic = true;
        return go;
    }
    static GameObject Cyl(string name, Vector3 pos, Vector3 scale, Material mat, Transform parent = null)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        go.name = name;
        go.transform.SetParent(parent);
        go.transform.position = pos;
        go.transform.localScale = scale;
        go.GetComponent<Renderer>().sharedMaterial = mat;
        go.isStatic = true;
        return go;
    }
    static GameObject Sph(string name, Vector3 pos, float dia, Material mat, Transform parent = null)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        go.name = name;
        go.transform.SetParent(parent);
        go.transform.position = pos;
        go.transform.localScale = Vector3.one * dia;
        go.GetComponent<Renderer>().sharedMaterial = mat;
        go.isStatic = true;
        return go;
    }

    // ── Fluorescent light fixture ─────────────────────────────────────────────
    static void FluorescentLight(float x, float z, float height, Transform parent)
    {
        var mat   = Emissive(new Color(1f, 0.97f, 0.88f));
        var matBk = Lit(C(0.25f, 0.25f, 0.25f), 0.4f, 0.5f);

        Box("LightHousing", new Vector3(x, height, z), new Vector3(0.22f, 0.05f, 1.5f), matBk, parent);
        Box("LightTube",    new Vector3(x, height - 0.02f, z), new Vector3(0.13f, 0.04f, 1.38f), mat, parent);

        var wire = Cyl("Wire", new Vector3(x, height + 0.28f, z), new Vector3(0.015f, 0.55f, 0.015f), Lit(C(0.1f,0.1f,0.1f)));
        wire.transform.SetParent(parent);

        var pl  = new GameObject("PointLight");
        pl.transform.SetParent(parent);
        pl.transform.position = new Vector3(x, height - 0.3f, z);
        var lt  = pl.AddComponent<Light>();
        lt.type      = LightType.Point;
        lt.intensity = 1.8f;
        lt.range     = 11f;
        lt.color     = new Color(1f, 0.97f, 0.88f);
        lt.shadows   = LightShadows.None; // keep perf reasonable
    }

    // ── Chandelier ────────────────────────────────────────────────────────────
    static void Chandelier(float x, float z, float height, Transform parent)
    {
        var goldMat    = Lit(C(0.83f, 0.67f, 0.2f), 0.85f, 0.9f);
        var crystalMat = Lit(C(0.88f, 0.94f, 1.0f), 0.95f, 0.0f);

        Cyl("Chain", new Vector3(x, height - 1.0f, z), new Vector3(0.025f, 2.0f, 0.025f), goldMat, parent);
        var bowl = Sph("Bowl", new Vector3(x, height - 2.2f, z), 1.1f, crystalMat, parent);
        bowl.transform.localScale = new Vector3(1.1f, 0.5f, 1.1f);

        // Crystal drops
        for (int i = 0; i < 8; i++)
        {
            float a = i / 8f * Mathf.PI * 2f;
            Box($"Drop{i}", new Vector3(x + Mathf.Sin(a) * 0.44f, height - 2.5f, z + Mathf.Cos(a) * 0.44f),
                new Vector3(0.03f, 0.22f, 0.03f), crystalMat, parent);
        }

        var pl  = new GameObject("ChandelierLight");
        pl.transform.SetParent(parent);
        pl.transform.position = new Vector3(x, height - 2.0f, z);
        var lt  = pl.AddComponent<Light>();
        lt.type = LightType.Point; lt.intensity = 2.2f; lt.range = 22f;
        lt.color = new Color(1f, 0.88f, 0.70f); lt.shadows = LightShadows.Soft;
    }

    // ── Office desk ───────────────────────────────────────────────────────────
    static void OfficeDesk(float x, float z, float ry, Transform parent)
    {
        var wood  = Lit(C(0.55f, 0.42f, 0.28f), 0.35f);
        var metal = Lit(C(0.6f, 0.6f, 0.6f), 0.55f, 0.7f);
        var black = Lit(C(0.06f, 0.06f, 0.08f), 0.45f, 0.4f);
        var scr   = Emissive(C(0.05f, 0.32f, 0.55f), 0.8f);

        var g = new GameObject("Desk"); g.transform.SetParent(parent);
        g.transform.position = new Vector3(x, 0, z);
        g.transform.rotation = Quaternion.Euler(0, ry, 0);

        Box("Top",    new Vector3(0, 0.78f, 0),     new Vector3(1.6f, 0.05f, 0.82f), wood, g.transform);
        Box("Front",  new Vector3(0, 0.39f, -0.38f), new Vector3(1.52f, 0.72f, 0.04f), wood, g.transform);
        foreach (float lx in new[]{-0.72f, 0.72f})
        {
            Box("Leg", new Vector3(lx, 0.38f, 0), new Vector3(0.05f, 0.78f, 0.05f), metal, g.transform);
        }
        Box("Monitor",new Vector3(0, 1.08f, -0.14f), new Vector3(0.6f, 0.42f, 0.04f), black, g.transform);
        Box("Screen", new Vector3(0, 1.08f, -0.13f), new Vector3(0.54f, 0.36f, 0.02f), scr,  g.transform);
        Box("Keyboard",new Vector3(0, 0.82f, 0.12f), new Vector3(0.42f, 0.02f, 0.17f), black, g.transform);
        Cyl("Mug",    new Vector3(0.55f, 0.88f, 0.1f), new Vector3(0.09f, 0.13f, 0.09f), Lit(C(0.75f,0.2f,0.2f)), g.transform);
    }

    // ── Cubicle wall panel ────────────────────────────────────────────────────
    static void CubicleWall(float x, float z, float w, float ry, Transform parent)
    {
        var fabric = Lit(C(0.44f, 0.47f, 0.52f), 0.05f);
        var frame  = Lit(C(0.50f, 0.46f, 0.42f), 0.2f, 0.1f);

        var g = new GameObject("CubicleWall"); g.transform.SetParent(parent);
        g.transform.position = new Vector3(x, 0, z);
        g.transform.rotation = Quaternion.Euler(0, ry, 0);

        Box("Panel", new Vector3(0, 0.78f, 0), new Vector3(w, 1.55f, 0.08f), fabric, g.transform);
        Box("TopRail",new Vector3(0, 1.58f, 0), new Vector3(w, 0.06f, 0.10f), frame, g.transform);
        Box("BotRail",new Vector3(0, 0.03f, 0), new Vector3(w, 0.06f, 0.10f), frame, g.transform);
        foreach (float px in new[]{-w*0.5f, w*0.5f})
            Box("Post", new Vector3(px, 0.8f, 0), new Vector3(0.06f, 1.62f, 0.10f), frame, g.transform);
    }

    // ── Filing cabinet ────────────────────────────────────────────────────────
    static void Cabinet(float x, float z, float ry, Transform parent)
    {
        var mat  = Lit(C(0.44f, 0.52f, 0.58f), 0.4f, 0.3f);
        var gold = Lit(C(0.75f, 0.68f, 0.22f), 0.8f, 0.8f);
        var g = new GameObject("Cabinet"); g.transform.SetParent(parent);
        g.transform.position = new Vector3(x, 0, z);
        g.transform.rotation = Quaternion.Euler(0, ry, 0);
        Box("Body",   new Vector3(0, 0.55f, 0), new Vector3(0.46f, 1.1f, 0.6f), mat, g.transform);
        foreach (float dy in new[]{-0.22f, 0.22f})
            Box("Handle", new Vector3(0, 0.55f + dy, -0.32f), new Vector3(0.12f, 0.025f, 0.06f), gold, g.transform);
    }

    // ── Bookshelf ─────────────────────────────────────────────────────────────
    static void Bookshelf(float x, float z, float ry, Transform parent)
    {
        var wood = Lit(C(0.50f, 0.38f, 0.25f), 0.35f);
        var g = new GameObject("Bookshelf"); g.transform.SetParent(parent);
        g.transform.position = new Vector3(x, 0, z);
        g.transform.rotation = Quaternion.Euler(0, ry, 0);

        Box("Back",  new Vector3(0, 1.05f,  0),   new Vector3(1.5f, 2.1f, 0.06f), wood, g.transform);
        Box("LSide", new Vector3(-0.72f,1.05f,0.15f), new Vector3(0.06f,2.1f,0.36f), wood, g.transform);
        Box("RSide", new Vector3( 0.72f,1.05f,0.15f), new Vector3(0.06f,2.1f,0.36f), wood, g.transform);
        foreach (float py in new[]{0f, 0.52f, 1.04f, 1.58f, 2.1f})
            Box("Shelf", new Vector3(0, py, 0.15f), new Vector3(1.44f, 0.04f, 0.36f), wood, g.transform);

        // Books
        Color[] bookCols = { C(0.7f,0.15f,0.15f), C(0.15f,0.4f,0.7f), C(0.2f,0.6f,0.25f),
                              C(0.65f,0.55f,0.12f), C(0.55f,0.18f,0.55f), C(0.15f,0.5f,0.5f) };
        for (int row = 0; row < 4; row++)
        {
            float bx = -0.62f;
            for (int b = 0; b < 7; b++)
            {
                float bw = 0.06f + (b % 3) * 0.022f;
                float bh = 0.38f + (b % 2) * 0.08f;
                Box($"Book{row}{b}",
                    new Vector3(bx + bw*0.5f, row*0.52f + bh*0.5f + 0.06f, 0.04f),
                    new Vector3(bw, bh, 0.28f),
                    Lit(bookCols[b % bookCols.Length], 0.1f), g.transform);
                bx += bw + 0.012f;
            }
        }
    }

    // ── Potted plant ──────────────────────────────────────────────────────────
    static void Plant(float x, float z, Transform parent)
    {
        Cyl("Pot",    new Vector3(x, 0.18f, z), new Vector3(0.30f, 0.36f, 0.30f), Lit(C(0.55f, 0.35f, 0.22f)), parent);
        Sph("Leaves", new Vector3(x, 0.72f, z), 0.72f, Lit(C(0.15f, 0.50f, 0.20f), 0.05f), parent);
    }

    // ── Water cooler ─────────────────────────────────────────────────────────
    static void WaterCooler(float x, float z, Transform parent)
    {
        Box("Body",   new Vector3(x, 0.5f,  z), new Vector3(0.38f, 1.0f, 0.38f), Lit(C(0.92f,0.92f,0.92f), 0.35f, 0.05f), parent);
        Cyl("Bottle", new Vector3(x, 1.3f,  z), new Vector3(0.28f, 0.55f, 0.28f), Lit(C(0.6f, 0.83f, 0.9f), 0.65f, 0.0f), parent);
    }

    // ── Reception desk ────────────────────────────────────────────────────────
    static void ReceptionDesk(float x, float z, float ry, Transform parent)
    {
        var wood = Lit(C(0.44f,0.34f,0.24f), 0.30f);
        var top  = Lit(C(0.82f,0.80f,0.76f), 0.45f, 0.1f);
        var scr  = Emissive(C(0.05f,0.3f,0.5f), 0.7f);

        var g = new GameObject("Reception"); g.transform.SetParent(parent);
        g.transform.position = new Vector3(x, 0, z);
        g.transform.rotation = Quaternion.Euler(0, ry, 0);
        Box("Front",  new Vector3(0, 0.52f,-0.5f), new Vector3(2.8f, 1.05f, 0.18f), wood, g.transform);
        Box("Left",   new Vector3(-1.31f,0.52f,0), new Vector3(0.18f,1.05f,1.0f),   wood, g.transform);
        Box("Right",  new Vector3( 1.31f,0.52f,0), new Vector3(0.18f,1.05f,1.0f),   wood, g.transform);
        Box("Counter",new Vector3(0, 1.08f, 0),   new Vector3(2.8f, 0.06f, 1.1f),   top,  g.transform);
        Box("Monitor",new Vector3(-0.7f,1.46f,-0.1f),new Vector3(0.55f,0.38f,0.04f),Lit(C(0.06f,0.06f,0.07f),0.45f,0.4f), g.transform);
        Box("Screen", new Vector3(-0.7f,1.46f,-0.09f),new Vector3(0.48f,0.32f,0.02f),scr, g.transform);
    }

    // ── Coffee station ────────────────────────────────────────────────────────
    static void CoffeeStation(float x, float z, float ry, Transform parent)
    {
        var wood  = Lit(C(0.5f,0.38f,0.25f), 0.3f);
        var black = Lit(C(0.07f,0.07f,0.09f), 0.4f, 0.3f);
        var glass = Lit(C(0.55f,0.75f,0.85f), 0.8f, 0f);

        var g = new GameObject("CoffeeStation"); g.transform.SetParent(parent);
        g.transform.position = new Vector3(x, 0, z);
        g.transform.rotation = Quaternion.Euler(0, ry, 0);

        Box("Counter", new Vector3(0, 0.43f, 0),   new Vector3(1.6f, 0.86f, 0.6f), wood, g.transform);
        Box("Countertop",new Vector3(0,0.88f,0),   new Vector3(1.62f,0.04f,0.62f), Lit(C(0.72f,0.68f,0.62f),0.45f,0.1f), g.transform);
        Box("Machine",  new Vector3(-0.5f,1.1f,-0.12f),new Vector3(0.3f,0.44f,0.28f), black, g.transform);
        Box("MachinTop",new Vector3(-0.5f,1.34f,-0.12f),new Vector3(0.28f,0.12f,0.26f),Lit(C(0.55f,0.22f,0.08f),0.2f), g.transform);
        Cyl("Cup",      new Vector3(-0.5f,0.95f,-0.15f),new Vector3(0.08f,0.11f,0.08f),Lit(C(0.95f,0.95f,0.95f)), g.transform);
        Box("Microwave",new Vector3( 0.4f,1.08f,-0.1f), new Vector3(0.52f,0.32f,0.34f),Lit(C(0.85f,0.85f,0.83f),0.35f,0.05f), g.transform);
        Box("MWDoor",   new Vector3( 0.3f,1.08f,-0.27f),new Vector3(0.36f,0.28f,0.02f),glass, g.transform);
    }

    // ── Vending machine ───────────────────────────────────────────────────────
    static void VendingMachine(float x, float z, float ry, Transform parent)
    {
        var glass = Lit(C(0.55f,0.75f,0.85f), 0.8f);
        var g = new GameObject("Vending"); g.transform.SetParent(parent);
        g.transform.position = new Vector3(x, 0, z);
        g.transform.rotation = Quaternion.Euler(0, ry, 0);
        Box("Body",  new Vector3(0, 0.875f, 0),   new Vector3(0.72f,1.75f,0.55f), Lit(C(0.12f,0.38f,0.18f),0.3f,0.1f), g.transform);
        Box("Glass", new Vector3(0, 1.08f, -0.28f),new Vector3(0.54f,1.0f, 0.04f),glass, g.transform);
        Box("Panel", new Vector3(0, 0.5f,  -0.28f),new Vector3(0.24f,0.36f,0.04f),Lit(C(0.18f,0.18f,0.22f),0.4f), g.transform);
    }

    // ── Printer ───────────────────────────────────────────────────────────────
    static void Printer(float x, float z, float ry, Transform parent)
    {
        var grey = Lit(C(0.88f,0.88f,0.86f), 0.35f, 0.05f);
        var g = new GameObject("Printer"); g.transform.SetParent(parent);
        g.transform.position = new Vector3(x, 0, z);
        g.transform.rotation = Quaternion.Euler(0, ry, 0);
        Box("Body", new Vector3(0,0.5f,0), new Vector3(0.7f,0.55f,0.55f), grey, g.transform);
        Box("Tray", new Vector3(0,0.35f,0.28f), new Vector3(0.5f,0.02f,0.38f), Lit(C(0.5f,0.5f,0.5f),0.3f), g.transform);
        Box("Panel",new Vector3(0.22f,0.65f,-0.28f), new Vector3(0.18f,0.12f,0.03f), Emissive(C(0.05f,0.25f,0.45f),0.6f), g.transform);
    }

    // ── Wall poster ───────────────────────────────────────────────────────────
    static void WallPoster(float x, float y, float z, float ry, float w, float h, Color col, Transform parent)
    {
        var frame = Lit(C(0.1f,0.1f,0.1f), 0.3f, 0.2f);
        var print = Lit(col, 0.1f);
        var g = new GameObject("Poster"); g.transform.SetParent(parent);
        g.transform.position = new Vector3(x, y, z);
        g.transform.rotation = Quaternion.Euler(0, ry, 0);
        Box("Frame", Vector3.zero, new Vector3(w+0.06f, h+0.06f, 0.04f), frame, g.transform);
        Box("Print", new Vector3(0,0,0.02f), new Vector3(w, h, 0.03f), print, g.transform);
    }

    // ── Wall clock ────────────────────────────────────────────────────────────
    static void WallClock(float x, float y, float z, float ry, Transform parent)
    {
        var face = Lit(C(0.96f,0.96f,0.94f), 0.1f);
        var rim  = Lit(C(0.12f,0.12f,0.12f), 0.5f, 0.4f);
        var g = new GameObject("Clock"); g.transform.SetParent(parent);
        g.transform.position = new Vector3(x, y, z);
        g.transform.rotation = Quaternion.Euler(0, ry, 0);
        Cyl("Face", Vector3.zero, new Vector3(0.38f, 0.04f, 0.38f), face, g.transform).transform.Rotate(90,0,0);
        Cyl("Rim",  Vector3.zero, new Vector3(0.42f, 0.05f, 0.42f), rim,  g.transform).transform.Rotate(90,0,0);
        Box("Hour",  new Vector3(0, 0.04f, 0), new Vector3(0.025f, 0.12f, 0.02f), Lit(C(0.1f,0.1f,0.1f)), g.transform);
        Box("Minute",new Vector3(0.04f, 0.04f, 0), new Vector3(0.018f,0.16f,0.02f), Lit(C(0.1f,0.1f,0.1f)), g.transform);
    }

    // ── Fire extinguisher ────────────────────────────────────────────────────
    static void FireExt(float x, float z, Transform parent)
    {
        var red  = Lit(C(0.8f,0.08f,0.06f), 0.3f, 0.15f);
        var grey = Lit(C(0.6f,0.6f,0.6f), 0.5f, 0.6f);
        Cyl("Body",   new Vector3(x,0.28f,z), new Vector3(0.16f,0.56f,0.16f), red,  parent);
        Cyl("Top",    new Vector3(x,0.60f,z), new Vector3(0.18f,0.06f,0.18f), grey, parent);
        Box("Nozzle", new Vector3(x+0.08f,0.68f,z), new Vector3(0.04f,0.04f,0.14f), grey, parent);
    }

    // ── Trash bin ────────────────────────────────────────────────────────────
    static void TrashBin(float x, float z, Transform parent)
    {
        Cyl("Bin", new Vector3(x,0.2f,z), new Vector3(0.28f,0.4f,0.28f), Lit(C(0.22f,0.22f,0.22f),0.2f), parent);
    }

    // ── Coat rack ────────────────────────────────────────────────────────────
    static void CoatRack(float x, float z, Transform parent)
    {
        Cyl("Pole",  new Vector3(x,0.85f,z), new Vector3(0.04f,1.7f,0.04f), Lit(C(0.35f,0.26f,0.18f),0.2f), parent);
        Cyl("Base",  new Vector3(x,0.025f,z),new Vector3(0.55f,0.05f,0.55f),Lit(C(0.28f,0.2f,0.14f), 0.2f), parent);
        Box("Jacket",new Vector3(x+0.05f,1.38f,z+0.05f),new Vector3(0.28f,0.38f,0.05f), Lit(C(0.14f,0.18f,0.44f)), parent);
    }

    // ── Noticeboard ──────────────────────────────────────────────────────────
    static void Noticeboard(float x, float y, float z, float ry, Transform parent)
    {
        var cork  = Lit(C(0.62f,0.44f,0.26f), 0.02f);
        var frame = Lit(C(0.35f,0.24f,0.13f), 0.2f);
        var g = new GameObject("Noticeboard"); g.transform.SetParent(parent);
        g.transform.position = new Vector3(x, y, z);
        g.transform.rotation = Quaternion.Euler(0, ry, 0);
        Box("Frame", Vector3.zero,         new Vector3(1.22f,0.82f,0.05f), frame, g.transform);
        Box("Board", new Vector3(0,0,0.02f),new Vector3(1.1f, 0.7f, 0.04f), cork,  g.transform);

        Color[] noteC = { C(0.9f,0.9f,0.2f), C(0.2f,0.72f,0.9f), C(0.9f,0.42f,0.2f), C(0.7f,0.9f,0.32f) };
        System.Random rng = new(x.GetHashCode());
        for (int i = 0; i < 5; i++)
        {
            float nx = (float)(rng.NextDouble() - 0.5) * 0.8f;
            float ny = (float)(rng.NextDouble() - 0.5) * 0.5f;
            var note = Box($"Note{i}", new Vector3(nx, ny, 0.05f), new Vector3(0.17f,0.13f,0.02f), Lit(noteC[i % noteC.Length]), g.transform);
            note.transform.Rotate(0, 0, (float)(rng.NextDouble() - 0.5) * 16f);
        }
    }

    // ── Road mesh from Catmull-Rom spline ────────────────────────────────────
    static GameObject BuildRoad(List<Vector3> rawPts, float width, Material roadMat, Material barrierRedMat, Material barrierWhtMat, Transform parent)
    {
        var smoothed = CatmullRom(rawPts, 12);
        int N = smoothed.Count;

        var verts  = new List<Vector3>();
        var tris   = new List<int>();
        var uvs    = new List<Vector2>();
        var normals= new List<Vector3>();

        for (int i = 0; i < N; i++)
        {
            Vector3 p    = smoothed[i];
            Vector3 next = smoothed[(i + 1) % N];
            Vector3 tang = (next - p); tang.y = 0;
            if (tang.sqrMagnitude < 0.0001f) tang.x = 0.001f;
            tang.Normalize();
            Vector3 right = new(tang.z, 0, -tang.x);

            verts.Add(p + right * (-width * 0.5f));
            verts.Add(p + right * ( width * 0.5f));
            uvs.Add(new Vector2(0, i * 0.2f));
            uvs.Add(new Vector2(1, i * 0.2f));
            normals.Add(Vector3.up); normals.Add(Vector3.up);

            if (i < N - 1)
            {
                int b = i * 2;
                tris.AddRange(new[]{ b, b+2, b+1, b+1, b+2, b+3 });
            }
        }
        int last = (N - 1) * 2;
        tris.AddRange(new[]{ last, 0, last+1, last+1, 0, 1 });

        var mesh = new Mesh { name = "Road" };
        mesh.SetVertices(verts); mesh.SetTriangles(tris, 0);
        mesh.SetUVs(0, uvs); mesh.SetNormals(normals);

        var go = new GameObject("Road");
        go.transform.SetParent(parent);
        var mf = go.AddComponent<MeshFilter>(); mf.sharedMesh = mesh;
        var mr = go.AddComponent<MeshRenderer>(); mr.sharedMaterial = roadMat;
        go.AddComponent<MeshCollider>().sharedMesh = mesh;

        // Barriers + road markings
        BuildBarriers(smoothed, width, barrierRedMat, barrierWhtMat, parent);
        BuildRoadMarkings(smoothed, width, parent);

        return go;
    }

    static void BuildBarriers(List<Vector3> pts, float w, Material red, Material wht, Transform parent)
    {
        int N = pts.Count;
        for (int i = 0; i < N; i += 4)
        {
            Vector3 p    = pts[i];
            Vector3 next = pts[Mathf.Min(i + 2, N - 1)];
            Vector3 mid  = (p + next) * 0.5f;
            Vector3 tang = (next - p); tang.y = 0; tang.Normalize();
            Vector3 right= new(tang.z, 0, -tang.x);
            float   len  = Vector3.Distance(p, next) + 0.05f;
            float   angle= Mathf.Atan2(tang.x, tang.z) * Mathf.Rad2Deg;

            Material mat = (i / 4) % 2 == 0 ? red : wht;
            float half = w * 0.5f + 0.42f;

            foreach (float side in new[]{-1f, 1f})
            {
                Vector3 bp = mid + right * (side * half);
                var bar = Box("Barrier", bp + Vector3.up * 0.28f, new Vector3(0.3f, 0.56f, len), mat, parent);
                bar.transform.rotation = Quaternion.Euler(0, angle, 0);
                bar.isStatic = true;
                // Add a collider so players bounce off
                bar.GetComponent<Collider>().isTrigger = false;
            }
        }
    }

    static void BuildRoadMarkings(List<Vector3> pts, float w, Transform parent)
    {
        var dashMat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
        dashMat.color = new Color(0.95f, 0.9f, 0.1f);
        var edgeMat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
        edgeMat.color = Color.white;

        int N = pts.Count;
        for (int i = 0; i < N; i += 6)
        {
            Vector3 p    = pts[i];
            Vector3 next = pts[Mathf.Min(i + 3, N - 1)];
            Vector3 mid  = (p + next) * 0.5f;
            Vector3 tang = (next - p); tang.y = 0; tang.Normalize();
            Vector3 right= new(tang.z, 0, -tang.x);
            float   len  = Vector3.Distance(p, next) + 0.01f;
            float   angle= Mathf.Atan2(tang.x, tang.z) * Mathf.Rad2Deg;

            var dash = Box("CenterDash", mid + Vector3.up * 0.01f, new Vector3(0.16f, 0.01f, len * 0.5f), dashMat, parent);
            dash.transform.rotation = Quaternion.Euler(0, angle, 0);

            foreach (float side in new[]{-1f, 1f})
            {
                Vector3 ep = mid + right * (side * (w * 0.5f - 0.25f));
                var el = Box("EdgeLine", ep + Vector3.up * 0.01f, new Vector3(0.12f, 0.01f, len * 1.05f), edgeMat, parent);
                el.transform.rotation = Quaternion.Euler(0, angle, 0);
            }
        }
    }

    static List<Vector3> CatmullRom(List<Vector3> pts, int subdiv)
    {
        var result = new List<Vector3>();
        int n = pts.Count;
        for (int i = 0; i < n; i++)
        {
            Vector3 p0 = pts[(i - 1 + n) % n];
            Vector3 p1 = pts[i];
            Vector3 p2 = pts[(i + 1) % n];
            Vector3 p3 = pts[(i + 2) % n];
            for (int j = 0; j < subdiv; j++)
            {
                float t = j / (float)subdiv;
                float t2 = t * t, t3 = t2 * t;
                result.Add(0.5f * ((2*p1) + (-p0+p2)*t + (2*p0-5*p1+4*p2-p3)*t2 + (-p0+3*p1-3*p2+p3)*t3));
            }
        }
        return result;
    }

    // ── Start / finish line ───────────────────────────────────────────────────
    static void StartFinishLine(float x, float z, float ry, Transform parent)
    {
        var wht = Lit(Color.white, 0.1f);
        var blk = Lit(Color.black, 0.1f);
        for (int i = -4; i <= 4; i++)
        {
            float ox = Mathf.Sin((ry + 90f) * Mathf.Deg2Rad) * i;
            float oz = Mathf.Cos((ry + 90f) * Mathf.Deg2Rad) * i;
            var tile = Box($"SFTile{i}", new Vector3(x + ox, 0.015f, z + oz), new Vector3(0.88f, 0.01f, 1.6f), i % 2 == 0 ? wht : blk, parent);
            tile.transform.rotation = Quaternion.Euler(0, ry, 0);
        }
    }

    // ── Walls & floor ─────────────────────────────────────────────────────────
    static void RoomShell(float minX, float maxX, float minZ, float maxZ, float wallH,
                          Material wallMat, Material winMat, Material floorMat, Material ceilMat, Transform parent)
    {
        float W = maxX - minX, D = maxZ - minZ, cx = (minX + maxX) / 2f, cz = (minZ + maxZ) / 2f;

        // Floor
        Box("Floor", new Vector3(cx, -0.05f, cz), new Vector3(W, 0.1f, D), floorMat, parent);
        // Ceiling (high enough to not clip)
        Box("Ceiling", new Vector3(cx, wallH, cz), new Vector3(W, 0.18f, D), ceilMat, parent);

        // N/S walls with window cutouts (faked with flanking boxes)
        foreach (float z in new[]{minZ, maxZ})
        {
            Box($"Wall_{z}", new Vector3(cx, wallH*0.5f, z), new Vector3(W, wallH, 0.35f), wallMat, parent);
            // Window overlay (glass strip)
            for (float wx = minX + 4; wx < maxX - 3; wx += 5.5f)
            {
                var win = Box($"Win_{z}_{wx}", new Vector3(wx, wallH * 0.52f, z + (z < 0 ? 0.2f : -0.2f)),
                              new Vector3(3.2f, wallH * 0.65f, 0.06f), winMat, parent);
            }
        }
        // E/W walls
        foreach (float x in new[]{minX, maxX})
            Box($"Wall_{x}", new Vector3(x, wallH*0.5f, cz), new Vector3(0.35f, wallH, D), wallMat, parent);

        // Baseboard trim
        var trim = Lit(C(0.72f,0.68f,0.60f), 0.2f);
        foreach ((float bx, float bz, bool horiz) in new[]{(cx,minZ,true),(cx,maxZ,true),(minX,cz,false),(maxX,cz,false)})
        {
            Box("Trim", new Vector3(bx, 0.06f, bz), horiz ? new Vector3(W,0.12f,0.06f) : new Vector3(0.06f,0.12f,D), trim, parent);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRACK 0 – CUBICLE CANYON
    // ─────────────────────────────────────────────────────────────────────────
    static (Vector3 start, List<Vector3> cps) BuildCubicleCanyon()
    {
        var env = new GameObject("Environment_CubicleCanyon");
        var T = env.transform;

        var wallMat  = Lit(C(0.91f, 0.90f, 0.88f), 0.1f);
        var winMat   = Lit(C(0.55f, 0.75f, 0.88f), 0.8f, 0.0f);
        var floorMat = Lit(C(0.88f, 0.88f, 0.86f), 0.3f, 0.05f);
        var ceilMat  = Lit(C(0.93f, 0.93f, 0.91f), 0.05f);
        var roadMat  = Lit(C(0.18f, 0.18f, 0.19f), 0.05f);
        var carpMat  = Lit(C(0.42f, 0.46f, 0.50f), 0.0f);

        RoomShell(-40, 40, -42, 42, 7.2f, wallMat, winMat, floorMat, ceilMat, T);
        Box("Carpet", new Vector3(0, 0.005f, 0), new Vector3(8, 0.01f, 84), carpMat, T);

        // Lights grid
        for (float lx = -28; lx <= 28; lx += 10) for (float lz = -38; lz <= 38; lz += 8) FluorescentLight(lx, lz, 6.8f, T);

        // Cubicle farms
        for (int row = 0; row < 3; row++) for (int col = 0; col < 5; col++)
        {
            float cx = -12 - row * 5.5f, cz = -20 + col * 10f;
            CubicleWall(cx + 1, cz, 3.5f, 0, T); CubicleWall(cx, cz + 1.75f, 3.5f, 90, T);
            OfficeDesk(cx - 0.6f, cz, 0, T);
            if (col % 2 == 0) TrashBin(cx - 1.5f, cz + 1.5f, T);
        }
        for (int row = 0; row < 3; row++) for (int col = 0; col < 5; col++)
        {
            float cx = 12 + row * 5.5f, cz = -20 + col * 10f;
            CubicleWall(cx - 1, cz, 3.5f, 0, T); CubicleWall(cx, cz + 1.75f, 3.5f, 90, T);
            OfficeDesk(cx + 0.6f, cz, 180, T);
            if (col % 3 == 0) Cabinet(cx + 1.5f, cz - 1, 0, T);
        }

        ReceptionDesk(0, -38.5f, 0, T);
        CoatRack(-4, -40, T); CoatRack(4, -40, T);
        CoffeeStation(34, 36, 90, T);
        VendingMachine(36, 30, -90, T);
        WaterCooler(36, 40, T); WaterCooler(-36, 40, T);
        Bookshelf(-2, -32, 0, T); Bookshelf(2, -32, 180, T); Bookshelf(-2, 32, 0, T); Bookshelf(2, 32, 180, T);
        Printer(-8, -38, 0, T); Printer(8, -38, 180, T); Printer(-8, 38, 0, T);
        foreach (var (px, pz) in new[]{(-36f,-40f),(36f,-40f),(-36f,40f),(36f,40f),(-36f,0f),(36f,0f),(-36f,-20f),(36f,20f)})
            Plant(px, pz, T);
        WallPoster(-25, 3.5f, -41.7f, 0, 1.4f, 0.9f, C(0.2f,0.45f,0.75f), T);
        WallPoster(  0, 3.5f, -41.7f, 0, 1.4f, 0.9f, C(0.6f,0.18f,0.18f), T);
        WallPoster( 25, 3.5f, -41.7f, 0, 1.4f, 0.9f, C(0.18f,0.5f,0.25f), T);
        Noticeboard(-15, 3.2f, -41.7f, 0, T); Noticeboard(15, 3.2f, -41.7f, 0, T);
        WallClock(-39.7f, 4.2f, -10, 90, T); WallClock(39.7f, 4.2f, 10, -90, T);
        foreach (var (ex, ez) in new[]{(-39f,35f),(-39f,-35f),(39f,35f),(39f,-35f)}) FireExt(ex, ez, T);

        // Track
        var rawPts = new List<Vector3> {
            new(0,0,-36), new(-28,0,-30), new(-30,0,-10), new(-30,0,10),
            new(-28,0,30), new(0,0,36),   new(28,0,30),   new(30,0,10),
            new(30,0,-10), new(28,0,-30)
        };
        BuildRoad(rawPts, 8, roadMat, Lit(C(0.85f,0.1f,0.1f),0.3f), Lit(Color.white,0.2f), T);
        StartFinishLine(0, -36, 0, T);

        return (new Vector3(0, 0, -34), rawPts);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRACK 1 – OPEN OFFICE CHAOS
    // ─────────────────────────────────────────────────────────────────────────
    static (Vector3 start, List<Vector3> cps) BuildOpenOffice()
    {
        var env = new GameObject("Environment_OpenOffice");
        var T = env.transform;

        var wallMat  = Lit(C(0.96f,0.95f,0.92f), 0.12f);
        var winMat   = Lit(C(0.6f, 0.80f, 0.90f), 0.82f, 0.0f);
        var floorMat = Lit(C(0.52f,0.52f,0.50f), 0.4f, 0.03f);
        var ceilMat  = Lit(C(0.93f,0.93f,0.91f), 0.05f);
        var roadMat  = Lit(C(0.18f,0.18f,0.19f), 0.05f);
        var ductMat  = Lit(C(0.44f,0.44f,0.46f), 0.5f, 0.6f);

        RoomShell(-45, 45, -50, 50, 7.2f, wallMat, winMat, floorMat, ceilMat, T);

        // Exposed ductwork
        for (float dx = -18; dx <= 18; dx += 18)
            Box("Duct", new Vector3(dx, 6.8f, 0), new Vector3(0.75f, 0.5f, 100f), ductMat, T);
        for (float dz = -40; dz <= 40; dz += 20)
            Box("DuctX", new Vector3(0, 6.9f, dz), new Vector3(90f, 0.4f, 0.6f), ductMat, T);

        for (float lx = -36; lx <= 36; lx += 9) for (float lz = -44; lz <= 44; lz += 9) FluorescentLight(lx, lz, 6.8f, T);

        float[] dxArr = {-18f,18f,-18f,18f,-18f,18f,-18f,18f,0f,0f,0f};
        float[] dzArr = {-30f,-30f,-10f,-10f,10f,10f,28f,28f,-18f,18f,0f};
        for (int i = 0; i < dxArr.Length; i++) OfficeDesk(dxArr[i], dzArr[i], i * 37f, T);

        // Whiteboards
        var wbMat = Lit(C(0.97f,0.97f,0.96f), 0.05f);
        Box("WB1", new Vector3(-6,1.0f,-36), new Vector3(0.08f,2.0f,3.0f), wbMat, T);
        Box("WB2", new Vector3(6, 1.0f, 10), new Vector3(0.08f,2.0f,3.0f), wbMat, T);

        var bbMat1 = Lit(C(0.78f,0.22f,0.45f), 0.1f);
        var bbMat2 = Lit(C(0.22f,0.6f, 0.78f), 0.1f);
        foreach (var (bx, bz, m) in new[]{(-40f,35f,bbMat1),(40f,-35f,bbMat2),(-40f,-35f,bbMat2),(40f,35f,bbMat1)})
        {
            var bag = Sph("BeanBag", new Vector3(bx,0.55f,bz), 1.1f, m, T);
            bag.transform.localScale = new Vector3(1.1f, 0.77f, 1.1f);
        }

        CoffeeStation(-40, -44, 90, T); VendingMachine(-42, -38, -90, T); VendingMachine(-42, -46, -90, T);
        Printer(40, 44, -90, T); ReceptionDesk(0, -47, 0, T);
        CoatRack(-5, -48, T); CoatRack(5, -48, T);
        foreach (var (px, pz) in new[]{(-42f,-42f),(42f,-42f),(-42f,42f),(42f,42f),(-42f,0f),(42f,0f)}) Plant(px, pz, T);
        WallPoster(-30,4,-49.7f, 0, 1.6f,1.0f, C(0.15f,0.45f,0.72f), T);
        WallPoster( 10,4,-49.7f, 0, 1.6f,1.0f, C(0.72f,0.28f,0.18f), T);
        WallClock(-44.7f, 5f, 0, 90, T); WallClock(44.7f, 5f, 0, -90, T);
        Noticeboard(-44.7f, 4, -20, 90, T); Noticeboard(-44.7f, 4, 20, 90, T);
        foreach (var (ex,ez) in new[]{(-44f,44f),(-44f,-44f),(44f,44f),(44f,-44f)}) FireExt(ex, ez, T);
        WaterCooler(-42, 28, T); WaterCooler(42, -28, T);

        var rawPts = new List<Vector3> {
            new(0,0,-44), new(-32,0,-38), new(-38,0,-20), new(-32,0,0),
            new(-38,0,20), new(-30,0,40), new(0,0,44),    new(30,0,40),
            new(38,0,20),  new(32,0,0),   new(38,0,-20),  new(32,0,-38)
        };
        BuildRoad(rawPts, 9, roadMat, Lit(C(0.85f,0.1f,0.1f),0.3f), Lit(Color.white,0.2f), T);
        StartFinishLine(0, -44, 0, T);

        return (new Vector3(0, 0, -42), rawPts);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRACK 2 – EXECUTIVE SUITE
    // ─────────────────────────────────────────────────────────────────────────
    static (Vector3 start, List<Vector3> cps) BuildExecutiveSuite()
    {
        var env = new GameObject("Environment_ExecutiveSuite");
        var T = env.transform;

        var wallMat  = Lit(C(0.20f,0.16f,0.12f), 0.15f);
        var winMat   = Lit(C(0.50f,0.72f,0.84f), 0.85f, 0.0f);
        var floorMat = Lit(C(0.84f,0.81f,0.76f), 0.6f, 0.15f);
        var ceilMat  = Lit(C(0.22f,0.18f,0.14f), 0.1f);
        var roadMat  = Lit(C(0.18f,0.18f,0.19f), 0.05f);
        var mah      = Lit(C(0.32f,0.16f,0.08f), 0.4f, 0.05f);
        var gold     = Lit(C(0.83f,0.67f,0.20f), 0.85f, 0.9f);
        var marble   = Lit(C(0.86f,0.83f,0.78f), 0.65f, 0.15f);
        var carp     = Lit(C(0.32f,0.22f,0.42f), 0.0f);
        var leather  = Lit(C(0.10f,0.16f,0.09f), 0.15f);

        RoomShell(-31, 31, -46, 46, 7.2f, wallMat, winMat, floorMat, ceilMat, T);

        Box("Carpet", new Vector3(0, 0.005f, 0), new Vector3(4, 0.01f, 92), carp, T);
        Box("GoldTrimN", new Vector3(0, 0.08f, -46), new Vector3(62, 0.16f, 0.22f), gold, T);
        Box("GoldTrimS", new Vector3(0, 0.08f,  46), new Vector3(62, 0.16f, 0.22f), gold, T);
        Box("GoldTrimT", new Vector3(0, 7.1f,    0), new Vector3(62, 0.16f, 92),    gold, T);

        Chandeliers(T, gold);

        // Pillars
        float[] pilX = {-22,-22,-22,-22,-22,22,22,22,22,22};
        float[] pilZ = {-36,-18,0,18,36,-36,-18,0,18,36};
        for (int i = 0; i < pilX.Length; i++)
        {
            Cyl("Pillar", new Vector3(pilX[i], 3.6f, pilZ[i]), new Vector3(1.1f, 7.2f, 1.1f), marble, T);
            Cyl("PillarCap", new Vector3(pilX[i], 7.12f, pilZ[i]), new Vector3(1.35f, 0.24f, 1.35f), gold, T);
            Cyl("PillarBase", new Vector3(pilX[i], 0.1f, pilZ[i]), new Vector3(1.3f, 0.2f, 1.3f), gold, T);
        }

        // Boardroom table
        Box("Table",    new Vector3(0, 0.82f, 0), new Vector3(5.5f, 0.12f, 12.0f), mah, T);
        Box("Leather",  new Vector3(0, 0.89f, 0), new Vector3(4.8f, 0.02f, 11.0f), leather, T);
        Box("GoldInlay",new Vector3(0, 0.888f,0), new Vector3(5.3f, 0.015f,11.7f), gold, T);
        foreach (float tz in new[]{-5.2f, 5.2f}) foreach (float tx in new[]{-2.4f, 2.4f})
            Cyl("TableLeg", new Vector3(tx, 0.41f, tz), new Vector3(0.28f, 0.82f, 0.28f), mah, T);
        foreach (float tz in new[]{-3f, 0f, 3f}) foreach (float tx in new[]{-1f, 1f})
            Cyl("Carafe", new Vector3(tx, 1.0f, tz), new Vector3(0.1f, 0.28f, 0.1f), Lit(C(0.7f,0.88f,0.95f),0.8f), T);

        // Exec desks
        foreach (var (dx, dz) in new[]{(-27f,-38f),(27f,-38f),(-27f,38f),(27f,38f)})
        {
            OfficeDesk(dx, dz, dx < 0 ? 90 : -90, T);
            Box("Credenza", new Vector3(dx + (dx<0?1.5f:-1.5f), 0.375f, dz), new Vector3(1.8f,0.75f,0.5f), mah, T);
            Cyl("Trophy", new Vector3(dx + (dx<0?1.8f:-1.8f), 1.12f, dz), new Vector3(0.24f,0.62f,0.24f), gold, T);
        }

        WallPoster(0,  4.5f,-45.7f, 0, 2.0f,1.3f, C(0.28f,0.20f,0.12f), T);
        WallPoster(-18,4.5f,-45.7f, 0, 1.4f,0.9f, C(0.45f,0.35f,0.18f), T);
        WallPoster(18, 4.5f,-45.7f, 0, 1.4f,0.9f, C(0.35f,0.22f,0.12f), T);
        WallClock(0, 5.5f, -45.7f, 0, T); WallClock(0, 5.5f, 45.7f, 180, T);
        Noticeboard(-29.5f, 4, 30, 90, T); Noticeboard(-29.5f, 4, 10, 90, T);
        foreach (var (px,pz) in new[]{(-28f,38f),(28f,38f),(-28f,-38f),(28f,-38f),(-28f,0f),(28f,0f)}) Plant(px, pz, T);
        foreach (var (ex,ez) in new[]{(-29f,44f),(-29f,-44f),(29f,44f),(29f,-44f)}) FireExt(ex, ez, T);
        WaterCooler(-28, 22, T);

        var rawPts = new List<Vector3> {
            new(0,0,-40),  new(-18,0,-38), new(-20,0,-24), new(-18,0,-10),
            new(-20,0,5),  new(-18,0,20),  new(-20,0,35),  new(0,0,40),
            new(20,0,35),  new(18,0,20),   new(20,0,5),    new(18,0,-10),
            new(20,0,-24), new(18,0,-38)
        };
        BuildRoad(rawPts, 7, roadMat, Lit(C(0.83f,0.67f,0.2f),0.85f,0.9f), Lit(C(0.92f,0.92f,0.92f),0.3f), T);
        StartFinishLine(0, -40, 0, T);

        return (new Vector3(0, 0, -38), rawPts);
    }

    static void Chandeliers(Transform T, Material gold)
    {
        foreach (float cz in new[]{-30f, 0f, 30f})
            Chandelier(0, cz, 7.0f, T);
    }

    // ── Spawn player + AI + camera ────────────────────────────────────────────
    static void SpawnRacers(Vector3 startPos, List<Vector3> cpPositions)
    {
        // Player
        var player = BuildCharacterMesh("Player", new Color(0.12f, 0.28f, 0.82f), new Color(0.9f,0.9f,0.9f));
        player.transform.position = startPos + new Vector3(-1.8f, 0, 0);
        player.tag = "Player";

        var cc = player.AddComponent<ChairController>();
        var la = player.AddComponent<LegAnimator>();
        cc.legAnimator = la;
        cc.bodyRoot    = player.transform.Find("Body");

        // Assign leg transforms (built by BuildCharacterMesh)
        la.leftThigh  = player.transform.Find("Body/LeftThigh");
        la.rightThigh = player.transform.Find("Body/RightThigh");
        la.leftShin   = player.transform.Find("Body/LeftThigh/LeftShin");
        la.rightShin  = player.transform.Find("Body/RightThigh/RightShin");
        la.leftFoot   = player.transform.Find("Body/LeftThigh/LeftShin/LeftFoot");
        la.rightFoot  = player.transform.Find("Body/RightThigh/RightShin/RightFoot");

        player.AddComponent<Rigidbody>(); // will be configured by ChairController.Start()

        // AI
        var ai = BuildCharacterMesh("AI", new Color(0.78f, 0.12f, 0.08f), new Color(0.9f, 0.75f, 0.1f));
        ai.transform.position = startPos + new Vector3(1.8f, 0, 0);
        ai.tag = "AI";

        var aic = ai.AddComponent<AIController>();
        var ail = ai.AddComponent<LegAnimator>();
        aic.legAnimator = ail;
        ail.leftThigh  = ai.transform.Find("Body/LeftThigh");
        ail.rightThigh = ai.transform.Find("Body/RightThigh");
        ail.leftShin   = ai.transform.Find("Body/LeftThigh/LeftShin");
        ail.rightShin  = ai.transform.Find("Body/RightThigh/RightShin");
        ail.leftFoot   = ai.transform.Find("Body/LeftThigh/LeftShin/LeftFoot");
        ail.rightFoot  = ai.transform.Find("Body/RightThigh/RightShin/RightFoot");

        ai.AddComponent<Rigidbody>();

        // Wire up AI waypoints
        var wpRoot = new GameObject("AIWaypoints");
        foreach (var p in cpPositions)
        {
            var wp = new GameObject("WP"); wp.transform.SetParent(wpRoot.transform); wp.transform.position = p;
            aic.waypoints.Add(wp.transform);
        }
    }

    static GameObject BuildCharacterMesh(string id, Color seatColor, Color shirtColor)
    {
        var root = new GameObject(id);
        var body = new GameObject("Body"); body.transform.SetParent(root.transform);
        body.transform.localPosition = Vector3.zero;

        var seatMat  = Lit(seatColor, 0.3f, 0.05f);
        var shirtMat = Lit(shirtColor, 0.1f);
        var pantsMat = Lit(C(0.18f,0.18f,0.28f), 0.1f);
        var skinMat  = Lit(C(0.92f,0.76f,0.62f), 0.05f);
        var metalMat = Lit(C(0.65f,0.65f,0.67f), 0.7f, 0.9f);
        var wheelMat = Lit(C(0.15f,0.15f,0.15f), 0.3f, 0.2f);
        var hairMat  = Lit(C(0.20f,0.15f,0.10f), 0.05f);
        var shoeMat  = Lit(C(0.10f,0.10f,0.10f), 0.25f, 0.15f);

        var bodyT = body.transform;

        // Chair parts (parented to root, not body – so body lean doesn't affect chair)
        Box("Seat",     new Vector3(0,0.50f,0),     new Vector3(0.92f,0.10f,0.92f), seatMat, root.transform);
        Box("Cushion",  new Vector3(0,0.56f,0),     new Vector3(0.80f,0.07f,0.80f), seatMat, root.transform);
        Box("Backrest", new Vector3(0,0.96f,-0.41f),new Vector3(0.88f,0.78f,0.09f), seatMat, root.transform);
        Box("BackPad",  new Vector3(0,0.97f,-0.38f),new Vector3(0.78f,0.66f,0.05f), Lit(seatColor*0.85f,0.2f), root.transform);
        Cyl("Column",   new Vector3(0,0.25f,0),     new Vector3(0.07f,0.50f,0.07f), metalMat, root.transform);

        // Armrests
        foreach (float ax in new[]{-0.52f, 0.52f})
        {
            Box("ArmV", new Vector3(ax,0.56f, 0.18f), new Vector3(0.06f,0.22f,0.06f), Lit(C(0.12f,0.12f,0.12f),0.5f,0.4f), root.transform);
            Box("ArmH", new Vector3(ax,0.67f, 0.02f), new Vector3(0.06f,0.06f,0.60f), Lit(C(0.12f,0.12f,0.12f),0.5f,0.4f), root.transform);
        }

        // Base star + wheels
        for (int i = 0; i < 5; i++)
        {
            float a = i / 5f * Mathf.PI * 2f;
            var arm = Box($"Arm{i}", new Vector3(Mathf.Sin(a)*0.19f, 0.03f, Mathf.Cos(a)*0.19f), new Vector3(0.05f,0.04f,0.38f), metalMat, root.transform);
            arm.transform.rotation = Quaternion.Euler(0, a * Mathf.Rad2Deg, 0);
            var whl = Cyl($"Wheel{i}", new Vector3(Mathf.Sin(a)*0.37f, 0.055f, Mathf.Cos(a)*0.37f), new Vector3(0.11f,0.056f,0.11f), wheelMat, root.transform);
            whl.transform.rotation = Quaternion.Euler(90, 0, 0);
        }

        // Worker body (parented to body node so it can lean)
        Box("Torso",  new Vector3(0,1.14f,0),     new Vector3(0.48f,0.52f,0.28f), shirtMat, bodyT);
        Box("Collar", new Vector3(0,1.42f,0),     new Vector3(0.22f,0.10f,0.20f), shirtMat, bodyT);
        Box("Neck",   new Vector3(0,1.52f,0),     new Vector3(0.14f,0.12f,0.14f), skinMat,  bodyT);
        Sph("Head",   new Vector3(0,1.72f,0), 0.34f, skinMat, bodyT);
        var hair = Sph("Hair", new Vector3(0,1.83f,0), 0.35f, hairMat, bodyT);
        hair.transform.localScale = new Vector3(0.35f, 0.19f, 0.35f);

        // Eyes
        foreach (float ex in new[]{-0.07f, 0.07f})
            Sph("Eye", new Vector3(ex,1.73f,0.155f), 0.04f, Lit(C(0.05f,0.05f,0.08f)), bodyT);

        // Upper arms
        foreach (float ux in new[]{-0.32f, 0.32f})
        {
            var ua = Box("UpperArm", new Vector3(ux,1.12f,0.04f), new Vector3(0.12f,0.36f,0.12f), shirtMat, bodyT);
            ua.transform.rotation = Quaternion.Euler(0, 0, ux < 0 ? 18f : -18f);
        }

        // Legs – use child GameObjects as pivot nodes for LegAnimator
        foreach ((float lx, string side) in new[]{(-0.16f,"Left"),(0.16f,"Right")})
        {
            var thighNode = new GameObject($"{side}Thigh"); thighNode.transform.SetParent(bodyT);
            thighNode.transform.localPosition = new Vector3(lx, 0.52f, 0.22f);

            Box("ThighMesh", new Vector3(0, -0.18f, 0), new Vector3(0.16f,0.36f,0.16f), pantsMat, thighNode.transform);

            var shinNode = new GameObject($"{side}Shin"); shinNode.transform.SetParent(thighNode.transform);
            shinNode.transform.localPosition = new Vector3(0, -0.36f, 0);

            Box("ShinMesh", new Vector3(0,-0.17f,0), new Vector3(0.13f,0.34f,0.13f), pantsMat, shinNode.transform);

            var footNode = new GameObject($"{side}Foot"); footNode.transform.SetParent(shinNode.transform);
            footNode.transform.localPosition = new Vector3(0, -0.36f, 0.06f);
            Box("FootMesh", Vector3.zero, new Vector3(0.12f,0.08f,0.22f), shoeMat, footNode.transform);
        }

        // Box collider for the whole chair
        var col = root.AddComponent<BoxCollider>();
        col.center = new Vector3(0, 0.6f, 0);
        col.size   = new Vector3(0.9f, 1.2f, 0.9f);

        return root;
    }

    static void BuildCheckpoints(List<Vector3> positions)
    {
        var cpRoot = new GameObject("Checkpoints");
        var rm     = FindOrCreate<RaceManager>("RaceManager");
        rm.checkpoints.Clear();

        for (int i = 0; i < positions.Count; i++)
        {
            var cpGO = new GameObject($"Checkpoint_{i}");
            cpGO.transform.SetParent(cpRoot.transform);
            cpGO.transform.position = positions[i];

            var col = cpGO.AddComponent<BoxCollider>();
            col.isTrigger = true;
            col.size = new Vector3(10, 3, 1);

            var cp = cpGO.AddComponent<Checkpoint>();
            cp.index = i;
            cp.isFinishLine = (i == 0);

            rm.checkpoints.Add(cp);
        }
    }

    static void SetupCamera()
    {
        var camGO = GameObject.Find("Main Camera") ?? new GameObject("Main Camera");
        camGO.tag = "MainCamera";
        var cam = camGO.GetComponent<Camera>() ?? camGO.AddComponent<Camera>();
        cam.nearClipPlane = 0.1f;
        cam.farClipPlane  = 300f;

        var rig = camGO.GetComponent<ChairCameraRig>() ?? camGO.AddComponent<ChairCameraRig>();
        rig.cam = cam;

        var player = GameObject.FindWithTag("Player");
        if (player != null) rig.target = player.transform;
    }

    static void SetupGameSystems(int track)
    {
        var gmGO = FindOrCreate<GameManager>("GameManager").gameObject;
        var gm   = gmGO.GetComponent<GameManager>();
        gm.selectedTrack = track;

        var rm = FindOrCreate<RaceManager>("RaceManager");
        gm.raceManager  = rm;

        var player = GameObject.FindWithTag("Player");
        if (player != null) gm.playerChair = player.GetComponent<ChairController>();

        var ai = GameObject.FindWithTag("AI");
        if (ai != null) gm.aiChair = ai.GetComponent<AIController>();
    }

    static void BuildUI()
    {
        // Minimal Canvas – full UI build requires Unity Canvas setup at runtime.
        // HUDController is added here; layout is done via the included Prefab guide in README.
        var hudGO = new GameObject("HUDController");
        hudGO.AddComponent<HUDController>();
    }

    static T FindOrCreate<T>(string name) where T : Component
    {
        var existing = Object.FindObjectOfType<T>();
        if (existing != null) return existing;
        var go = new GameObject(name);
        return go.AddComponent<T>();
    }
}
#endif
