"""Pydantic schemas for LangChain tool inputs."""
from pydantic import BaseModel, Field


class GetGradingsInput(BaseModel):
    """Input for the get_gradings tool: fetch fruit grading details for an order."""

    order_id: str = Field(..., description="The order ID to fetch gradings for.")


class GetPlacedOrderInput(BaseModel):
    """Input for the get_placed_order tool: fetch order row(s) from placed_orders by order id."""

    order_id: str = Field(..., description="The order ID to fetch placed order details for.")


class GetPaymentDetailsInput(BaseModel):
    """Input for the get_payment_details tool: fetch payment row(s) from payments by order id."""

    order_id: str = Field(..., description="The order ID to fetch payment details for.")


class GetTemperaturesInput(BaseModel):
    """Input for the get_temperatures tool: fetch temperature row(s) from temperatures table by order id."""

    order_id: str = Field(..., description="The order ID to fetch temperature records for.")


class InsertComplaintInput(BaseModel):
    """Input for the insert_complaint tool: create a complaint row (one per order)."""

    order_id: str = Field(..., description="The order ID this complaint is about.")
    user_id: str = Field(..., description="The user ID submitting the complaint.")
    user_complaint: str = Field(..., description="The user's complaint text.")
    agent_description: str = Field(..., description="Agent's description or summary of the complaint.")
    proofs: str = Field(
        default="",
        description="Proofs or evidence sections (text or JSON string); optional.",
    )


class GetComplaintsByOrderInput(BaseModel):
    """Input for the get_complaints_by_order tool: fetch complaint(s) for an order."""

    order_id: str = Field(..., description="The order ID to fetch complaints for.")
