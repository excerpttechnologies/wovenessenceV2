export async function readImportProgressStream(response, onEvent) {
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('ndjson')) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'The import could not be started.');
  }
  if (!response.body) {
    throw new Error('The server did not provide an import progress stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completion = null;
  let streamError = null;

  const consume = (line) => {
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error('The import progress stream contained invalid data.');
    }
    onEvent(event);
    if (event.type === 'complete') completion = event;
    if (event.type === 'error') streamError = new Error(event.error || 'The import failed.');
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      lines.forEach(consume);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
  } finally {
    reader.releaseLock();
  }

  if (streamError) throw streamError;
  if (!completion) {
    throw new Error('The import ended before the server confirmed completion.');
  }
  return completion;
}
