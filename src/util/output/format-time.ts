function prefix(number: number) {
  return number >= 10 ? number : `0${number}`;
}

export function shortTimeFormat(date: number | Date) {
  date = typeof date === 'number' ? new Date(date) : date;

  const hours = prefix(date.getHours());
  const minutes = prefix(date.getMinutes());
  const seconds = prefix(date.getSeconds());

  return `${hours}:${minutes}:${seconds}`;
}
