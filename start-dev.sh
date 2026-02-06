#!/bin/bash
# Quick start script for development

echo "🚀 Starting API-Watch Development Environment..."
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.11+"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+"
    exit 1
fi

# Backend setup
echo "📦 Setting up backend..."
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing Python dependencies..."
pip install -r requirements.txt --quiet

# Frontend setup
echo ""
echo "📦 Setting up frontend..."
cd frontend

if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install --silent
fi

cd ..

# Start services
echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 Starting services..."
echo "   Backend: http://localhost:8000"
echo "   Frontend: http://localhost:5173"
echo "   API Docs: http://localhost:8000/docs"
echo ""

# Start backend in background
echo "Starting backend server..."
python src/api_server.py &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Start frontend
echo "Starting frontend server..."
cd frontend
npm run dev

# Cleanup on exit
trap "echo ''; echo '🛑 Shutting down...'; kill $BACKEND_PID; exit 0" INT TERM

wait
