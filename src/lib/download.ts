export function downloadUrl(fileName: string, url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
}

export function downloadText(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  downloadUrl(fileName, url);
  URL.revokeObjectURL(url);
}
