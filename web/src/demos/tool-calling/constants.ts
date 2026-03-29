export const MODELS = [
  { id: "onnx-community/LFM2-350M-ONNX", label: "LFM2-350M (fast)" },
  { id: "onnx-community/LFM2-700M-ONNX", label: "LFM2-700M" },
  {
    id: "LiquidAI/LFM2.5-1.2B-Instruct-ONNX",
    label: "LFM2.5-1.2B Instruct (best)",
  },
];

export const DEFAULT_TOOLS_CODE = `\
# Define your Python-style tools here.
# Each function will be available for the model to call.

def get_weather(location: str, unit: str = "celsius") -> dict:
    """Get the current weather for a location.
    
    Args:
        location: The city/location to get weather for.
        unit: Temperature unit - "celsius" or "fahrenheit".
    """
    # Simulated weather data
    return {
        "location": location,
        "temperature": 22 if unit == "celsius" else 72,
        "unit": unit,
        "condition": "sunny",
        "humidity": 65,
    }


def calculate(expression: str) -> dict:
    """Evaluate a mathematical expression.
    
    Args:
        expression: A Python math expression to evaluate (e.g., "2 ** 10 + 42").
    """
    import math
    try:
        allowed = {k: getattr(math, k) for k in dir(math) if not k.startswith('_')}
        result = eval(expression, {"__builtins__": {}}, allowed)
        return {"result": result, "expression": expression}
    except Exception as e:
        return {"error": str(e)}


def search_web(query: str, num_results: int = 3) -> dict:
    """Search the web for information (simulated).
    
    Args:
        query: Search query string.
        num_results: Number of results to return (1-10).
    """
    return {
        "query": query,
        "results": [
            {"title": f"Result {i+1} for '{query}'", "url": f"https://example.com/{i+1}", "snippet": f"Information about {query} from source {i+1}."}
            for i in range(min(num_results, 10))
        ]
    }
`;

export const SYSTEM_PROMPT = `You are a helpful assistant with access to tools. When you need to call a tool, use the following Python-style syntax:

tool_name(arg1="value1", arg2="value2")

Only call one tool at a time. Wait for the result before calling another tool.`;

export const EXAMPLE_PROMPTS = [
  "What's the weather like in Tokyo and Paris?",
  "Calculate the 50th Fibonacci number",
  "Search the web for the latest LLM benchmarks",
  "What is 2^32 + the square root of 144?",
  "Find information about WebGPU browser support",
];
