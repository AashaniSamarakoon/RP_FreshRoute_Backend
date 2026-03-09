"""Tool: insert a complaint row (one complaint per order)."""
from langchain_core.tools import tool

from ._db import get_supabase_client
from ..schemas.tools import InsertComplaintInput

EXISTS_MSG = "A complaint already exists for this order."
SUCCESS_MSG = "Complaint submitted successfully."
ERROR_MSG = "Attempt failed or an error. Please try reusing the tool."


@tool(
    "insert_complaint",
    description=(
        "Inserts a new complaint for an order. Use when the user wants to submit or register a complaint. "
        "One complaint per order only; if one already exists for this order, the tool returns a message. "
        "Inputs: order_id, user_id, user_complaint (user's complaint text), agent_description (agent summary), proofs (optional text or JSON string)."
    ),
    args_schema=InsertComplaintInput,
)
def insert_complaint(
    order_id: str,
    user_id: str,
    user_complaint: str,
    agent_description: str,
    proofs: str = "",
) -> dict:
    """Insert a complaint row. Only one complaint per order is allowed."""
    order_id = (order_id or "").strip()
    user_id = (user_id or "").strip()
    if not order_id or not user_id:
        return {"success": False, "message": ERROR_MSG}

    try:
        supabase = get_supabase_client()
    except Exception as e:
        return {"success": False, "message": ERROR_MSG, "error_detail": str(e)}

    try:
        # Enforce one complaint per order: check if one already exists
        r = supabase.table("complaints").select("id").eq("order_id", order_id).execute()
        existing = r.data or []
        if existing:
            return {
                "success": False,
                "message": EXISTS_MSG,
                "order_id": order_id,
            }

        row = {
            "order_id": order_id,
            "user_id": user_id,
            "user_complaint": (user_complaint or "").strip(),
            "agent_description": (agent_description or "").strip(),
            "proofs": (proofs or "").strip(),
            "status": "in review",
        }
        supabase.table("complaints").insert(row).execute()
        return {
            "success": True,
            "message": SUCCESS_MSG,
            "order_id": order_id,
        }
    except Exception as e:
        return {
            "success": False,
            "message": ERROR_MSG,
            "order_id": order_id,
            "error_detail": str(e),
        }
