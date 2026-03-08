import os
from dotenv import load_dotenv
import logging
import boto3
from botocore.config import Config
from langchain_aws import ChatBedrockConverse

load_dotenv()

CLAUDE_MODEL = os.getenv("AWS_CLAUDE_MODEL", "apac.anthropic.claude-3-5-sonnet-20240620-v1:0")
AWS_REGION = os.getenv("AWS_REGION", "eu-west-2")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

_bedrock_config = Config(
    max_pool_connections=50,
    retries={"max_attempts": 3, "mode": "adaptive"},
    connect_timeout=30,
    read_timeout=300,
)


def get_llm() -> ChatBedrockConverse:
    """Return configured LLM instance."""
    logger.info("Initializing LLM with model: %s in region: %s", CLAUDE_MODEL, AWS_REGION)
    aws_access_key_id = os.getenv("AWS_ACCESS_KEY_ID")
    aws_secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")
    bedrock_client_kwargs = {
        "service_name": "bedrock-runtime",
        "region_name": AWS_REGION,
        "config": _bedrock_config,
    }
    if aws_access_key_id and aws_secret_access_key:
        bedrock_client_kwargs["aws_access_key_id"] = aws_access_key_id
        bedrock_client_kwargs["aws_secret_access_key"] = aws_secret_access_key
    try:
        bedrock_client = boto3.client(**bedrock_client_kwargs)
    except Exception as e:
        logger.error("Error creating Bedrock client: %s", e)
        raise
    return ChatBedrockConverse(
        model=CLAUDE_MODEL,
        region_name=AWS_REGION,
        client=bedrock_client,
    )
