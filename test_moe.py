import asyncio
import pandas as pd
import sys
import os
import logging
import numpy as np

# Add current dir to path
sys.path.append(os.getcwd())

try:
    from engine.orchestrator import MoEOrchestrator
except ImportError as e:
    print(f"Import Error: {e}")
    sys.exit(1)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(name)s - %(message)s')

async def main():
    print("--- Starting MoE Integration Test ---")
    
    # 1. Initialize
    if not os.getenv("GEMINI_API_KEY"):
        print("[-] WARNING: GEMINI_API_KEY not set. Agents will fail/mock.", flush=True)

    try:
        moe = MoEOrchestrator()
        print("[+] Orchestrator Initialized", flush=True)
    except Exception as e:
        print(f"[-] Init Failed: {e}", flush=True)
        return

    # 2. Mock Data (Sine wave for RSI movement)
    print("[*] Generating Mock Market Data...")
    x = np.linspace(0, 100, 100)
    prices = 1.0500 + 0.0050 * np.sin(x) # Oscillating price
    
    df = pd.DataFrame({
        'close': prices,
        'open': prices, # Simplified
        'high': prices + 0.0002,
        'low': prices - 0.0002,
        'tick_volume': [1000] * 100
    })
    
    # 3. Runs
    print("[*] requesting consensus...")
    # Mocking a macro context by writing a file temporarily? 
    # Or just relying on the fact that 'loader' returns empty string if no files.
    
    # Let's create a dummy RAG file
    os.makedirs("data/research", exist_ok=True)
    with open("data/research/fed_minutes.txt", "w") as f:
        f.write("The Federal Reserve is likely to pause rate hikes as inflation cools. Markets are optimistic.")
        
    result = await moe.get_consensus_signal("EURUSD", df, news=["Breaking: ECB signals dovish pivot."])
    
    print("\n" + "="*30)
    print("FINAL TRADING DECISION")
    print("="*30)
    print(result)
    print("="*30)

if __name__ == "__main__":
    asyncio.run(main())
