"""Shared pytest fixtures for the FX Analyzer engine test suite."""

import os
import sys

import pytest

# Make the engine package importable regardless of the cwd pytest runs from.
ENGINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(ENGINE_DIR)
for _p in (ENGINE_DIR, PROJECT_ROOT):
    if _p not in sys.path:
        sys.path.insert(0, _p)


@pytest.fixture
def anyio_backend():
    return "asyncio"
