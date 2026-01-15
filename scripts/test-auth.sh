#!/bin/bash

# Authentication Test Script
# Manual testing of authentication flow
# Run this script to verify authentication works as expected

echo "🧪 Authentication Test Suite"
echo "=============================="
echo ""

# Test 1: Check if monty command is available
echo "Test 1: Verify monty command is available"
if ! command -v monty &> /dev/null; then
    echo "✗ monty command not found"
    echo "  Please run: npm link (for local development) or npm install -g @dobeutechsolutions/monty-fullstack-agent"
    exit 1
fi
echo "✓ monty command found"
echo ""

# Test 2: Check authentication status
echo "Test 2: Check current authentication status"
monty whoami
echo ""

# Test 3: Prompt user to test login flow
read -p "Would you like to test the login flow? (y/N): " test_login
if [[ $test_login =~ ^[Yy]$ ]]; then
    echo ""
    echo "Test 3: Testing login flow"
    echo "  Please follow the prompts..."
    monty logout
    monty login

    if [ $? -eq 0 ]; then
        echo "✓ Login successful"
    else
        echo "✗ Login failed"
        exit 1
    fi
    echo ""
fi

# Test 4: Verify authentication after login
echo "Test 4: Verify authentication status after login"
monty whoami
if [ $? -eq 0 ]; then
    echo "✓ Authentication verified"
else
    echo "✗ Authentication check failed"
    exit 1
fi
echo ""

# Test 5: Test agent execution with valid credentials
read -p "Would you like to test agent execution? (y/N): " test_agent
if [[ $test_agent =~ ^[Yy]$ ]]; then
    echo ""
    echo "Test 5: Testing agent execution"
    echo "  Creating temporary test directory..."

    TEST_DIR=$(mktemp -d)
    cd "$TEST_DIR"

    echo "  Running agent in: $TEST_DIR"
    monty init --spec="Build a simple counter app with React"

    if [ $? -eq 0 ]; then
        echo "✓ Agent executed successfully"
    else
        echo "✗ Agent execution failed"
        cd -
        rm -rf "$TEST_DIR"
        exit 1
    fi

    cd -
    rm -rf "$TEST_DIR"
    echo ""
fi

echo "✓ All tests completed!"
echo ""
echo "Manual verification checklist:"
echo "  [ ] Credentials stored in ~/.monty/credentials.json"
echo "  [ ] File permissions are secure (0600 on Unix, restricted on Windows)"
echo "  [ ] monty whoami shows correct authentication method"
echo "  [ ] Agent can start and make API calls"
echo "  [ ] Token expiration is displayed correctly"
echo ""
