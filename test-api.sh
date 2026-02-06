#!/bin/bash
# Test script for TL Voice Inbox API

echo "=== TL Voice Inbox API Test ==="
echo ""

API_URL="${1:-http://localhost:3000}"
echo "Testing API at: $API_URL"
echo ""

# Test health
echo "1. Testing health endpoint..."
curl -s "$API_URL/api/health" | jq . 2>/dev/null || curl -s "$API_URL/api/health"
echo ""
echo ""

# Create test event
echo "2. Creating test event..."
EVENT_RESPONSE=$(curl -s -X POST "$API_URL/api/events/test" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test from curl", "rawTranscript": "This is a test transcript for debugging"}')
echo "$EVENT_RESPONSE" | jq . 2>/dev/null || echo "$EVENT_RESPONSE"
echo ""

# Extract event ID
EVENT_ID=$(echo "$EVENT_RESPONSE" | grep -o '"eventId":"[^"]*"' | cut -d'"' -f4)
echo "Created event ID: $EVENT_ID"
echo ""

# List events
echo "3. Listing events..."
curl -s "$API_URL/api/events?limit=5" | jq . 2>/dev/null || curl -s "$API_URL/api/events?limit=5"
echo ""
echo ""

# Create action
echo "4. Creating test action..."
ACTION_RESPONSE=$(curl -s -X POST "$API_URL/api/actions" \
  -H "Content-Type: application/json" \
  -d "{
    \"sourceEventId\": \"$EVENT_ID\",
    \"title\": \"Test Action from curl\",
    \"type\": \"follow_up\",
    \"priority\": \"P1\",
    \"body\": \"This is a test action\"
  }")
echo "$ACTION_RESPONSE" | jq . 2>/dev/null || echo "$ACTION_RESPONSE"
echo ""

# List actions
echo "5. Listing actions..."
curl -s "$API_URL/api/actions?limit=5" | jq . 2>/dev/null || curl -s "$API_URL/api/actions?limit=5"
echo ""
echo ""

# Create knowledge
echo "6. Creating test knowledge..."
KNOWLEDGE_RESPONSE=$(curl -s -X POST "$API_URL/api/knowledge" \
  -H "Content-Type: application/json" \
  -d "{
    \"sourceEventId\": \"$EVENT_ID\",
    \"title\": \"Test Knowledge from curl\",
    \"kind\": \"tech\",
    \"bodyMd\": \"# Test Knowledge\\n\\nThis is test content\",
    \"tags\": [\"test\", \"curl\"]
  }")
echo "$KNOWLEDGE_RESPONSE" | jq . 2>/dev/null || echo "$KNOWLEDGE_RESPONSE"
echo ""

# List knowledge
echo "7. Listing knowledge..."
curl -s "$API_URL/api/knowledge?limit=5" | jq . 2>/dev/null || curl -s "$API_URL/api/knowledge?limit=5"
echo ""
echo ""

echo "=== Test Complete ==="
echo ""
echo "If all requests succeeded, the API is working correctly."
echo "If web app still fails, the issue is browser-side (ad blockers, CORS, etc.)"
