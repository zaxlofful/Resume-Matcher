# GitHub Copilot Authentication

## Overview

Resume Matcher now supports GitHub Copilot as an LLM provider through OAuth Device Flow authentication. This allows users to leverage their existing GitHub Copilot subscription for resume tailoring.

## Authentication Flow

### 1. Device Code Initiation

When a user selects GitHub Copilot as their provider and clicks "Sign in with GitHub Copilot", the application:

1. Calls `/api/v1/config/copilot/device-code` (POST)
2. Receives a device code, user code, and verification URI
3. Opens the verification URI in a new browser window
4. Displays the user code for the user to enter

### 2. Authorization

The user:

1. Visits the verification URI (auto-opened)
2. Enters the user code displayed in the app
3. Authorizes the application through GitHub

### 3. Token Exchange

While the user authorizes:

1. The app polls `/api/v1/config/copilot/token` (POST) every few seconds
2. Once authorized, the backend receives the GitHub OAuth access token
3. The backend calls `/api/v1/config/copilot/bearer-token` (POST) to exchange the OAuth token for a Copilot-specific bearer token
4. The bearer token is stored and used for subsequent LLM API calls

## Backend Implementation

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/config/copilot/device-code` | POST | Initiate OAuth device flow |
| `/api/v1/config/copilot/token` | POST | Poll for OAuth token |
| `/api/v1/config/copilot/bearer-token` | POST | Exchange for Copilot bearer token |

### Router: `app/routers/copilot.py`

- **Device Code Flow**: Initiates GitHub OAuth using public client ID `Iv1.b507a08c87ecfe98`
- **Token Polling**: Returns status: `pending`, `success`, `expired`, or `error`
- **Bearer Token Exchange**: Calls GitHub's internal Copilot API with spoofed editor headers

### LiteLLM Integration

GitHub Copilot is configured as a provider with the prefix `github_copilot/`:

```python
provider_prefixes = {
    # ...
    "github-copilot": "github_copilot/",
}
```

Models are specified as `github_copilot/gpt-4o` or similar.

## Frontend Implementation

### Component: `components/copilot-auth-flow.tsx`

A dedicated component that handles the OAuth flow:

- **Device Code Display**: Shows the user code with a copy button
- **Verification Link**: Auto-opens GitHub authorization page
- **Polling**: Continuously polls for authorization status
- **Countdown Timer**: Shows time remaining before code expires
- **Error Handling**: Displays appropriate error messages for failures

### Settings Integration

In the settings page (`app/(default)/settings/page.tsx`):

- GitHub Copilot is added to the provider list
- When selected, instead of showing a standard API key input, the page shows:
  - A "Sign in with GitHub Copilot" button (if not authenticated)
  - A "Re-authenticate with GitHub Copilot" button (if already authenticated)
  - A confirmation message when authenticated

### User Experience

1. User selects "GitHub Copilot" from provider options
2. Clicks "Sign in with GitHub Copilot"
3. OAuth flow component appears
4. Browser window opens to GitHub
5. User enters code and authorizes
6. Component polls and shows success
7. Token is saved automatically
8. User can now use GitHub Copilot models

## Configuration

### Default Model

The default model for GitHub Copilot is `gpt-4o`, but users can configure other supported models like:

- `gpt-4`
- `gpt-4-turbo`
- `claude-3.5-sonnet` (if available through Copilot)

### API Base

The Copilot API endpoint is determined by the authentication response and varies based on the user's Copilot SKU (standard vs. enterprise).

## Security Considerations

1. **Token Storage**: Bearer tokens are stored in the backend config alongside other API keys
2. **Token Expiration**: Copilot tokens are short-lived and may need re-authentication
3. **Subscription Required**: Users must have an active GitHub Copilot subscription
4. **Client ID**: Uses the public GitHub Copilot client ID used by other CLI tools

## Requirements

- Active GitHub Copilot subscription
- GitHub account with Copilot access
- Browser for OAuth flow completion

## Error Handling

The implementation handles several error scenarios:

- **Authorization Pending**: User hasn't completed authorization yet
- **Expired Token**: Device code has expired (15 minutes)
- **Access Denied**: User denied authorization
- **No Subscription**: User doesn't have Copilot access
- **Network Errors**: Connection issues during OAuth flow

## Future Enhancements

Potential improvements:

1. Token refresh mechanism for long-lived sessions
2. Automatic retry on token expiration
3. Display subscription status in settings
4. Support for Copilot Enterprise endpoints
