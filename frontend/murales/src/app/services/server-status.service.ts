import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, of, timer, throwError, timeout } from 'rxjs';
import { catchError, map, tap, retry, switchMap, shareReplay } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ServerStatusService {
  private isServerAwakeSubject = new BehaviorSubject<boolean>(true);
  public isServerAwake$ = this.isServerAwakeSubject.asObservable().pipe(shareReplay(1));
  private isCheckingSubject = new BehaviorSubject<boolean>(false);
  public isChecking$ = this.isCheckingSubject.asObservable().pipe(shareReplay(1));

  constructor(private http: HttpClient) {
    console.log('ServerStatusService initialized');
    // Iniciar la verificación periódica del servidor
    this.startPeriodicCheck();
  }

  private startPeriodicCheck() {
    console.log('Starting periodic server check');
    timer(0, 5000).pipe(
      switchMap(() => this.checkServerStatus())
    ).subscribe({
      next: (isAwake) => console.log('Server status check result:', isAwake),
      error: (error) => console.error('Error in periodic check:', error)
    });
  }

  checkServerStatus(): Observable<boolean> {
    console.log('Checking server status...');
    this.isCheckingSubject.next(true);
    
    const headers = new HttpHeaders().set('Cache-Control', 'no-cache');
    
    return this.http.get(`${environment.apiUrl}/status`, { 
      headers,
      observe: 'response'
    }).pipe(
      timeout(5000), // 5 segundos de timeout
      map(response => {
        console.log('Server response:', response);
        return true;
      }),
      catchError((error: HttpErrorResponse) => {
        console.log('Server status check failed:', error);
        // Si hay cualquier error, asumimos que el servidor está dormido
        this.isServerAwakeSubject.next(false);
        return of(false);
      }),
      tap(isAwake => {
        console.log('Setting server status to:', isAwake);
        this.isServerAwakeSubject.next(isAwake);
        this.isCheckingSubject.next(false);
      }),
      shareReplay(1)
    );
  }

  waitForServer(): Observable<boolean> {
    return timer(0, 3000).pipe(
      switchMap(() => this.checkServerStatus())
    );
  }
} 