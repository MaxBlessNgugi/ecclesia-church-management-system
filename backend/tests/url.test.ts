/**
 * URL Utilities & Parsing Test Suite — Ecclesia Church Management System
 *
 * Tests the URL parsing, normalization, API base resolution, Socket origin extraction,
 * and hash routing functions in src/utils/url.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeServerUrl,
  resolveApiBaseUrl,
  resolveSocketUrl,
  parseHashRoute,
} from '../../src/utils/url.js';

describe('URL Normalization (normalizeServerUrl)', () => {
  it('handles empty or blank string gracefully', () => {
    expect(normalizeServerUrl('')).toBe('');
    expect(normalizeServerUrl('   ')).toBe('');
  });

  it('prepends http:// if protocol is missing', () => {
    expect(normalizeServerUrl('localhost:5000')).toBe('http://localhost:5000');
    expect(normalizeServerUrl('192.168.1.100:5000')).toBe('http://192.168.1.100:5000');
    expect(normalizeServerUrl('ecclesia.local')).toBe('http://ecclesia.local');
  });

  it('preserves https:// protocol', () => {
    expect(normalizeServerUrl('https://church.example.com')).toBe('https://church.example.com');
    expect(normalizeServerUrl('https://church.example.com:8443')).toBe('https://church.example.com:8443');
  });

  it('strips trailing slashes', () => {
    expect(normalizeServerUrl('http://localhost:5000/')).toBe('http://localhost:5000');
    expect(normalizeServerUrl('https://church.example.com///')).toBe('https://church.example.com');
  });

  it('strips trailing /api or /api/ path segments', () => {
    expect(normalizeServerUrl('http://localhost:5000/api')).toBe('http://localhost:5000');
    expect(normalizeServerUrl('http://localhost:5000/api/')).toBe('http://localhost:5000');
    expect(normalizeServerUrl('https://church.example.com/api')).toBe('https://church.example.com');
  });
});

describe('API Base Resolution (resolveApiBaseUrl)', () => {
  it('defaults to /api when no server or env url is provided', () => {
    expect(resolveApiBaseUrl()).toBe('/api');
    expect(resolveApiBaseUrl(null, undefined)).toBe('/api');
  });

  it('uses saved server URL from localStorage and appends /api without duplicating', () => {
    expect(resolveApiBaseUrl('http://192.168.1.50:5000')).toBe('http://192.168.1.50:5000/api');
    expect(resolveApiBaseUrl('http://192.168.1.50:5000/api')).toBe('http://192.168.1.50:5000/api');
    expect(resolveApiBaseUrl('https://church.org/api/')).toBe('https://church.org/api');
  });

  it('falls back to VITE_API_BASE_URL when savedUrl is null', () => {
    expect(resolveApiBaseUrl(null, 'http://localhost:5000/api')).toBe('http://localhost:5000/api');
    expect(resolveApiBaseUrl(null, 'http://localhost:5000')).toBe('http://localhost:5000/api');
  });
});

describe('Socket URL Resolution (resolveSocketUrl)', () => {
  it('strips /api and returns root host for websockets', () => {
    expect(resolveSocketUrl('http://192.168.1.50:5000/api')).toBe('http://192.168.1.50:5000');
    expect(resolveSocketUrl(null, 'http://localhost:5000/api')).toBe('http://localhost:5000');
  });

  it('falls back to origin when no saved or env url exists', () => {
    expect(resolveSocketUrl(null, undefined, 'http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
  });
});

describe('Hash Route Parsing (parseHashRoute)', () => {
  it('parses simple tabs', () => {
    expect(parseHashRoute('#dashboard')).toEqual({ tab: 'dashboard', subTab: undefined, params: {} });
    expect(parseHashRoute('christian')).toEqual({ tab: 'christian', subTab: undefined, params: {} });
    expect(parseHashRoute('')).toEqual({ tab: '', params: {} });
  });

  it('parses tab and subtab with URI decoding', () => {
    expect(parseHashRoute('#christian/parishioners')).toEqual({
      tab: 'christian',
      subTab: 'parishioners',
      params: {},
    });
    expect(parseHashRoute('#activities/Youth%20Ministry')).toEqual({
      tab: 'activities',
      subTab: 'Youth Ministry',
      params: {},
    });
  });

  it('parses query parameters in hash', () => {
    expect(parseHashRoute('#reports/financial?year=2026&status=active')).toEqual({
      tab: 'reports',
      subTab: 'financial',
      params: { year: '2026', status: 'active' },
    });
  });
});
