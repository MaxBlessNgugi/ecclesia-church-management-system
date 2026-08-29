import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const DOCUMENT_EXTENSIONS = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
} as const;

type StoredDocument = {
  id: string;
  employeeId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  createdAt: Date;
};

export function documentStorageDir(): string {
  return path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'hr'));
}

export async function storeEmployeeDocument(employeeId: string, originalName: string, mimeType: string, dataUrl: string) {
  const extension = DOCUMENT_EXTENSIONS[mimeType as keyof typeof DOCUMENT_EXTENSIONS];
  if (!extension) throw new Error('Unsupported document type');

  const buffer = Buffer.from(dataUrl.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (buffer.length === 0 || buffer.length > MAX_DOCUMENT_BYTES) {
    throw new Error('Document must be between 1 byte and 5MB');
  }

  await fs.mkdir(documentStorageDir(), { recursive: true });
  const storedName = `${crypto.randomUUID()}${extension}`;
  const storagePath = path.join(documentStorageDir(), storedName);
  await fs.writeFile(storagePath, buffer, { flag: 'wx' });

  return { employeeId, originalName, storedName, mimeType, sizeBytes: buffer.length, storagePath };
}

export function publicDocument(document: StoredDocument) {
  const { storagePath: _storagePath, ...metadata } = document;
  return metadata;
}
