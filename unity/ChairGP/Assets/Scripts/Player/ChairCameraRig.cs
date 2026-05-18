using UnityEngine;

/// Smooth Mario-Kart-style follow camera. No Cinemachine required.
public class ChairCameraRig : MonoBehaviour
{
    [Header("Target")]
    public Transform target;

    [Header("Offsets")]
    public float followDistance = 9f;
    public float heightOffset   = 3.8f;
    public float lateralDamp    = 0.12f;
    public float verticalDamp   = 0.08f;
    public float rotationDamp   = 0.10f;

    [Header("FOV boost at speed")]
    public Camera cam;
    public float baseFOV  = 65f;
    public float maxFOV   = 78f;
    public float fovSpeed = 12f;   // m/s at which maxFOV is reached

    Vector3 currentVelocity;
    float   currentRotVelocity;

    void LateUpdate()
    {
        if (target == null) return;

        // Desired position: behind and above target
        Vector3 desiredPos = target.position
            - target.forward * followDistance
            + Vector3.up * heightOffset;

        transform.position = Vector3.SmoothDamp(
            transform.position, desiredPos, ref currentVelocity,
            lateralDamp);

        // Look at target + small forward offset
        Vector3 lookAt = target.position + target.forward * 2f + Vector3.up * 0.8f;
        Quaternion desiredRot = Quaternion.LookRotation(lookAt - transform.position);
        transform.rotation = Quaternion.Slerp(transform.rotation, desiredRot, Time.deltaTime / rotationDamp);

        // FOV – proportional to speed
        if (cam != null)
        {
            ChairController cc = target.GetComponent<ChairController>();
            float spd = cc != null ? cc.Velocity.magnitude : 0f;
            float targetFOV = Mathf.Lerp(baseFOV, maxFOV, spd / fovSpeed);
            cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, targetFOV, Time.deltaTime * 5f);
        }
    }
}
