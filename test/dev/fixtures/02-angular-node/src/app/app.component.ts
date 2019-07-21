import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  t = fetch('/api/date')
    .then(response => response.text())
    .then(date => (this.date = date));
  date = 'Loading date...';
  title = 'Angular + Node.js API';
}
