using UnityEngine;

public class Checkpoint : MonoBehaviour
{
    public int index;
    public bool isFinishLine;

    void OnTriggerEnter(Collider other)
    {
        if (other.CompareTag("Player"))
            RaceManager.Instance?.PlayerPassedCheckpoint(index);
        else if (other.CompareTag("AI"))
            RaceManager.Instance?.AIPassedCheckpoint(index);
    }

    void OnDrawGizmos()
    {
        Gizmos.color = isFinishLine ? Color.yellow : new Color(0, 1, 0, 0.4f);
        Gizmos.matrix = transform.localToWorldMatrix;
        Gizmos.DrawWireCube(Vector3.zero, new Vector3(10, 3, 1));
    }
}
