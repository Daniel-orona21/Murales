import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of, timer } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

export type BackendStatus = 'pending' | 'waking' | 'online' | 'offline';

@Injectable({
  providedIn: 'root'
})
export class HealthCheckService {
  backendStatus = signal<BackendStatus>('pending');
  
  private readonly prodApiUrl = 'https://murales.onrender.com/api/health';

  constructor(private http: HttpClient) {}

  startHealthCheck() {
    this.backendStatus.set('pending');

    // Perform a quick initial check with a short timeout.
    this.http.get(this.prodApiUrl, { observe: 'response' }).pipe(
      timeout(3500), // Give it 3.5 seconds to respond.
      catchError(() => {
        // If the initial check fails (e.g., times out), then show the 'waking' screen.
        this.backendStatus.set('waking');
        // Start the longer polling process to give the server time to wake up.
        this.startWakeupPolling();
        return of(null); // Prevent the error from propagating further.
      })
    ).subscribe(response => {
      // If the initial check succeeds, the backend is online.
      if (response && response.status === 200) {
        this.backendStatus.set('online');
      }
    });
  }

  private startWakeupPolling() {
    const startTime = Date.now();

    const poll = () => {
      // Set a total timeout for the wakeup process.
      if (Date.now() - startTime > 60000) { // 1 minute total timeout.
        this.backendStatus.set('offline');
        return;
      }

      this.http.get(this.prodApiUrl, { observe: 'response' }).pipe(
        catchError(() => {
          // If it fails, wait 3 seconds and try again.
          timer(3000).subscribe(poll);
          return of(null);
        })
      ).subscribe(response => {
        // When a response is finally received, the server is online.
        if (response && response.status === 200) {
          this.backendStatus.set('online');
        }
      });
    };

    poll(); // Start the polling.
  }
} 