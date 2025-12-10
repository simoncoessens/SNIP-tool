"""Main LangGraph workflow for Company Matcher."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import List

from jinja2 import Environment, FileSystemLoader
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from company_matcher.models import CompanyMatch, CompanyMatchResult
from company_matcher.state import CompanyMatcherInputState, CompanyMatcherState

# Import Tavily tools
# Path: backend/agents/company_matcher/src/company_matcher/graph.py
# parents[3] = backend/agents/ where tools/ is located
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
# Tools
# =============================================================================

@tool
async def web_search(queries: List[str], config: RunnableConfig = None) -> str:
    """Search the web for company information using multiple queries.
    
    Args:
        queries: List of search queries to execute (max 5)
        config: Runtime configuration
    
    Returns:
        Formatted search results
    """
    return await tavily_search_tool(
        queries=queries[:MAX_QUERIES_PER_CALL],
        max_results=10,
        config=config,
    )


@tool
def finish_matching(result_json: str) -> str:
    """Call this when you have determined the exact match or suggestions.
    
    Args:
        result_json: JSON string with the match result in this format:
        {
          "exact_match": {"name": "...", "url": "...", "confidence": "exact"} OR null,
          "suggestions": [{"name": "...", "url": "...", "confidence": "high|medium|low"}, ...]
        }
    
    Returns:
        Confirmation that matching is complete
    """
    return f"Matching complete: {result_json}"


# =============================================================================
# Graph Nodes
# =============================================================================

# Configuration constants
MAX_ITERATIONS = 1
MAX_SUGGESTIONS = 3
MAX_QUERIES_PER_CALL = 5  # Maximum queries per web_search call


def _extract_company_name(messages: list) -> str:
    """Extract company name from the last human message."""
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            if isinstance(message.content, str) and message.content.strip():
                return message.content.strip()
    raise ValueError("No company name found. Please provide the company name.")


TOOLS = [web_search, finish_matching]
tool_node = ToolNode(TOOLS)


async def prepare_prompt(
    state: CompanyMatcherState, config: RunnableConfig | None = None
) -> dict:
    """Build the formatted prompt so the agent always starts from the same context."""
    company_name = _extract_company_name(state.get("messages", []))
    prompt = load_prompt(
        "prompt.jinja",
        company_name=company_name,
        max_iterations=MAX_ITERATIONS,
        max_suggestions=MAX_SUGGESTIONS,
        max_queries_per_call=MAX_QUERIES_PER_CALL,
    )
    return {
        "company_name": company_name,
        "messages": [HumanMessage(content=prompt)],
    }


async def run_agent(
    state: CompanyMatcherState, config: RunnableConfig | None = None
) -> dict:
    """LLM step that decides whether to call tools or produce a final answer."""
    api_key = None
    base_url = None
    if config:
        api_keys = config.get("configurable", {}).get("apiKeys", {})
        api_key = api_keys.get("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY")
        base_url = api_keys.get("OPENAI_BASE_URL") or os.getenv("OPENAI_BASE_URL")
    else:
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("OPENAI_BASE_URL")

    model = ChatOpenAI(
        model="deepseek-chat",
        api_key=api_key,
        base_url=base_url,
        max_tokens=2000,
    ).bind_tools(TOOLS)

    response = await model.ainvoke(state["messages"], config=config)
    return {"messages": [response]}


def _parse_result_from_messages(messages: list[str | AIMessage | ToolMessage]) -> str:
    """Extract the most recent JSON-looking payload from the conversation."""
    for message in reversed(messages):
        content = getattr(message, "content", message)
        if isinstance(content, str) and "{" in content:
            json_start = content.find("{")
            json_end = content.rfind("}") + 1
            return content[json_start:json_end]
    return "{}"


async def finalize_result(
    state: CompanyMatcherState, config: RunnableConfig | None = None
) -> dict:
    """Normalize the agent output to the expected CompanyMatchResult."""
    company_name = state.get("company_name", "")
    raw_json = _parse_result_from_messages(state.get("messages", []))

    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError:
        parsed = {"exact_match": None, "suggestions": []}

    exact_match = None
    if parsed.get("exact_match"):
        exact_match = CompanyMatch(**parsed["exact_match"])

    suggestions = [CompanyMatch(**s) for s in parsed.get("suggestions", [])]

    result = CompanyMatchResult(
        input_name=company_name or "Unknown",
        exact_match=exact_match,
        suggestions=suggestions,
    )

    json_output = result.to_json()
    return {
        "company_name": company_name,
        "match_result": json_output,
        "messages": [AIMessage(content=json_output)],
    }


# =============================================================================
# Graph Construction
# =============================================================================

_builder = StateGraph(
    CompanyMatcherState,
    input=CompanyMatcherInputState,
)

_builder.add_node("prepare_prompt", prepare_prompt)
_builder.add_node("agent", run_agent)
_builder.add_node("tools", tool_node)
_builder.add_node("finalize", finalize_result)

_builder.add_edge(START, "prepare_prompt")
_builder.add_edge("prepare_prompt", "agent")
_builder.add_conditional_edges(
    "agent",
    tools_condition,
    {
        "tools": "tools",
        END: "finalize",
    },
)
_builder.add_edge("tools", "agent")
_builder.add_edge("finalize", END)

# Export the compiled graph
company_matcher = _builder.compile()
