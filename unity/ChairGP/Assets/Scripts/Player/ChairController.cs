using UnityEngine;

[RequireComponent(typeof(Rigidbody))]
public class ChairController : MonoBehaviour
{
    [Header("Movement")]
    public float maxSpeed = 13f;
    public float acceleration = 22f;
    public float turnSpeed = 130f;
    public float brakeDrag = 9f;
    public float normalDrag = 2.8f;

    [Header("Off-road penalty")]
    public float offRoadSpeedMultiplier = 0.35f;
    [HideInInspector] public bool isOnRoad = true;

    [Header("References")]
    public LegAnimator legAnimator;
    public Transform bodyRoot;

    [HideInInspector] public float currentSpeedKmh;

    Rigidbody rb;
    bool braking;
    float leanAngle;

    void Start()
    {
        rb = GetComponent<Rigidbody>();
        rb.constraints = RigidbodyConstraints.FreezePositionY
                       | RigidbodyConstraints.FreezeRotationX
                       | RigidbodyConstraints.FreezeRotationZ;
        rb.interpolation = RigidbodyInterpolation.Interpolate;
        rb.mass = 90f;
        rb.drag = normalDrag;
    }

    void Update()
    {
        if (!GameManager.Instance.IsRacing) return;
        braking = Input.GetKey(KeyCode.Space);

        if (Input.GetKeyDown(KeyCode.R)) ResetPosition();
    }

    void FixedUpdate()
    {
        if (!GameManager.Instance.IsRacing) return;

        float vertical   = Input.GetAxis("Vertical");
        float horizontal = Input.GetAxis("Horizontal");

        float speedCap = isOnRoad ? maxSpeed : maxSpeed * offRoadSpeedMultiplier;
        currentSpeedKmh = rb.velocity.magnitude * 3.6f;

        // Forward / backward force
        if (Mathf.Abs(vertical) > 0.05f)
        {
            Vector3 force = transform.forward * vertical * acceleration;
            rb.AddForce(force, ForceMode.Acceleration);
        }

        // Clamp to speed cap
        if (rb.velocity.magnitude > speedCap)
            rb.velocity = rb.velocity.normalized * Mathf.Lerp(rb.velocity.magnitude, speedCap, Time.fixedDeltaTime * 6f);

        // Turn – only when moving
        if (rb.velocity.magnitude > 0.8f)
        {
            float turnAmount = horizontal * turnSpeed * Time.fixedDeltaTime;
            Quaternion rot = Quaternion.Euler(0, turnAmount, 0);
            rb.MoveRotation(rb.rotation * rot);
            rb.velocity = rot * rb.velocity;
        }

        // Drag / brake
        rb.drag = braking ? brakeDrag : normalDrag;

        // Keep flat on ground
        rb.position = new Vector3(rb.position.x, 0f, rb.position.z);

        // Lean body into turns
        leanAngle = Mathf.Lerp(leanAngle, -horizontal * 5f * Mathf.Clamp01(rb.velocity.magnitude / 5f), Time.fixedDeltaTime * 8f);
        if (bodyRoot != null)
            bodyRoot.localRotation = Quaternion.Euler(0, 0, leanAngle);

        // Animate legs
        legAnimator?.UpdateLegs(rb.velocity.magnitude, Time.fixedDeltaTime);
    }

    void ResetPosition()
    {
        rb.velocity = Vector3.zero;
        rb.angularVelocity = Vector3.zero;
        rb.position = new Vector3(rb.position.x, 0f, rb.position.z);
    }

    public Vector3 Velocity => rb.velocity;
}
