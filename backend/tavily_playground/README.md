# Tavily playground

Quick scratch space to try the new `TavilyClient.research` endpoint.

## Setup

- Ensure Python deps are installed: `pip install -r backend/requirements.txt`
- Export your Tavily key (never commit it): `export TAVILY_API_KEY="tvly-..."`.

## Run

- Default query: `python backend/tavily_playground/research_demo.py`
- Custom query: `python backend/tavily_playground/research_demo.py "Latest AI developments"`
