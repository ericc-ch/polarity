import { describe, expect, it } from "vitest"
import { compressGzip, decompressGzip } from "./compression"

describe("compressGzip", () => {
  it("compresses text to smaller size", async () => {
    const text = "Hello World! ".repeat(100)

    const compressed = await compressGzip(text)

    expect(compressed.byteLength).toBeLessThan(text.length)
  })

  it("handles empty string", async () => {
    const compressed = await compressGzip("")

    expect(compressed).toBeInstanceOf(ArrayBuffer)
    expect(compressed.byteLength).toBeGreaterThan(0)
  })

  it("handles unicode text", async () => {
    const text = "Hello 世界 🌍 émojis"

    const compressed = await compressGzip(text)

    expect(compressed).toBeInstanceOf(ArrayBuffer)
    expect(compressed.byteLength).toBeGreaterThan(0)
  })
})

describe("decompressGzip", () => {
  it("restores original text from compressed data", async () => {
    const original = "Hello World! This is a test message."
    const compressed = await compressGzip(original)

    const restored = await decompressGzip(compressed)

    expect(restored).toBe(original)
  })

  it("handles empty string round-trip", async () => {
    const original = ""
    const compressed = await compressGzip(original)

    const restored = await decompressGzip(compressed)

    expect(restored).toBe(original)
  })

  it("handles large text round-trip", async () => {
    const original = JSON.stringify({ data: "x".repeat(10000) })
    const compressed = await compressGzip(original)

    const restored = await decompressGzip(compressed)

    expect(restored).toBe(original)
  })

  it("handles unicode text round-trip", async () => {
    const original = "Hello 世界 🌍 émojis and special chars: ñ 中文 العربية"
    const compressed = await compressGzip(original)

    const restored = await decompressGzip(compressed)

    expect(restored).toBe(original)
  })
})

describe("compression round-trip", () => {
  it("preserves JSON data integrity", async () => {
    const data = {
      repo: "owner/repo",
      syncedAt: Date.now(),
      issues: {
        "issue-1": {
          id: "1",
          number: 42,
          state: "open" as const,
          vector: [0.1, 0.2],
        },
      },
    }
    const json = JSON.stringify(data)

    const compressed = await compressGzip(json)
    const restored = await decompressGzip(compressed)

    expect(JSON.parse(restored)).toEqual(data)
  })
})
