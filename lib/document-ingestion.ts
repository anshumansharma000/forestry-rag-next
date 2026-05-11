import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import pdfParse from "pdf-parse/lib/pdf-parse";

type UploadedDocument = {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  storagePath: string;
};

type IngestedChunk = {
  id: string;
  documentId: string;
  source: string;
  chunkIndex: number;
  text: string;
};

type LocalIndex = {
  updatedAt: string;
  documents: UploadedDocument[];
  chunks: IngestedChunk[];
};

const dataDir = path.join(process.cwd(), ".data");
const uploadDir = path.join(dataDir, "uploads");
const documentsFile = path.join(dataDir, "documents.json");
const indexFile = path.join(dataDir, "local-index.json");

async function ensureStorage() {
  await mkdir(uploadDir, { recursive: true });
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await ensureStorage();
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sanitizeFilename(filename: string) {
  const parsed = path.parse(filename);
  const name = parsed.name.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 90);
  return `${name || "document"}-${Date.now()}${parsed.ext.toLowerCase()}`;
}

function splitIntoChunks(text: string) {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  const chunks: string[] = [];
  const chunkSize = 1200;
  const overlap = 160;
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const chunk = normalized.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    if (end === normalized.length) {
      break;
    }
    start = end - overlap;
  }

  return chunks;
}

async function extractText(document: UploadedDocument) {
  const fileBuffer = await readFile(document.storagePath);

  if (document.filename.endsWith(".txt")) {
    return fileBuffer.toString("utf8");
  }

  if (document.filename.endsWith(".docx")) {
    return "";
  }

  const parsed = await pdfParse(fileBuffer);
  return parsed.text;
}

export async function saveUploadedDocument(file: File) {
  await ensureStorage();

  const filename = sanitizeFilename(file.name);
  const storagePath = path.join(uploadDir, filename);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(storagePath, bytes);

  const document: UploadedDocument = {
    id: randomUUID(),
    filename,
    originalName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: bytes.byteLength,
    uploadedAt: new Date().toISOString(),
    storagePath,
  };

  const documents = await getUploadedDocuments();
  documents.unshift(document);
  await writeJson(documentsFile, documents);

  return document;
}

export async function getUploadedDocuments() {
  await ensureStorage();
  return readJson<UploadedDocument[]>(documentsFile, []);
}

async function getLocalIndex() {
  await ensureStorage();
  return readJson<LocalIndex>(indexFile, {
    updatedAt: new Date(0).toISOString(),
    documents: [],
    chunks: [],
  });
}

export async function buildLocalIndex() {
  const documents = await getUploadedDocuments();
  const currentIndex = await getLocalIndex();
  const indexedSources = new Set(
    currentIndex.documents.map((document) => document.originalName),
  );
  const chunks: IngestedChunk[] = [...currentIndex.chunks];
  const indexedDocuments: UploadedDocument[] = [...currentIndex.documents];
  let documentsAdded = 0;
  let documentsSkipped = 0;
  let chunksAdded = 0;

  for (const document of documents) {
    if (indexedSources.has(document.originalName)) {
      documentsSkipped += 1;
      continue;
    }

    const text = await extractText(document);
    const documentChunks = splitIntoChunks(text);
    indexedSources.add(document.originalName);
    indexedDocuments.unshift(document);
    documentsAdded += 1;
    chunksAdded += documentChunks.length;

    for (let index = 0; index < documentChunks.length; index += 1) {
      chunks.push({
        id: randomUUID(),
        documentId: document.id,
        source: document.originalName,
        chunkIndex: index,
        text: documentChunks[index],
      });
    }
  }

  const index = {
    updatedAt: new Date().toISOString(),
    documents: indexedDocuments,
    chunks,
  };
  await writeJson(indexFile, index);

  return {
    ...index,
    documentsAdded,
    documentsSkipped,
    chunksAdded,
  };
}
