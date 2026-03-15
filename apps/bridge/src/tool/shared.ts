export async function streamToText(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) {
    return "";
  }

  return await new Response(stream).text();
}

export function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
