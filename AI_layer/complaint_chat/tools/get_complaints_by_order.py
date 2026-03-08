"""Tool: fetch complaint(s) for an order by order_id."""
from langchain_core.tools import tool

from ._db import get_supabase_client
from ..schemas.tools import GetComplaintsByOrderInput

NO_DATA_MSG = "No data found."
ERROR_MSG = "Attempt failed or an error. Please try reusing the tool."


def _row_to_readable(row: dict) -> dict:
    """Convert DB row to agent-readable dict (serializable)."""
    if not row:
        return {}
    out = {}
    for k, v in row.items():
        if v is None:
            out[k] = None
        elif hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


@tool(
    "get_complaints_by_order",
    description=(
        "Fetches complaint(s) for an order. Use when the user asks about complaint status or "
        "details for a specific order. Input: order_id. Returns complaint row(s) for that order."
    ),
    args_schema=GetComplaintsByOrderInput,
)
def get_complaints_by_order(order_id: str) -> dict:
    """Fetch all rows from complaints for the given order_id."""
    order_id = (order_id or "").strip()
    if not order_id:
        return {"success": False, "message": ERROR_MSG, "order_id": "", "rows": None}

    try:
        supabase = get_supabase_client()
    except Exception as e:
        return {
            "success": False,
            "message": ERROR_MSG,
            "order_id": order_id,
            "rows": None,
            "error_detail": str(e),
        }

    try:
        r = (
            supabase.table("complaints")
            .select("*")
            .eq("order_id", order_id)
            .order("created_at", desc=True)
            .execute()
        )
        rows = r.data or []

        if not rows:
            return {
                "success": True,
                "message": NO_DATA_MSG,
                "order_id": order_id,
                "rows": [],
                "count": 0,
            }

        readable = [_row_to_readable(row) for row in rows]
        return {
            "success": True,
            "message": f"Found {len(readable)} complaint(s).",
            "order_id": order_id,
            "rows": readable,
            "count": len(readable),
        }
    except Exception as e:
        return {
            "success": False,
            "message": ERROR_MSG,
            "order_id": order_id,
            "rows": None,
            "error_detail": str(e),
        }
