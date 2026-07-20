import { describe, expect, it } from "vitest";
import { summarizeUploadBatch } from "./document-upload-flow";

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
