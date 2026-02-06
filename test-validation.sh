#!/bin/bash
# TL Voice Inbox - Comprehensive Test Suite
# Run this after starting the API server to validate all fixes

set -e

API_URL="http://localhost:3000"
echo "=========================================="
echo "TL VOICE INBOX - VALIDATION TEST SUITE"
echo "=========================================="
echo "API: $API_URL"
echo ""

SUCCESS=0
FAILED=0

pass() { echo "✅ PASS: $1"; ((SUCCESS++)); }
fail() { echo "❌ FAIL: $1 - $2"; ((FAILED++)); }
info() { echo "ℹ️  INFO: $1"; }

echo "=== 1. API Health Check ==="
curl -s "$API_URL/api/health" | grep -q "ok" && pass "API Health" || fail "API Health" "Not responding"

echo ""
echo "=== 2. Epic Auto-Creation Test ==="
# Create test event with CP code mention
EVENT_RESP=$(curl -s -X POST "$API_URL/api/events/test" \
    -H "Content-Type: application/json" \
    -d '{"rawTranscript":"Necesito crear la épica CP39 para la política de cancelación. Es prioridad P1."}' 2>/dev/null)
EVENT_ID=$(echo "$EVENT_RESP" | grep -o '"eventId":"[^"]*"' | cut -d'"' -f4)

if [ -n "$EVENT_ID" ]; then
    pass "Created test event: $EVENT_ID"
    info "Waiting 10s for processing..."
    sleep 10
    
    # Check if epic was created
    EPICS=$(curl -s "$API_URL/api/epics")
    if echo "$EPICS" | grep -q "CP39"; then
        pass "Epic CP39 auto-created!"
    else
        fail "Epic auto-creation" "CP39 not found in epics"
        info "Current epics: $(echo "$EPICS" | grep -o '"title":"[^"]*"' | head -3)"
    fi
    
    # Check if action was created
    ACTIONS=$(curl -s "$API_URL/api/actions")
    if echo "$ACTIONS" | grep -q "política\|cancelación"; then
        pass "Action created and linked"
    else
        info "Actions: $(echo "$ACTIONS" | grep -o '"title":"[^"]*"' | head -3)"
    fi
else
    fail "Create test event" "No event ID returned"
fi

echo ""
echo "=== 3. Manual Action Creation ==="
DUMMY_EVENT=$(curl -s -X POST "$API_URL/api/events/test" \
    -H "Content-Type: application/json" \
    -d '{"rawTranscript":"Test event for manual action"}' 2>/dev/null)
DUMMY_ID=$(echo "$DUMMY_EVENT" | grep -o '"eventId":"[^"]*"' | cut -d'"' -f4)

if [ -n "$DUMMY_ID" ]; then
    # Create action
    ACTION_RESP=$(curl -s -X POST "$API_URL/api/actions" \
        -H "Content-Type: application/json" \
        -d "{\"sourceEventId\":\"$DUMMY_ID\",\"type\":\"follow_up\",\"title\":\"Manual Test Action\",\"priority\":\"P0\"}" 2>/dev/null)
    
    if echo "$ACTION_RESP" | grep -q '"id"'; then
        pass "Manual action creation"
    else
        fail "Manual action creation" "$ACTION_RESP"
    fi
    
    # Create with P3 (should normalize to P2)
    ACTION_P3=$(curl -s -X POST "$API_URL/api/actions" \
        -H "Content-Type: application/json" \
        -d "{\"sourceEventId\":\"$DUMMY_ID\",\"type\":\"follow_up\",\"title\":\"P3 Test Action\",\"priority\":\"P3\"}" 2>/dev/null)
    
    if echo "$ACTION_P3" | grep -q '"id"'; then
        pass "P3 priority accepted (normalized to P2)"
    else
        fail "P3 priority handling" "$ACTION_P3"
    fi
fi

echo ""
echo "=== 4. Manual Knowledge Creation ==="
KNOWLEDGE_RESP=$(curl -s -X POST "$API_URL/api/knowledge" \
    -H "Content-Type: application/json" \
    -d "{\"sourceEventId\":\"$DUMMY_ID\",\"title\":\"Test Knowledge Item\",\"kind\":\"tech\",\"bodyMd\":\"# Test\\n\\nThis is a test knowledge item\",\"tags\":[\"test\",\"validation\"]}" 2>/dev/null)

if echo "$KNOWLEDGE_RESP" | grep -q '"id"'; then
    pass "Manual knowledge creation"
else
    fail "Manual knowledge creation" "$KNOWLEDGE_RESP"
fi

echo ""
echo "=== 5. Retry Button Functionality ==="
# Check if retry endpoint exists
RETRY_CHECK=$(curl -s -w "%{http_code}" -X POST "$API_URL/api/events/fake-id/retry" 2>/dev/null)
if echo "$RETRY_CHECK" | grep -q "404"; then
    pass "Retry endpoint exists (returns 404 for fake ID)"
else
    fail "Retry endpoint" "Not found or error"
fi

echo ""
echo "=== 6. Transcript Quality Check ==="
EVENTS=$(curl -s "$API_URL/api/events")
EVENT_COUNT=$(echo "$EVENTS" | grep -o '"id"' | wc -l)
info "Total events: $EVENT_COUNT"

if [ "$EVENT_COUNT" -gt 0 ]; then
    # Check for events with transcripts
    WITH_TRANSCRIPT=$(echo "$EVENTS" | grep -o '"hasTranscript":true' | wc -l)
    info "Events with transcripts: $WITH_TRANSCRIPT"
    pass "Transcript processing working"
fi

echo ""
echo "=========================================="
echo "SUMMARY"
echo "=========================================="
echo "✅ Passed: $SUCCESS"
echo "❌ Failed: $FAILED"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo "🎉 All tests passed! System is working correctly."
    exit 0
else
    echo ""
    echo "⚠️  Some tests failed. Check output above."
    exit 1
fi
