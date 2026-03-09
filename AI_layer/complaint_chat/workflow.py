from .state import ChatState
from langgraph.graph import StateGraph, START, END
from dotenv import load_dotenv
import logging
import os
from .utils.llm import get_llm
from langchain.agents import create_agent
from .prompts.intent_classifier import (
    INTENT_CLASSIFIER_SYSTEM_PROMPT,
    get_intent_classifier_user_prompt,
)
from .schemas.structured_outputs import IntentClassifierResult, GeneralResponseGeneratorResult, AgentFinalResponse
from .prompts.general_response_generator import (
    GENERAL_RESPONSE_GENERATOR_SYSTEM_PROMPT,
    get_general_response_generator_user_prompt,
)
from langchain.agents import ToolStrategy
from .tools.get_gradings import get_gradings
from .tools.get_temperatures import get_temperatures
from .tools.get_placed_order import get_placed_order
from .tools.get_payment_details import get_payment_details
from .tools.insert_complaint import insert_complaint
from .tools.get_complaints_by_order import get_complaints_by_order

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

logger = logging.getLogger(__name__)

class ComplaintChatWorkflow:
    def __init__(self):
        self.llm = get_llm()

    def intent_classifier_node(self, state: ChatState):
        try:
            logger.info("🤖 Starting Intent Classifier execution...")
            query = state.get("query") or ""
            system_prompt = INTENT_CLASSIFIER_SYSTEM_PROMPT
            user_prompt = get_intent_classifier_user_prompt(query)
            conversation = [system_prompt,user_prompt]
            structured_llm = self.llm.with_structured_output(IntentClassifierResult)
            response = structured_llm.invoke(conversation)
            
            is_general_query = response.general

            state.update({
                "is_general_query": is_general_query,
            })

            logger.info(f"Intent classification completed: general={is_general_query}")
            return state
                
        except Exception as e:
            logger.error(f"Error in intent classifier node: {e}")
            state.update({
                "is_general_query": False,
            })
            return state

    def global_router(self, state: ChatState):
        try:
            general_query = state.get("is_general_query")

            if general_query == True:
                return "general_response_generator"
            else:
                return "complaint_response_generator"
        except Exception as e:
            logger.error(f"Error in general query router: {e}")
            return "complaint_response_generator"

    def general_response_generator(self, state: ChatState):
        try:
            logger.info("🤖 Starting General Response Generator...")
            query = state.get("query") or ""
            conversation = [
                GENERAL_RESPONSE_GENERATOR_SYSTEM_PROMPT,
                get_general_response_generator_user_prompt(query),
            ]
            structured_llm = self.llm.with_structured_output(GeneralResponseGeneratorResult)
            result = structured_llm.invoke(conversation)
            response_text = result.response
            state.update({"response": response_text})
            logger.info("General response generated and state updated.")
            return state
        except Exception as e:
            logger.error(f"Error in general response generator: {e}")
            state.update({
                "response": "Sorry, I'm not able to answer that right now. Please try asking about your order, fruit quality, or transportation."
            })
            return state

    def complaint_response_generator(self, state: ChatState):
        try:
            logger.info("🤖 Starting Complaint Response Generator...")
            query = state.get("query") or ""
            order_id = state.get("order_id") or ""
            system_prompt = COMPLAINT_RESPONSE_GENERATOR_SYSTEM_PROMPT
            user_prompt = get_complaint_response_generator_user_prompt(query)
            agent = create_agent(
                model=self.llm,
                tools=[get_gradings, get_temperatures, get_placed_order, get_payment_details, insert_complaint, get_complaints_by_order],
                system_prompt=system_prompt,
                response_format=ToolStrategy(AgentFinalResponse),
                state_schema=ChatState,
            )
            result = agent.invoke({"messages": [{"role": "user", "content": user_prompt}]})
            state.update({"response": result.response})
            logger.info("Complaint response generated and state updated.")
            return state
        except Exception as e:
            logger.error(f"Error in complaint response generator: {e}")
            state.update({
                "response": "Sorry, I'm not able to answer that right now. Please try asking about your order, fruit quality, or transportation."
            })
            return state
