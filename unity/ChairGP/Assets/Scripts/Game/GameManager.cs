using UnityEngine;
using UnityEngine.SceneManagement;

public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }

    public enum GameState { Menu, Countdown, Racing, Finished }
    public GameState State { get; private set; } = GameState.Menu;

    public bool IsRacing => State == GameState.Racing;

    public int SelectedTrack { get; set; } = 0;

    [Header("References – assigned by SceneBuilder")]
    public ChairController playerChair;
    public AIController aiChair;
    public RaceManager raceManager;
    public HUDController hud;
    public GameObject menuCanvas;
    public GameObject hudCanvas;
    public GameObject finishCanvas;

    void Awake()
    {
        if (Instance != null && Instance != this) { Destroy(gameObject); return; }
        Instance = this;
        DontDestroyOnLoad(gameObject);
    }

    public void StartRace()
    {
        menuCanvas?.SetActive(false);
        hudCanvas?.SetActive(true);
        finishCanvas?.SetActive(false);
        State = GameState.Countdown;
        StartCoroutine(CountdownRoutine());
    }

    System.Collections.IEnumerator CountdownRoutine()
    {
        hud?.ShowCountdown(3); yield return new WaitForSeconds(1f);
        hud?.ShowCountdown(2); yield return new WaitForSeconds(1f);
        hud?.ShowCountdown(1); yield return new WaitForSeconds(1f);
        hud?.ShowCountdown(0); // "GO!"
        State = GameState.Racing;
        raceManager?.StartRace();
        yield return new WaitForSeconds(0.7f);
        hud?.HideCountdown();
    }

    public void FinishRace(bool playerWon, float totalTime)
    {
        State = GameState.Finished;
        finishCanvas?.SetActive(true);
        hud?.ShowFinish(playerWon, totalTime);
    }

    public void RestartRace()
    {
        State = GameState.Menu;
        SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
    }

    public void BackToMenu()
    {
        State = GameState.Menu;
        SceneManager.LoadScene(0);
    }
}
