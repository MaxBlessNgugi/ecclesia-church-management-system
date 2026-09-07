/**
 * Socket.IO Origin Resolution Test Suite — Ecclesia Church Management System
 *
 * resolveSocketOrigins() decides which browser origins may open real-time
 * Socket.IO connections. CLIENT_URL and CORS_ORIGINS (comma-separated) both
 * feed the allow-list; when neither is configured the LAN default applies and
 * every origin is allowed (the browser always connects back to the origin it
 * was served from, which may be localhost, a hostname, or an IP address).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { resolveSocketOrigins } from '../src/lib/socket.js';

const ORIGINAL: Record<string, string | undefined> = {
  CLIENT_URL: process.env.CLIENT_URL,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('resolveSocketOrigins', () => {
  it('allows every origin when neither CLIENT_URL nor CORS_ORIGINS is set (LAN default)', () => {
    delete process.env.CLIENT_URL;
    delete process.env.CORS_ORIGINS;
    expect(resolveSocketOrigins()).toBe(true);
  });

  it('treats blank values as unset (the compose example ships empty strings)', () => {
    process.env.CLIENT_URL = '';
    process.env.CORS_ORIGINS = '   ';
    expect(resolveSocketOrigins()).toBe(true);
  });

  it('restricts to CLIENT_URL when only it is configured', () => {
    process.env.CLIENT_URL = 'http://ecclesia.local';
    delete process.env.CORS_ORIGINS;
    expect(resolveSocketOrigins()).toEqual(['http://ecclesia.local']);
  });

  it('restricts to CORS_ORIGINS when only it is configured', () => {
    delete process.env.CLIENT_URL;
    process.env.CORS_ORIGINS = 'http://ecclesia.local,http://192.168.1.20:5000';
    expect(resolveSocketOrigins()).toEqual([
      'http://ecclesia.local',
      'http://192.168.1.20:5000',
    ]);
  });

  it('unions CLIENT_URL and CORS_ORIGINS and trims stray whitespace', () => {
    process.env.CLIENT_URL = 'https://church.example.com';
    process.env.CORS_ORIGINS = ' http://ecclesia.local , http://localhost:5000 ';
    expect(resolveSocketOrigins()).toEqual([
      'https://church.example.com',
      'http://ecclesia.local',
      'http://localhost:5000',
    ]);
  });
});
