"""Tool: fetch payment row(s) by order_id from payments table."""
from langchain_core.tools import tool

from ._db import get_supabase_client
from ..schemas.tools import GetPaymentDetailsInput

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
    "get_payment_details",
    description=(
        "Fetches payment details from the payments table for a specific order. "
        "Use when the user asks about payment status, amount, or payment history. "
        "Input: order_id. Returns all payment rows matching the order id in a readable format."
    ),
    args_schema=GetPaymentDetailsInput,
)
def get_payment_details(order_id: str) -> dict:
    """Fetch all rows from payments matching the given order_id."""
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
            supabase.table("payments")
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
            "message": f"Found {len(readable)} payment row(s).",
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
