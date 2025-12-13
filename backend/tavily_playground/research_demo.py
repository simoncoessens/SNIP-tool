"""Small playground script for the Tavily research endpoint."""

import json
import os
import sys
import time
from typing import Any, Dict

from dotenv import load_dotenv
from tavily import TavilyClient


def run_research(query: str, api_key: str) -> Dict[str, Any]:
    """Execute the Tavily research endpoint and return the final response."""
    client = TavilyClient(api_key=api_key)
    job = client.research(query)

    # If the API returns a job in pending state, poll until completed or failed.
    if isinstance(job, dict) and job.get("status") == "pending" and job.get("request_id"):
        request_id = job["request_id"]
        for _ in range(60):  # ~60 seconds max, adjust as needed
            time.sleep(1)
            result = client.get_research(request_id)
            status = result.get("status")
            if status in ("completed", "failed"):
                return result
        # Timed out waiting; return last seen job state
        return {"status": "timeout", "request_id": request_id}

    return job


def main() -> None:
    # Load environment variables from a local .env so users can keep keys out of shell history.
    load_dotenv()

    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        print("Error: set the TAVILY_API_KEY environment variable before running.")
        sys.exit(1)

    # Allow overriding the default query from the command line
    query = " ".join(sys.argv[1:]).strip() or "What is the main establishment of Telenet in Belgium?"

    try:
        response = run_research(query, api_key)
    except Exception as exc:  # pragma: no cover - manual playground script
        print(f"Request failed: {exc}")
        sys.exit(1)

    print(json.dumps(response, indent=2))


if __name__ == "__main__":
    main()

