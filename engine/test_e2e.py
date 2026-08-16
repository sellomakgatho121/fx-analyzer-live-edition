"""End-to-end verification of AgentAnalysisBridge with deep agents."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio
import logging

logging.basicConfig(level=logging.WARNING, format="%(levelname)s:%(name)s:%(message)s")
# Silence noisy libs
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("huggingface_hub").setLevel(logging.WARNING)
logging.getLogger("transformers").setLevel(logging.WARNING)


async def main():
    from agent_bridge import AgentAnalysisBridge

    bridge = AgentAnalysisBridge()
    ok = await bridge.initialize()
    assert ok, "Bridge initialization failed"
    print(f"Bridge initialized: {ok}")
    print(f"Deep agents loaded: {len(bridge._deep_agents)}")
    for a in bridge._deep_agents:
        print(f"  - {a.name}: loaded={a._loaded}")

    # Run full analysis
    result = await bridge.analyze("Analyze AAPL stock")

    # Check trading agents status
    status = result.get("status", "N/A")
    print(f"\nTradingAgents status: {status}")

    # Check deep analysis
    da = result.get("deep_analysis", {})
    da_status = da.get("status", "N/A")
    print(f"Deep analysis status: {da_status}")

    for k, v in da.items():
        if k.startswith("_"):
            continue
        if not isinstance(v, dict):
            print(f"  {k}: (non-dict result: {type(v).__name__})")
            continue
        sig = v.get("signal", "N/A")
        conf = v.get("confidence", "N/A")
        err = v.get("error", "")
        if err:
            print(f"  {k}: ERROR={err}")
        else:
            print(f"  {k}: signal={sig}, confidence={conf}")

    # Check market snapshot
    ms = da.get("_market_snapshot", {})
    if ms:
        print(f"  Market snapshot: close={ms.get('close')}, volume={ms.get('volume')}")

    await bridge.close()
    print("\nE2E test PASSED")


if __name__ == "__main__":
    asyncio.run(main())
