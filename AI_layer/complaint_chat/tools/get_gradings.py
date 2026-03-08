"""Tool: fetch fruit gradings for a specific order from the database."""
from langchain_core.tools import tool

from ._db import get_supabase_client
from ..schemas.tools import GetGradingsInput


@tool(
    "get_gradings",
    description=(
        "Fetches fruit grading details for a specific order. Use this when the user asks about "
        "grading, fruit quality, or grade results for an order. Input: order_id. Returns a summary "
        "of gradings (grading_id, job_id, per-image predicted_grade and accuracy); no image data."
    ),
    args_schema=GetGradingsInput,
)
def get_gradings(order_id: str) -> dict:
    """
    Fetch all gradings and grading images for the given order_id from the database.
    Returns a structured summary suitable for the agent (no base64 images).
    """
    order_id = (order_id or "").strip()
    if not order_id:
        return {
            "success": False,
            "message": "order_id is required.",
            "order_id": "",
            "gradings_summary": None,
        }

    try:
        supabase = get_supabase_client()
    except Exception as e:
        return {
            "success": False,
            "message": f"Database configuration error: {e}.",
            "order_id": order_id,
            "gradings_summary": None,
        }

    try:
        # 1. Get gradings for this order (same as Backend)
        r_gradings = (
            supabase.table("gradings")
            .select("grading_id, job_id, order_id, created_at")
            .eq("order_id", order_id)
            .order("created_at", desc=True)
            .execute()
        )
        gradings = r_gradings.data or []

        if not gradings:
            return {
                "success": True,
                "message": "No gradings found for this order.",
                "order_id": order_id,
                "total_gradings": 0,
                "gradings_summary": [],
            }

        grading_ids = [g["grading_id"] for g in gradings]

        # 2. Get grading_images for these gradings (exclude image_base64 for agent token efficiency)
        r_images = (
            supabase.table("grading_images")
            .select("id, grading_id, predicted_grade, accuracy, sequence, created_at")
            .in_("grading_id", grading_ids)
            .order("grading_id")
            .order("sequence")
            .execute()
        )
        images = r_images.data or []

        # 3. Group images by grading_id and build agent-friendly summary
        gradings_summary = []
        for g in gradings:
            gid = g["grading_id"]
            imgs = [i for i in images if i["grading_id"] == gid]
            gradings_summary.append({
                "grading_id": gid,
                "job_id": g.get("job_id"),
                "order_id": g.get("order_id"),
                "created_at": g.get("created_at"),
                "images_count": len(imgs),
                "images": [
                    {
                        "sequence": img.get("sequence"),
                        "predicted_grade": img.get("predicted_grade"),
                        "accuracy": float(img["accuracy"]) if img.get("accuracy") is not None else None,
                    }
                    for img in sorted(imgs, key=lambda x: (x.get("sequence") or 0))
                ],
            })

        return {
            "success": True,
            "message": "Gradings retrieved successfully.",
            "order_id": order_id,
            "total_gradings": len(gradings_summary),
            "gradings_summary": gradings_summary,
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to fetch gradings: {e}.",
            "order_id": order_id,
            "gradings_summary": None,
        }
