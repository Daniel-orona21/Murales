import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'timeAgo',
  standalone: true
})
export class TimeAgoPipe implements PipeTransform {
  transform(value: string | Date, includeHace: boolean = false): string {
    if (!value) return '';

    const date = new Date(value);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(months / 12);

    const prefix = includeHace ? 'hace' : '';

    if (seconds < 60) {
      return includeHace ? 'hace un momento' : 'justo ahora';
    } else if (minutes < 60) {
      return `${prefix} ${minutes}m`;
    } else if (hours < 24) {
      return `${prefix} ${hours}h`;
    } else if (days < 30) {
      return `${prefix} ${days}d`;
    } else if (months < 12) {
      return `${prefix} ${months}mes`;
    } else {
      return `${prefix} ${years}a`;
    }
  }
} 