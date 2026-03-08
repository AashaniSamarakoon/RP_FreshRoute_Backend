"""Chat router - complaint chatbot endpoint."""
from fastapi import APIRouter, HTTPException

from schemas.chat import ChatRequest, ChatResponse

router = APIRouter(prefix="/chat", tags=["chat"])


def _invoke_chain(order_id: str, user_id: str, query: str) -> str:
    """Placeholder for agent/chain invocation. Replace with actual chain later."""
    # TODO: Build and invoke chain with order context, user, and query
    return f"Received for order {order_id} (user {user_id}): {query}"


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Chat endpoint for the complaint chatbot.
    Accepts order_id, user details, and query; returns agent reply.
    """
    try:
        reply = _invoke_chain(
            order_id=request.order_id,
            user_id=request.user.user_id,
            query=request.query,
        )
        return ChatResponse(reply=reply, order_id=request.order_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
