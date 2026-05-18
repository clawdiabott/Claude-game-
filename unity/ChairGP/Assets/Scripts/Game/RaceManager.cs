using System.Collections.Generic;
using UnityEngine;

public class RaceManager : MonoBehaviour
{
    public static RaceManager Instance { get; private set; }

    [Header("Race settings")]
    public int totalLaps = 3;

    [Header("Runtime")]
    public int playerLap = 1;
    public int aiLap = 1;
    public float raceTime;
    public float lapTime;
    public float bestLapTime = float.MaxValue;
    public bool raceStarted;

    public List<Checkpoint> checkpoints = new();

    // Per-racer checkpoint tracking
    readonly HashSet<int> playerPassedCPs = new();
    int playerCPIndex;
    int aiCPIndex;

    void Awake()
    {
        if (Instance != null) { Destroy(gameObject); return; }
        Instance = this;
    }

    public void StartRace()
    {
        raceStarted = true;
        raceTime = 0;
        lapTime = 0;
    }

    void Update()
    {
        if (!raceStarted) return;
        raceTime += Time.deltaTime;
        lapTime  += Time.deltaTime;
        GameManager.Instance.hud?.UpdateTime(raceTime, lapTime, bestLapTime);
    }

    public void PlayerPassedCheckpoint(int index)
    {
        if (playerPassedCPs.Contains(index)) return;
        playerPassedCPs.Add(index);
        playerCPIndex = index;

        bool isFinish = checkpoints[index].isFinishLine;
        if (isFinish && playerPassedCPs.Count >= checkpoints.Count)
        {
            CompleteLap();
        }
    }

    void CompleteLap()
    {
        if (lapTime < bestLapTime) bestLapTime = lapTime;
        lapTime = 0;
        playerPassedCPs.Clear();
        playerLap++;

        if (playerLap > totalLaps)
        {
            GameManager.Instance.FinishRace(true, raceTime);
            raceStarted = false;
        }
    }

    public void AIPassedCheckpoint(int index)
    {
        aiCPIndex = index;
        bool isFinish = checkpoints[index].isFinishLine;
        // Rough lap tracking for AI
        if (isFinish && index == 0)
        {
            aiLap++;
            if (aiLap > totalLaps && raceStarted)
            {
                GameManager.Instance.FinishRace(false, raceTime);
                raceStarted = false;
            }
        }
    }

    public float GetPlayerProgress() =>
        (playerLap - 1) * checkpoints.Count + playerCPIndex;

    public float GetAIProgress() =>
        (aiLap - 1) * checkpoints.Count + aiCPIndex;
}
