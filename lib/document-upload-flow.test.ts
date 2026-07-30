import { describe, expect, it } from "vitest";
import {
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  isSupportedDocumentFilename,
  processDocumentUploads,
  summarizeUploadBatch,
  validateDocumentUploadBatch,
} from "./document-upload-flow";

describe("supported upload formats", () => {
  it.each([
    "briefing.pdf",
    "briefing.txt",
    "briefing.docx",
    "briefing.ppt",
    "briefing.PPTX",
  ])("accepts %s", (filename) => {
    expect(isSupportedDocumentFilename(filename)).toBe(true);
  });

  it("continues to reject unsupported formats", () => {
    expect(isSupportedDocumentFilename("briefing.key")).toBe(false);
  });
});

describe("upload batch validation", () => {
  const file = (name: string, size = 1) => ({ name, size });

  it("accepts 50 supported files at exactly 150 MiB each", () => {
    const files = Array.from({ length: 50 }, (_, index) =>
      file(`document-${index}.pdf`, MAX_DOCUMENT_FILE_SIZE_BYTES),
    );

    expect(validateDocumentUploadBatch(files)).toBeNull();
  });

  it("rejects more than 50 files", () => {
    const files = Array.from({ length: 51 }, (_, index) =>
      file(`document-${index}.txt`),
    );

    expect(validateDocumentUploadBatch(files)).toBe(
      "You can upload up to 50 files at a time. You selected 51.",
    );
  });

  it("identifies an unsupported file", () => {
    expect(validateDocumentUploadBatch([file("slides.key")])).toBe(
      "slides.key is not supported. Choose PDF, TXT, DOCX, PPT, or PPTX files.",
    );
  });

  it("identifies a file over 150 MiB", () => {
    expect(
      validateDocumentUploadBatch([
        file("large.pdf", MAX_DOCUMENT_FILE_SIZE_BYTES + 1),
      ]),
    ).toBe(
      "large.pdf is larger than 150 MiB. Maximum 150 MiB per file, up to 50 files.",
    );
  });

  it("does not request presigned URLs for an invalid batch", async () => {
    let presignCalled = false;
    const updates: Array<{ status?: string; detail?: string }> = [];

    await processDocumentUploads(
      [
        {
          key: "large",
          file: file(
            "large.pdf",
            MAX_DOCUMENT_FILE_SIZE_BYTES + 1,
          ) as File,
        },
      ],
      {
        presign: async () => {
          presignCalled = true;
          return [];
        },
        put: async () => undefined,
        complete: async () => {
          throw new Error("not reached");
        },
        startIngest: async () => {
          throw new Error("not reached");
        },
        onUpdate: (_key, update) => updates.push(update),
        errorMessage: () => "unexpected error",
      },
    );

    expect(presignCalled).toBe(false);
    expect(updates).toEqual([
      {
        status: "failed",
        detail:
          "large.pdf is larger than 150 MiB. Maximum 150 MiB per file, up to 50 files.",
        failureStage: "upload",
      },
    ]);
  });
});

describe("upload batch completion summaries", () => {
  it("waits until every file has finished", () => {
    expect(
      summarizeUploadBatch([
        { filename: "rules.pdf", status: "indexed" },
        { filename: "order.docx", status: "processing" },
      ]),
    ).toBeNull();
  });

  it("reports complete success", () => {
    expect(
      summarizeUploadBatch([
        { filename: "rules.pdf", status: "indexed" },
        { filename: "order.docx", status: "indexed" },
      ]),
    ).toEqual({
      tone: "success",
      message: "2 documents ingested successfully.",
    });
  });

  it("reports counts and filenames for partial failure", () => {
    expect(
      summarizeUploadBatch([
        { filename: "rules.pdf", status: "indexed" },
        { filename: "bad-order.docx", status: "failed" },
        { filename: "missing.txt", status: "failed" },
      ]),
    ).toEqual({
      tone: "error",
      message:
        "2 of 3 documents failed: bad-order.docx, missing.txt. 1 document was ingested successfully.",
    });
  });

  it("reports a fully failed batch", () => {
    expect(
      summarizeUploadBatch([{ filename: "bad.pdf", status: "failed" }]),
    ).toEqual({
      tone: "error",
      message: "1 of 1 document failed: bad.pdf.",
    });
  });
});
