"""Structured output schemas for LLM nodes (e.g. intent classifier)."""
from pydantic import BaseModel, Field


class IntentClassifierResult(BaseModel):
    """
    Structured output from the intent classifier node.
    Used to decide if the user query is general chitchat or complaint/order related.
    """

    general: bool = Field(
        ...,
        description="True if the user message is a general query (greetings, hi, good morning, chitchat, or unrelated). False if it is about complaints, orders, fruit quality, transportation, temperature, or any complaint-management topic.",
    )


class GeneralResponseGeneratorResult(BaseModel):
    """
    Structured output from the general response generator node.
    Used when the user query is general (greeting/chitchat); response must be Markdown.
    """

    response: str = Field(
        ...,
        description="Your reply to the user. Must be formatted in proper Markdown (use **bold**, lists, line breaks, etc. where appropriate). Be polite; for greetings answer warmly and briefly invite complaint-related questions; for off-topic questions do not answer the topic—politely redirect to complaint-related queries.",
    )


class AgentFinalResponse(BaseModel):
    """
    Response format for the complaint agent: final answer to the user.
    The agent must return a single string in Markdown format.
    """

    response: str = Field(
        ...,
        description="The final answer to the user. Must be in proper Markdown format (use **bold**, lists, line breaks, headers where appropriate).",
    )
