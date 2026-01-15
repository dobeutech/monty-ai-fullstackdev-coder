import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { randomBytes, createHash } from 'crypto';

export interface OAuthResult {
  code?: string;
  state?: string;
  error?: string;
  codeVerifier?: string;
}

export class OAuthServer {
  private server: any;
  private port: number;
  private callbackPath: string;
  private state: string;
  private codeVerifier: string;
  private codeChallenge: string;

  constructor(port = 9876, callbackPath = '/callback') {
    this.port = port;
    this.callbackPath = callbackPath;
    
    // Generate secure state and PKCE values
    this.state = this.generateRandomString(32);
    this.codeVerifier = this.generateRandomString(64);
    this.codeChallenge = this.generateCodeChallenge(this.codeVerifier);
  }

  /**
   * Generate cryptographically secure random string
   */
  private generateRandomString(length: number): string {
    return randomBytes(length)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
      .substring(0, length);
  }

  /**
   * Generate PKCE code challenge (S256)
   */
  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Get OAuth parameters to use in the authorization URL
   */
  public getOAuthParams() {
    return {
      state: this.state,
      code_challenge: this.codeChallenge,
      code_challenge_method: 'S256'
    };
  }

  /**
   * Starts the local server and waits for the OAuth callback
   * @param timeoutMs Timeout in milliseconds (default: 5 minutes)
   */
  public waitForCallback(timeoutMs = 5 * 60 * 1000): Promise<OAuthResult> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      // Create server
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        try {
          if (!req.url) return;
          
          const url = new URL(req.url, `http://localhost:${this.port}`);
          
          // Only handle the callback path
          if (url.pathname !== this.callbackPath) {
            res.statusCode = 404;
            res.end('Not Found');
            return;
          }

          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');

          // Validate state parameter to prevent CSRF
          if (state && state !== this.state) {
            this.sendErrorResponse(res, 'Invalid state parameter - possible CSRF attempt');
            if (!resolved) {
              resolved = true;
              resolve({ error: 'Invalid state parameter' });
              this.shutdown();
            }
            return;
          }

          if (code) {
            this.sendSuccessResponse(res);
            if (!resolved) {
              resolved = true;
              resolve({ 
                code, 
                state: state || undefined,
                codeVerifier: this.codeVerifier // Return verifier for token exchange
              });
              this.shutdown();
            }
          } else if (error) {
            this.sendErrorResponse(res, error);
            if (!resolved) {
              resolved = true;
              resolve({ error });
              this.shutdown();
            }
          } else {
            this.sendErrorResponse(res, 'No code received');
            if (!resolved) {
              resolved = true;
              resolve({ error: 'No code received' });
              this.shutdown();
            }
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          if (!resolved) {
            resolved = true;
            reject(new Error(`Server error: ${errorMessage}`));
            this.shutdown();
          }
        }
      });

      // Handle server errors
      this.server.on('error', (err: Error) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      // Start listening
      this.server.listen(this.port, () => {
        // Set timeout
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            reject(new Error('OAuth timeout: No callback received within 5 minutes'));
            this.shutdown();
          }
        }, timeoutMs);
      });
    });
  }

  private sendSuccessResponse(res: ServerResponse) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Successful</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; text-align: center; padding-top: 50px; }
            h1 { color: #10a37f; }
            p { color: #666; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Authentication Successful!</h1>
            <p>You have successfully logged in. You can now close this window and return to the terminal.</p>
          </div>
          <script>window.close();</script>
        </body>
      </html>
    `);
  }

  private sendErrorResponse(res: ServerResponse, error: string) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/html');
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; text-align: center; padding-top: 50px; }
            h1 { color: #ef4444; }
            p { color: #666; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Authentication Failed</h1>
            <p>Error: ${error}</p>
            <p>Please return to the terminal and try again.</p>
          </div>
        </body>
      </html>
    `);
  }

  private shutdown() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
