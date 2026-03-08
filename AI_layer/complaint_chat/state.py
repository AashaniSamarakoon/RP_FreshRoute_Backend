from typing import TypedDict

class ChatState(TypedDict):
    is_general_query: bool
    order_id: str
    user_id: str
    query: str
    response: str
    history: list[tuple[str, str]]