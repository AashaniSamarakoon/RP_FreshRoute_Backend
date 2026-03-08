"""Chat request/response schemas."""
from pydantic import BaseModel, Field


class UserDetails(BaseModel):
    """User context for the chat."""

    user_id: str = Field(..., description="User ID")
    email: str | None = Field(None, description="User email")


class ChatRequest(BaseModel):
    """Request body for the chat endpoint."""

    order_id: str = Field(..., description="Order ID for context")
    user: UserDetails = Field(..., description="User details")
    query: str = Field(..., min_length=1, description="User message/query")


class ChatResponse(BaseModel):
    """Response from the chat endpoint."""

    reply: str = Field(..., description="Agent reply")
    order_id: str = Field(..., description="Order ID echoed for reference")
