'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ExternalLink, CheckCircle2, XCircle, Copy, Check } from 'lucide-react';
import {
  initiateCopilotDeviceFlow,
  pollCopilotToken,
  exchangeCopilotBearerToken,
  type CopilotDeviceCodeResponse,
} from '@/lib/api/config';

interface CopilotAuthFlowProps {
  onSuccess: (token: string) => void;
  onCancel: () => void;
}

type AuthStatus = 'idle' | 'loading' | 'waiting' | 'success' | 'error' | 'expired';

export function CopilotAuthFlow({ onSuccess, onCancel }: CopilotAuthFlowProps) {
  const [status, setStatus] = useState<AuthStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<CopilotDeviceCodeResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Start the device flow
  const startDeviceFlow = async () => {
    setStatus('loading');
    setError(null);

    try {
      const response = await initiateCopilotDeviceFlow();
      setDeviceCode(response);
      setCountdown(response.expires_in);
      setStatus('waiting');

      // Auto-open verification URL in a new window
      window.open(response.verification_uri, '_blank', 'width=600,height=800');

      // Start polling for token
      pollForToken(response.device_code, response.interval);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start authentication');
      setStatus('error');
    }
  };

  // Poll for OAuth token
  const pollForToken = async (deviceCodeValue: string, interval: number) => {
    const startTime = Date.now();
    const maxTime = 15 * 60 * 1000; // 15 minutes

    const poll = async () => {
      try {
        const response = await pollCopilotToken(deviceCodeValue);

        if (response.status === 'success' && response.access_token) {
          // Exchange for bearer token
          try {
            const bearerResponse = await exchangeCopilotBearerToken(deviceCodeValue);
            setStatus('success');
            onSuccess(bearerResponse.token);
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : 'Failed to obtain Copilot token. Please ensure you have an active GitHub Copilot subscription.'
            );
            setStatus('error');
          }
          return;
        } else if (response.status === 'expired') {
          setError('Device code has expired. Please try again.');
          setStatus('expired');
          return;
        } else if (response.status === 'error') {
          setError(response.error || 'Authentication failed');
          setStatus('error');
          return;
        }

        // Continue polling if pending
        if (response.status === 'pending') {
          const elapsed = Date.now() - startTime;
          if (elapsed < maxTime) {
            setTimeout(poll, interval * 1000);
          } else {
            setError('Authentication timed out. Please try again.');
            setStatus('expired');
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check authorization status');
        setStatus('error');
      }
    };

    poll();
  };

  // Countdown timer
  useEffect(() => {
    if (status === 'waiting' && countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            setError('Device code has expired. Please try again.');
            setStatus('expired');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [status, countdown]);

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Format time remaining
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4 border border-black p-6 bg-white">
      <div className="space-y-2">
        <h3 className="text-lg font-serif font-bold">GitHub Copilot Authentication</h3>
        <p className="text-sm text-gray-600 font-mono">
          Sign in with your GitHub account to use GitHub Copilot models.
        </p>
      </div>

      {status === 'idle' && (
        <div className="space-y-4">
          <p className="text-sm font-mono">
            Click the button below to start the authentication process. You'll be redirected to
            GitHub to authorize this application.
          </p>
          <div className="flex gap-2">
            <Button onClick={startDeviceFlow}>Start Authentication</Button>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex items-center gap-2 text-sm font-mono">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Initializing authentication...</span>
        </div>
      )}

      {status === 'waiting' && deviceCode && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-300 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <ExternalLink className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-mono font-bold mb-2">Step 1: Open GitHub</p>
                <p className="text-xs font-mono mb-2 text-gray-600">
                  A new window should have opened. If not, click below:
                </p>
                <a
                  href={deviceCode.verification_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-mono text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  {deviceCode.verification_uri}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <div className="border-t border-blue-200 pt-3">
              <p className="text-sm font-mono font-bold mb-2">Step 2: Enter this code:</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white border border-black p-3">
                  <code className="text-2xl font-mono font-bold tracking-wider">
                    {deviceCode.user_code}
                  </code>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(deviceCode.user_code)}
                  className="flex items-center gap-1"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-300">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span className="text-sm font-mono">Waiting for authorization...</span>
            </div>
            <span className="text-sm font-mono text-gray-500">
              Expires in: {formatTime(countdown)}
            </span>
          </div>

          <Button variant="outline" onClick={onCancel} className="w-full">
            Cancel
          </Button>
        </div>
      )}

      {status === 'success' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-mono font-bold">Authentication successful!</span>
          </div>
          <p className="text-sm font-mono text-gray-600">
            Your GitHub Copilot token has been saved. You can now use GitHub Copilot models.
          </p>
        </div>
      )}

      {(status === 'error' || status === 'expired') && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 text-red-600">
            <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-mono font-bold mb-1">Authentication failed</p>
              <p className="text-sm font-mono">{error}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={startDeviceFlow}>Try Again</Button>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
