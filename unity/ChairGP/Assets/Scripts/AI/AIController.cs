using System.Collections.Generic;
using UnityEngine;

[RequireComponent(typeof(Rigidbody))]
public class AIController : MonoBehaviour
{
    [Header("AI tuning")]
    public float topSpeed = 12.5f;
    public float acceleration = 18f;
    public float turnSpeed = 160f;
    public float waypointReachDist = 3.5f;
    public float rubberBandFactor = 0.18f;  // adjusts speed relative to player gap

    [Header("References")]
    public List<Transform> waypoints = new();
    public LegAnimator legAnimator;

    Rigidbody rb;
    int wpIdx;
    ChairController player;

    void Start()
    {
        rb = GetComponent<Rigidbody>();
        rb.constraints = RigidbodyConstraints.FreezePositionY
                       | RigidbodyConstraints.FreezeRotationX
                       | RigidbodyConstraints.FreezeRotationZ;
        rb.interpolation = RigidbodyInterpolation.Interpolate;
        rb.mass = 90f;
        rb.drag = 2.8f;

        player = FindObjectOfType<ChairController>();
    }

    void FixedUpdate()
    {
        if (!GameManager.Instance.IsRacing || waypoints.Count == 0) return;

        Transform wp = waypoints[wpIdx];
        Vector3 toWP = wp.position - rb.position;
        toWP.y = 0;
        float dist = toWP.magnitude;

        if (dist < waypointReachDist)
            wpIdx = (wpIdx + 1) % waypoints.Count;

        // Steer toward waypoint
        Vector3 targetDir = toWP.normalized;
        float angle = Vector3.SignedAngle(transform.forward, targetDir, Vector3.up);
        float turn  = Mathf.Clamp(angle / 30f, -1f, 1f) * turnSpeed * Time.fixedDeltaTime;
        rb.MoveRotation(rb.rotation * Quaternion.Euler(0, turn, 0));

        // Rubber-band speed adjustment
        float speedMod = 1f;
        if (player != null)
        {
            float gap = (RaceManager.Instance.GetPlayerProgress() - RaceManager.Instance.GetAIProgress());
            speedMod = 1f - Mathf.Clamp(gap * rubberBandFactor, -0.25f, 0.25f);
        }
        float cap = topSpeed * speedMod;

        // Accelerate forward
        rb.AddForce(transform.forward * acceleration, ForceMode.Acceleration);
        if (rb.velocity.magnitude > cap)
            rb.velocity = rb.velocity.normalized * cap;

        rb.position = new Vector3(rb.position.x, 0, rb.position.z);

        legAnimator?.UpdateLegs(rb.velocity.magnitude, Time.fixedDeltaTime);
    }
}
