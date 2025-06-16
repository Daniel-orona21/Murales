import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ServerLoadingComponent } from './components/server-loading/server-loading.component';
import { ServerStatusService } from './services/server-status.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [RouterOutlet, ServerLoadingComponent]
})
export class AppComponent implements OnInit {
  title = 'murales';

  constructor(private serverStatusService: ServerStatusService) {
    console.log('AppComponent initialized');
  }

  ngOnInit() {
    console.log('AppComponent ngOnInit');
    // Forzar una verificación inicial del servidor
    this.serverStatusService.checkServerStatus().subscribe({
      next: (isAwake) => console.log('Initial server check:', isAwake),
      error: (error) => console.error('Initial server check error:', error)
    });
  }
}
