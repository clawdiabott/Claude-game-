using UnityEngine;

/// Animates the worker's legs to scoot/kick the chair forward.
/// Attach to the character root. Assign thigh and shin transforms in Inspector.
public class LegAnimator : MonoBehaviour
{
    [Header("Leg transforms")]
    public Transform leftThigh;
    public Transform rightThigh;
    public Transform leftShin;
    public Transform rightShin;
    public Transform leftFoot;
    public Transform rightFoot;

    [Header("Animation settings")]
    public float maxKickAngle = 42f;    // degrees, thigh swing
    public float shinBendAngle = 30f;   // degrees, shin drops when pushing
    public float cycleSpeedScale = 0.55f;

    float phase;

    public void UpdateLegs(float speed, float dt)
    {
        if (speed < 0.2f)
        {
            // Idle – legs hang naturally
            ApplyIdle();
            return;
        }

        phase += speed * cycleSpeedScale * dt;

        float kick     = Mathf.Sin(phase) * maxKickAngle * Mathf.Clamp01(speed / 5f);
        float shinBend = Mathf.Max(0, Mathf.Sin(phase + 0.4f)) * shinBendAngle;

        // Left leg: forward when right is back
        if (leftThigh  != null) leftThigh.localRotation  = Quaternion.Euler( kick, 0, 0);
        if (leftShin   != null) leftShin.localRotation   = Quaternion.Euler( shinBend * 0.6f, 0, 0);
        if (leftFoot   != null) leftFoot.localRotation   = Quaternion.Euler(-shinBend * 0.3f, 0, 0);

        // Right leg: opposite phase
        float kickR    = Mathf.Sin(phase + Mathf.PI) * maxKickAngle * Mathf.Clamp01(speed / 5f);
        float shinBendR= Mathf.Max(0, Mathf.Sin(phase + Mathf.PI + 0.4f)) * shinBendAngle;
        if (rightThigh != null) rightThigh.localRotation = Quaternion.Euler( kickR, 0, 0);
        if (rightShin  != null) rightShin.localRotation  = Quaternion.Euler( shinBendR * 0.6f, 0, 0);
        if (rightFoot  != null) rightFoot.localRotation  = Quaternion.Euler(-shinBendR * 0.3f, 0, 0);
    }

    void ApplyIdle()
    {
        float t = Time.time;
        Quaternion neutral = Quaternion.identity;
        if (leftThigh)  leftThigh.localRotation  = Quaternion.Slerp(leftThigh.localRotation,  neutral, Time.deltaTime * 4f);
        if (rightThigh) rightThigh.localRotation = Quaternion.Slerp(rightThigh.localRotation, neutral, Time.deltaTime * 4f);
        if (leftShin)   leftShin.localRotation   = Quaternion.Slerp(leftShin.localRotation,   neutral, Time.deltaTime * 4f);
        if (rightShin)  rightShin.localRotation  = Quaternion.Slerp(rightShin.localRotation,  neutral, Time.deltaTime * 4f);
    }
}
