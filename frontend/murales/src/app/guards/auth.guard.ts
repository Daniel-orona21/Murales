import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable } from 'rxjs';
import { map, take, tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> | boolean {
    console.log('=== AuthGuard - Inicio de verificación ===');
    console.log('Ruta actual:', route.routeConfig?.path);
    
    const token = this.authService.getToken();
    console.log('Token presente:', !!token);
    
    if (!token) {
      console.log('AuthGuard - No hay token, redirigiendo a login');
      this.router.navigate(['/login']);
      return false;
    }

    // Si es la ruta de login, manejar de manera especial
    if (route.routeConfig?.path === 'login') {
      console.log('AuthGuard - Verificando ruta de login');
      return this.authService.isAuthenticated$.pipe(
        take(1),
        tap(isAuthenticated => {
          console.log('AuthGuard - Estado de autenticación para login:', isAuthenticated);
        }),
        map(isAuthenticated => {
          if (isAuthenticated) {
            console.log('AuthGuard - Usuario autenticado, redirigiendo a home');
            this.router.navigate(['/home']);
            return false;
          }
          console.log('AuthGuard - Usuario no autenticado, permitiendo acceso a login');
          return true;
        })
      );
    }

    // Para otras rutas, verificar autenticación
    console.log('AuthGuard - Verificando ruta protegida');
    return this.authService.isAuthenticated$.pipe(
      take(1),
      tap(isAuthenticated => {
        console.log('AuthGuard - Estado de autenticación para ruta protegida:', isAuthenticated);
      }),
      map(isAuthenticated => {
        if (!isAuthenticated) {
          console.log('AuthGuard - Usuario no autenticado, redirigiendo a login');
          this.router.navigate(['/login']);
          return false;
        }
        console.log('AuthGuard - Usuario autenticado, permitiendo acceso');
        return true;
      })
    );
  }
} 