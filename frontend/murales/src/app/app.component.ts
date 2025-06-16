import { Component, OnInit, WritableSignal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HealthCheckService, BackendStatus } from './services/health-check.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [RouterOutlet, CommonModule]
})
export class AppComponent implements OnInit {
  title = 'murales';
  backendStatus: WritableSignal<BackendStatus>;

  constructor(private healthCheckService: HealthCheckService) {
    this.backendStatus = this.healthCheckService.backendStatus;
  }

  ngOnInit() {
    this.healthCheckService.startHealthCheck();
  }
}
