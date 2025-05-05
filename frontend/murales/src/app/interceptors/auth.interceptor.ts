import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

export const authInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  console.log('AuthInterceptor - intercept - URL:', request.url);
  
  // No interceptar peticiones de autenticación
  if (request.url.includes('/auth/')) {
    console.log('AuthInterceptor - intercept - Petición de autenticación, no se intercepta');
    return next(request);
  }
  
  const token = authService.getToken();
  console.log('AuthInterceptor - intercept - Token presente:', !!token);

  if (token) {
    console.log('AuthInterceptor - intercept - Añadiendo token a la petición');
    request = request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      console.log('AuthInterceptor - intercept - Error en la petición:', error.status);
      
      if (error.status === 401) {
        console.log('AuthInterceptor - intercept - Error 401, haciendo logout');
        authService.logout();
        router.navigate(['/login']);
      } else if (error.status === 429) {
        console.log('AuthInterceptor - intercept - Error 429, demasiadas peticiones');
        Swal.fire({
          title: 'Demasiadas peticiones',
          text: 'Has realizado demasiadas peticiones en poco tiempo. Por favor, espera un momento antes de continuar.',
          icon: 'warning',
          confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
          confirmButtonText: 'Entendido',
          customClass: {
            popup: 'custom-swal-popup',
            confirmButton: 'custom-confirm-button'
          }
        });
      }
      return throwError(() => error);
    })
  );
}; 