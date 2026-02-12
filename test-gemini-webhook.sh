#!/bin/bash
# Test Gemini Webhook Script

HOOK="./gemini-hooks.sh"

echo "--- Testing Gemini Webhook ---"

echo "1. Testing 'spawn'..."
$HOOK spawn "Unit Test Running"
if [ $? -eq 0 ]; then echo "✅ Success"; else echo "❌ Failed"; exit 1; fi

sleep 1

echo "2. Testing 'tool_start'..."
$HOOK tool_start "TestTool" "Verifying webhook logic"
if [ $? -eq 0 ]; then echo "✅ Success"; else echo "❌ Failed"; exit 1; fi

sleep 1

echo "3. Testing 'tool_end'..."
$HOOK tool_end "TestTool"
if [ $? -eq 0 ]; then echo "✅ Success"; else echo "❌ Failed"; exit 1; fi

sleep 1

echo "4. Testing 'message'..."
$HOOK message "Webhook tests completed successfully! 🚀"
if [ $? -eq 0 ]; then echo "✅ Success"; else echo "❌ Failed"; exit 1; fi

echo "--- All Tests Passed ---"
