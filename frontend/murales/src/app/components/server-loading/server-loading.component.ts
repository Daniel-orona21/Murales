import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ServerStatusService } from '../../services/server-status.service';
import { Subscription, combineLatest } from 'rxjs';

@Component({
  selector: 'app-server-loading',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="showLoading" class="server-loading-overlay">
      <div class="pyramid-loader">
        <div class="wrapper">
          <span class="side side1"></span>
          <span class="side side2"></span>
          <span class="side side3"></span>
          <span class="side side4"></span>
          <span class="shadow"></span>
        </div>  
      </div>
      <div class="status-text">
        <h2>Despertando el servidor...</h2>
        <p>Esto puede tardar un momento. Por favor, espera ; )</p>
      </div>
    </div>
  `,
  styles: [`
    .server-loading-overlay {
      flex-direction: column;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(10px);
      display: flex;
      justify-content: center;
      align-items: center;   
      z-index: 9999;
    }

    .pyramid-loader {
        padding: 10px !important;
        width: 150px !important;
        height: 150px !important;
    }
    .side1, .side2, .side3, .side4 {
        background: white !important;
    }

    .shadow {
        background: rgba(255, 255, 255, 0.37) !important;
    }

    .status-text {
      text-align: center;
      color: white;
      display: flex;
      flex-direction: column;
      flex-wrap: wrap;
    }
    

    h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    p {
      margin: 0;
      font-size: 1rem;
      opacity: 0.8;
    }
  `]
})
export class ServerLoadingComponent implements OnInit, OnDestroy {
  showLoading = false;
  private subscription: Subscription | null = null;

  constructor(private serverStatusService: ServerStatusService) {
    console.log('ServerLoadingComponent initialized');
  }

  ngOnInit() {
    console.log('ServerLoadingComponent ngOnInit');
    this.subscription = combineLatest([
      this.serverStatusService.isServerAwake$,
      this.serverStatusService.isChecking$
    ]).subscribe({
      next: ([isAwake, isChecking]) => {
        console.log('Server status update:', { isAwake, isChecking });
        // Mostrar la pantalla de carga si el servidor no está despierto
        this.showLoading = !isAwake;
        console.log('Show loading:', this.showLoading);
      },
      error: (error) => console.error('Error in status subscription:', error)
    });
  }

  ngOnDestroy() {
    console.log('ServerLoadingComponent ngOnDestroy');
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
} 