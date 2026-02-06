#!/bin/bash
# Azure App Service startup script for the backend
# Azure sets PORT env var automatically

pip install -r requirements.txt
python src/api_server.py
