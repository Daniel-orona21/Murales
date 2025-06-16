import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ServerStatusService } from '../services/server-status.service';

@Injectable()
export class ServerStatusInterceptor implements HttpInterceptor {
  constructor(private serverStatusService: ServerStatusService) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // No interceptar la petición de status para evitar bucles
    if (request.url.includes('/status')) {
      return next.handle(request);
    }

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        // Si hay un error de red o el servidor no responde, asumimos que está dormido
        if (error.status === 0 || error.status === 503 || error.status === 504) {
          console.log('Server appears to be asleep, updating status');
          this.serverStatusService.checkServerStatus().subscribe();
        }
        return throwError(() => error);
      })
    );
  }
} 