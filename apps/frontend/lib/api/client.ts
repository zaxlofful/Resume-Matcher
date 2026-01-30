/**
 * Centralized API Client
 *
 * Single source of truth for API configuration and base fetch utilities.
 */

// Runtime configuration support
// Reads from window.__RUNTIME_CONFIG__ which is injected via /config.js at startup
// Falls back to build-time env var, then default
declare global {
  interface Window {
    __RUNTIME_CONFIG__?: {
      API_URL?: string;
    };
  }
}

function getApiUrl(): string {
  // In browser, check runtime config first
  if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__?.API_URL) {
    return window.__RUNTIME_CONFIG__.API_URL;
  }
  // Fall back to build-time env var or default
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
}

// Export as getter functions to support runtime configuration
export function getAPIUrl(): string {
  return getApiUrl();
}

export function getAPIBase(): string {
  return `${getApiUrl()}/api/v1`;
}

// Legacy exports for backward compatibility (call getters)
export const API_URL = getApiUrl();
export const API_BASE = getAPIBase();

/**
 * Standard fetch wrapper with common error handling.
 * Returns the Response object for flexibility.
 */
export async function apiFetch(endpoint: string, options?: RequestInit): Promise<Response> {
  const apiBase = getAPIBase();
  const url = endpoint.startsWith('http') ? endpoint : `${apiBase}${endpoint}`;
  return fetch(url, options);
}

/**
 * POST request with JSON body.
 */
export async function apiPost<T>(endpoint: string, body: T): Promise<Response> {
  return apiFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * PATCH request with JSON body.
 */
export async function apiPatch<T>(endpoint: string, body: T): Promise<Response> {
  return apiFetch(endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * PUT request with JSON body.
 */
export async function apiPut<T>(endpoint: string, body: T): Promise<Response> {
  return apiFetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * DELETE request.
 */
export async function apiDelete(endpoint: string): Promise<Response> {
  return apiFetch(endpoint, { method: 'DELETE' });
}

/**
 * Builds the full upload URL for file uploads.
 */
export function getUploadUrl(): string {
  return `${getAPIBase()}/resumes/upload`;
}
