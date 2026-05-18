using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System.Collections;

public class HUDController : MonoBehaviour
{
    [Header("Race HUD")]
    public TextMeshProUGUI lapText;
    public TextMeshProUGUI timeText;
    public TextMeshProUGUI bestLapText;
    public TextMeshProUGUI speedText;
    public Slider speedBar;
    public TextMeshProUGUI positionText;
    public TextMeshProUGUI offRoadText;
    public RawImage minimapImage;

    [Header("Countdown")]
    public TextMeshProUGUI countdownText;
    public Animator countdownAnimator;

    [Header("Finish screen")]
    public GameObject finishPanel;
    public TextMeshProUGUI finishTitleText;
    public TextMeshProUGUI finishTimeText;
    public TextMeshProUGUI finishEmojiText;

    [Header("Settings")]
    public float maxSpeedKmh = 55f;

    ChairController player;

    void Start()
    {
        player = FindObjectOfType<ChairController>();
        offRoadText?.gameObject.SetActive(false);
        finishPanel?.SetActive(false);
        countdownText?.gameObject.SetActive(false);
    }

    void Update()
    {
        if (!GameManager.Instance.IsRacing || player == null) return;

        float kmh = player.currentSpeedKmh;
        speedText?.SetText($"{Mathf.RoundToInt(kmh)} km/h");
        if (speedBar != null) speedBar.value = Mathf.Clamp01(kmh / maxSpeedKmh);

        offRoadText?.gameObject.SetActive(!player.isOnRoad);

        // Position
        if (RaceManager.Instance != null)
        {
            bool leading = RaceManager.Instance.GetPlayerProgress() >= RaceManager.Instance.GetAIProgress();
            positionText?.SetText(leading ? "1st" : "2nd");
        }
    }

    public void UpdateTime(float race, float lap, float best)
    {
        timeText?.SetText(FormatTime(race));
        if (RaceManager.Instance != null)
            lapText?.SetText($"{Mathf.Min(RaceManager.Instance.playerLap, RaceManager.Instance.totalLaps)} / {RaceManager.Instance.totalLaps}");
        bestLapText?.SetText(best < float.MaxValue ? FormatTime(best) : "--:--.--");
    }

    public void ShowCountdown(int count)
    {
        if (countdownText == null) return;
        countdownText.gameObject.SetActive(true);
        countdownText.text = count == 0 ? "GO!" : count.ToString();
        countdownText.color = count == 0 ? new Color(0, 1, 0.5f) : Color.white;
        countdownAnimator?.SetTrigger("Pulse");
    }

    public void HideCountdown() =>
        countdownText?.gameObject.SetActive(false);

    public void ShowFinish(bool won, float totalTime)
    {
        finishPanel?.SetActive(true);
        if (finishEmojiText != null) finishEmojiText.text  = won ? "🏆" : "😅";
        if (finishTitleText != null) finishTitleText.text  = won ? "YOU WIN!" : "SO CLOSE!";
        if (finishTimeText  != null) finishTimeText.text   = "Total: " + FormatTime(totalTime);
    }

    static string FormatTime(float seconds)
    {
        int m  = Mathf.FloorToInt(seconds / 60f);
        int s  = Mathf.FloorToInt(seconds % 60f);
        int cs = Mathf.FloorToInt((seconds * 100f) % 100f);
        return $"{m}:{s:00}.{cs:00}";
    }
}
