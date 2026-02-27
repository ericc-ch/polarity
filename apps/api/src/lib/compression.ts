export async function compressGzip(text: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const compressed = await new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(data)
        controller.close()
      },
    }).pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer()
  return compressed
}

export async function decompressGzip(buffer: ArrayBuffer) {
  const decompressed = await new Response(
    new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")),
  ).arrayBuffer()
  const decoder = new TextDecoder()
  return decoder.decode(decompressed)
}
