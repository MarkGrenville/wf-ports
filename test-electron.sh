#!/bin/bash

echo "🚀 Testing Port Monitor Electron App"
echo "=====================================\n"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if build directory exists
if [ ! -d "build" ]; then
    echo "🏗️  Building React app..."
    npm run build
fi

echo "✅ Starting Electron app..."
echo "   - The app should open in a new window"
echo "   - The Express server will run on port 3001"
echo "   - The React app will be served from the build directory"
echo "   - You can close the app by pressing Cmd+Q or closing the window"
echo ""
echo "🔍 Testing API health check..."

# Start Electron in the background and capture PID
npm run electron &
ELECTRON_PID=$!

# Wait for server to start
sleep 5

# Test API health
echo "📡 Checking if Express server is running..."
if curl -s http://localhost:3001/api/health | grep -q "ok"; then
    echo "✅ Express server is running correctly!"
    echo "✅ API health check passed!"
else
    echo "❌ Express server is not responding properly"
fi

echo ""
echo "🎉 Electron app is running!"
echo "   - PID: $ELECTRON_PID"
echo "   - Server: http://localhost:3001"
echo "   - To stop: kill $ELECTRON_PID or close the app window"
echo ""
echo "📝 To run the app manually:"
echo "   npm run electron          # Production mode"
echo "   npm run electron-dev      # Development mode"
echo "   npm run dist             # Build distribution"
echo ""

# Wait for user to press Enter
read -p "Press Enter to stop the test app..."

# Kill the Electron process
kill $ELECTRON_PID 2>/dev/null || true

echo "✅ Test complete!"
echo "🎯 Your Electron app is ready to use!" 