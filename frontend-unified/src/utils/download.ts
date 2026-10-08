/** A file name from a title: lower case, words joined by hyphens */
export function fileName(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'download'
  );
}

/** Hand the browser a text file to save, made here rather than fetched */
export function downloadText(name: string, text: string, type = 'text/markdown'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Not at once: some browsers start reading the file after click() returns
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
