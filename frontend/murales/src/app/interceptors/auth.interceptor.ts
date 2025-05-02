import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

export const authInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  // No agregar el token a las rutas de autenticación
  if (request.url.includes('/auth/')) {
    return next(request);
  }
  
  const token = authService.getToken();
  if (token) {
    request = request.clone({
      setHeaders: {
        'x-auth-token': token
      }
    });
  }

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        console.log('Error 401 detectado, cerrando sesión...');
        authService.logout();
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
}; 