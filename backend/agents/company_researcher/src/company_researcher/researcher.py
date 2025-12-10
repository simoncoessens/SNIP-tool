"""Research agent with tool calling for company research."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import List

from jinja2 import Environment, FileSystemLoader
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

from company_researcher.configuration import Configuration
from company_researcher.utils import get_api_key_for_model

# Import Tavily tools from shared location
import sys
# Add backend/agents to path to import tools
agents_path = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(agents_path))
from tools import tavily_search_tool


# =============================================================================
# Prompt Loading
# =============================================================================

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"

_jinja_env = Environment(
    loader=FileSystemLoader(str(PROMPTS_DIR)),
    trim_blocks=True,
    lstrip_blocks=True,
)


def load_prompt(template_name: str, **kwargs) -> str:
    """Load and render a Jinja2 prompt template."""
    template = _jinja_env.get_template(template_name)
    return template.render(**kwargs)


# =============================================================================
# Research Tools
# =============================================================================

@tool
async def web_search(queries: List[str], config: RunnableConfig = None) -> str:
    """Search the web for information using multiple queries.
    
    Args:
        queries: List of search queries to execute (max 3)
        config: Runtime configuration
    
    Returns:
        Formatted search results
    """
    cfg = Configuration.from_runnable_config(config) if config else Configuration()
    return await tavily_search_tool(
        queries=queries[:cfg.max_search_queries],
        max_results=cfg.max_search_results,
        config=config,
    )


@tool
def finish_research(summary: str) -> str:
    """Call this when you have gathered enough information to answer the question.
    
    Args:
        summary: Your final summary answering the research question
    
    Returns:
        Confirmation that research is complete
    """
    return f"Research complete: {summary}"


def get_research_tools():
    return [web_search, finish_research]
