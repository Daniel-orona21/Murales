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
      } else if (error.status === 429) {
        console.log('Error 429 detectado, demasiadas peticiones...');
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
        }).then(() => {
          authService.logout();
          router.navigate(['/login']);
        });
      }
      return throwError(() => error);
    })
  );
}; 