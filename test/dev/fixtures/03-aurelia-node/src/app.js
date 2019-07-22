import { HttpClient } from 'aurelia-fetch-client';

let client = new HttpClient();

export class App {
  constructor() {
    client
      .fetch('/api/date')
      .then(response => response.text())
      .then(date => (this.date = date));
  }
  date = 'Loading date...';
}
