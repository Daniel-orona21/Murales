import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> | boolean {
    // Si es la ruta de login, manejar de manera especial
    if (route.routeConfig?.path === 'login') {
      return this.authService.isAuthenticated$.pipe(
        take(1),
        map(isAuthenticated => {
          if (isAuthenticated) {
            this.router.navigate(['/home']);
            return false;
          }
          return true;
        })
      );
    }

    // Para otras rutas, verificar autenticación
    return this.authService.isAuthenticated$.pipe(
      take(1),
      map(isAuthenticated => {
        if (!isAuthenticated) {
          this.router.navigate(['/login']);
          return false;
        }
        return true;
      })
    );
  }
} 