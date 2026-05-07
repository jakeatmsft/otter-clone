function padNumber(value: number) {
  return String(value).padStart(2, '0');
}

export function createDefaultTranscriptTitle(date = new Date()) {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1);
  const day = padNumber(date.getDate());
  const hours = padNumber(date.getHours());
  const minutes = padNumber(date.getMinutes());

  return `Recording ${year}-${month}-${day} ${hours}:${minutes}`;
}
