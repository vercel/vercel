function prefix(number: number | string) {
  number = parseInt(number.toString(), 10);
  return number >= 10 ? number : `0${number}`;
}

export function shortTimeFormat(date: number | Date) {
  date = typeof date === 'number' ? new Date(date) : date;
  const string = date.toLocaleTimeString('en-US');
  const [time, suffix] = string.split(' ');
  const [hour, minute, seconds] = time.split(':');
  return `${prefix(hour)}:${prefix(minute)}:${prefix(seconds)} ${suffix}`;
}
