#!/bin/bash
# Quick start script for the Bias Detector

cd "$(dirname "$0")"

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Run the Flask app
python3 app.py
