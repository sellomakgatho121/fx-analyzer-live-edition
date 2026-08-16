import os
from dotenv import load_dotenv

load_dotenv()

key = os.getenv("OPENCODE_API_KEY")
if not key:
    print("No OPENCODE_API_KEY found")
    exit()

try:
    from openai import OpenAI
except ImportError:
    print("openai package not installed")
    exit()

client = OpenAI(api_key=key, base_url="https://opencode.ai/zen/v1")

print("Available Models:")
try:
    for m in client.models.list():
        print(f"- {m.id}")
except Exception as e:
    print(f"Error listing models: {e}")
