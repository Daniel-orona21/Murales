import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of, timer } from 'rxjs';
import { catchError } from 'rxjs/operators';

export type BackendStatus = 'pending' | 'waking' | 'online' | 'offline';

@Injectable({
  providedIn: 'root'
})
export class HealthCheckService {
  backendStatus = signal<BackendStatus>('pending');
  
  private readonly prodApiUrl = 'https://murales.onrender.com/api/health';

  constructor(private http: HttpClient) {}

  startHealthCheck() {
    this.backendStatus.set('waking');
    this.pingBackend(Date.now());
  }

  private pingBackend(startTime: number) {
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > 60000) { // 1 minute timeout
      this.backendStatus.set('offline');
      return;
    }

    this.http.get(this.prodApiUrl, { observe: 'response' }).pipe(
      catchError(() => {
        timer(3000).subscribe(() => this.pingBackend(startTime));
        return of(null);
      })
    ).subscribe(response => {
      if (response) {
        this.backendStatus.set('online');
      }
    });
  }
} 