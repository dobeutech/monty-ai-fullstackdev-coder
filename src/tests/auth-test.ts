import { AuthManager } from '../utils/auth-manager.js';
import { OAuthServer } from '../utils/oauth-server.js';
import { detectClaudeCodeCredentials } from '../utils/claude-code-detector.js';

/**
 * Basic automated test suite for authentication flow
 * Run with: npm test
 */

async function runTests() {
  console.log('Running Authentication Tests...\n');

  try {
    // Test 1: OAuth Server Security
    console.log('Test 1: OAuth Server Security (State & PKCE)');
    const server = new OAuthServer();
    const params = server.getOAuthParams();
    
    if (!params.state || params.state.length < 32) throw new Error('State parameter missing or too short');
    if (!params.code_challenge) throw new Error('Code challenge missing');
    if (params.code_challenge_method !== 'S256') throw new Error('Invalid code challenge method');
    console.log('✅ OAuth params generated correctly');

    // Test 2: Auto Detection
    console.log('\nTest 2: Credential Auto-Detection');
    // Mocking FS would be better, but for now we test the function call
    const creds = await detectClaudeCodeCredentials();
    console.log(creds ? '✅ Credentials found (or at least check completed without error)' : '✅ Auto-detect check completed (no creds found)');

    // Test 3: Auth Manager Instance
    console.log('\nTest 3: Auth Manager Singleton');
    const auth1 = AuthManager.getInstance();
    const auth2 = AuthManager.getInstance();
    if (auth1 !== auth2) throw new Error('Singleton pattern failed');
    console.log('✅ AuthManager singleton works');

    console.log('\n🎉 All basic tests passed!');
  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  }
}

runTests();
