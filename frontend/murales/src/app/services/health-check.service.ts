import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { of, timer } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

// Online: The app is interactive.
// Waking: A blocking overlay is shown with the "Waking server..." message.
// Offline: A blocking overlay is shown with the "Server is offline" message.
export type BackendStatus = 'online' | 'waking' | 'offline';

@Injectable({
  providedIn: 'root'
})
export class HealthCheckService {
  // Start optimistically in 'online' state so the UI is never blocked on startup.
  backendStatus = signal<BackendStatus>('online');
  private healthCheckUrl = `${environment.apiUrl}/health`;

  constructor(private http: HttpClient) {}

  startHealthCheck() {
    // This check now runs in the background without changing the state first.
    // The UI remains interactive unless a problem is detected.
    const checkObservable = this.http.get(this.healthCheckUrl, { observe: 'response' }).pipe(
      timeout(environment.production ? 10000 : 4000), // 10s for prod, 4s for dev
      catchError(() => {
        // A timeout or error occurred. Now we determine the state.
        if (environment.production) {
          // In production, a timeout means we should show the "waking" screen.
          this.backendStatus.set('waking');
          this.startWakeupPolling();
        } else {
          // In development, a timeout means the local server is offline.
          this.backendStatus.set('offline');
        }
        return of(null); // Stop the observable chain.
      })
    );

    checkObservable.subscribe(response => {
      // If we get a valid response, we ensure the state is 'online'.
      if (response?.status === 200) {
        this.backendStatus.set('online');
      }
    });
  }

  private startWakeupPolling() {
    const startTime = Date.now();
    const poll = () => {
      if (Date.now() - startTime > 50000) { // Poll for up to 50 more seconds.
        this.backendStatus.set('offline');
        return;
      }
      this.http.get(this.healthCheckUrl, { observe: 'response' }).pipe(
        catchError(() => {
          timer(5000).subscribe(poll); // Check again in 5 seconds.
          return of(null);
        })
      ).subscribe(response => {
        if (response?.status === 200) {
          // The server is up! Set status to online to hide the overlay.
          this.backendStatus.set('online');
        }
      });
    };
    poll();
  }
} 