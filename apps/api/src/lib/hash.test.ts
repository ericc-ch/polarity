import { describe, expect, it } from "vitest"
import { hashPr } from "./hash"
import type { PullRequest } from "../routes/repositories/queries"

function createPr(title: string, bodyText: string, filePaths: string[]): PullRequest {
  return {
    id: "test-id",
    number: 1,
    title,
    bodyText,
    state: "OPEN",
    files: {
      nodes: filePaths.map((path) => ({ path })),
    },
  }
}

describe("computeHash", () => {
  it("produces consistent hash for identical inputs", async () => {
    const hash1 = await hashPr(createPr("Title", "Body", ["file.ts"]))
    const hash2 = await hashPr(createPr("Title", "Body", ["file.ts"]))

    expect(hash1).toBe(hash2)
  })

  it("produces different hashes for different titles", async () => {
    const hash1 = await hashPr(createPr("Title A", "Body", ["file.ts"]))
    const hash2 = await hashPr(createPr("Title B", "Body", ["file.ts"]))

    expect(hash1).not.toBe(hash2)
  })

  it("produces different hashes for different bodies", async () => {
    const hash1 = await hashPr(createPr("Title", "Body A", ["file.ts"]))
    const hash2 = await hashPr(createPr("Title", "Body B", ["file.ts"]))

    expect(hash1).not.toBe(hash2)
  })

  it("produces different hashes for different file paths", async () => {
    const hash1 = await hashPr(createPr("Title", "Body", ["file1.ts"]))
    const hash2 = await hashPr(createPr("Title", "Body", ["file2.ts"]))

    expect(hash1).not.toBe(hash2)
  })

  it("produces different hashes when file order changes", async () => {
    const hash1 = await hashPr(createPr("Title", "Body", ["a.ts", "b.ts"]))
    const hash2 = await hashPr(createPr("Title", "Body", ["b.ts", "a.ts"]))

    expect(hash1).not.toBe(hash2)
  })

  it("returns a valid hex string", async () => {
    const hash = await hashPr(createPr("Title", "Body", ["file.ts"]))

    expect(hash).toMatch(/^[a-f0-9]+$/)
  })

  it("returns hash of consistent length for SHA-256", async () => {
    const hash = await hashPr(createPr("Title", "Body", ["file.ts"]))

    expect(hash).toHaveLength(64)
  })

  it("handles empty strings and arrays", async () => {
    const hash = await hashPr(createPr("", "", []))

    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it("handles unicode characters", async () => {
    const hash = await hashPr(createPr("Hello 世界", "🌍 Émojis", ["文件.ts"]))

    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it("handles many file paths", async () => {
    const paths = Array.from({ length: 100 }, (_, i) => `src/file${i}.ts`)

    const hash = await hashPr(createPr("Title", "Body", paths))

    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })
})
