"""Tool: fetch placed order row(s) by order_id from placed_orders table."""
from langchain_core.tools import tool

from ._db import get_supabase_client
from ..schemas.tools import GetPlacedOrderInput

NO_DATA_MSG = "No data found."
ERROR_MSG = "Attempt failed or an error. Please try reusing the tool."


def _row_to_readable(row: dict) -> dict:
    """Convert DB row to agent-readable dict (serializable, no bytes)."""
    if not row:
        return {}
    return {k: (str(v) if v is not None else None) for k, v in row.items()}


@tool(
    "get_placed_order",
    description=(
        "Fetches order details from the placed_orders table for a specific order. "
        "Use when the user asks about order status, delivery, or order information. "
        "Input: order_id. Returns all rows matching the order id in a readable format."
    ),
    args_schema=GetPlacedOrderInput,
)
def get_placed_order(order_id: str) -> dict:
    """Fetch all rows from placed_orders matching the given order_id."""
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
            supabase.table("placed_orders")
            .select("*")
            .eq("id", order_id)
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
            "message": f"Found {len(readable)} order row(s).",
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
