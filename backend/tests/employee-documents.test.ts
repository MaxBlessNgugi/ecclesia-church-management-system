import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { documentStorageDir, publicDocument, storeEmployeeDocument } from '../src/lib/employeeDocuments.js';

describe('employee document storage', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
    delete process.env.UPLOAD_DIR;
  });

  it('stores allowed documents with generated names and hides storage paths', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ecclesia-docs-'));
    process.env.UPLOAD_DIR = tempDir;

    const stored = await storeEmployeeDocument('employee-1', 'candidate.pdf', 'application/pdf', 'data:application/pdf;base64,SGVsbG8=');
    const file = await fs.readFile(stored.storagePath, 'utf8');

    expect(stored.employeeId).toBe('employee-1');
    expect(stored.storedName).toMatch(/\.pdf$/);
    expect(file).toBe('Hello');
    expect(publicDocument({ ...stored, id: 'doc-1', createdAt: new Date() })).not.toHaveProperty('storagePath');
    expect(documentStorageDir()).toBe(tempDir);
  });

  it('rejects unsupported document types', async () => {
    await expect(storeEmployeeDocument('employee-1', 'candidate.exe', 'application/octet-stream', 'data:application/octet-stream;base64,SGVsbG8=')).rejects.toThrow('Unsupported document type');
  });
});
