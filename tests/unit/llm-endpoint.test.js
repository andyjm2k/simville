/**
 * Unit tests for the LLM endpoint SSRF guard (src/main/llm-endpoint.js).
 * The validator is a pure function, so it is tested directly without
 * Electron — the same function main.js uses for llm:test-connection.
 */
import { describe, it, expect } from 'vitest';
import { isAllowedLlmEndpoint } from '../../src/main/llm-endpoint.js';

describe('isAllowedLlmEndpoint', () => {
  it('allows public hostnames', () => {
    expect(isAllowedLlmEndpoint('https://api.openai.com/v1').ok).toBe(true);
    expect(isAllowedLlmEndpoint('http://llm.example.com:8080/v1').ok).toBe(true);
  });

  it('allows localhost and 127.0.0.1 for local LLM servers', () => {
    expect(isAllowedLlmEndpoint('http://localhost:11434/v1').ok).toBe(true);
    expect(isAllowedLlmEndpoint('http://127.0.0.1:1234/v1').ok).toBe(true);
  });

  it('blocks private IPv4 ranges', () => {
    for (const host of ['10.0.0.5', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.1.1']) {
      expect(isAllowedLlmEndpoint(`http://${host}/v1`).ok).toBe(false);
    }
    // 172.32.x is public space, not 172.16/12
    expect(isAllowedLlmEndpoint('http://172.32.0.1/v1').ok).toBe(true);
  });

  it('blocks cloud metadata and link-local addresses', () => {
    expect(isAllowedLlmEndpoint('http://169.254.169.254/latest/meta-data/').ok).toBe(false);
    expect(isAllowedLlmEndpoint('http://169.254.10.20/v1').ok).toBe(false);
  });

  it('blocks loopback forms other than localhost / 127.0.0.1', () => {
    expect(isAllowedLlmEndpoint('http://127.0.0.2/v1').ok).toBe(false);
    expect(isAllowedLlmEndpoint('http://127.1.2.3/v1').ok).toBe(false);
    expect(isAllowedLlmEndpoint('http://[::1]:11434/v1').ok).toBe(false);
    expect(isAllowedLlmEndpoint('http://[::]/v1').ok).toBe(false);
  });

  it('blocks the unspecified address and encoded IPs', () => {
    expect(isAllowedLlmEndpoint('http://0.0.0.0/v1').ok).toBe(false);
    expect(isAllowedLlmEndpoint('http://2130706433/v1').ok).toBe(false);
    expect(isAllowedLlmEndpoint('http://0x7f000001/v1').ok).toBe(false);
  });

  it('rejects non-http(s) schemes and invalid input', () => {
    expect(isAllowedLlmEndpoint('file:///etc/passwd').ok).toBe(false);
    expect(isAllowedLlmEndpoint('ftp://example.com/v1').ok).toBe(false);
    expect(isAllowedLlmEndpoint('not a url').ok).toBe(false);
    expect(isAllowedLlmEndpoint('').ok).toBe(false);
    expect(isAllowedLlmEndpoint(null).ok).toBe(false);
  });
});
