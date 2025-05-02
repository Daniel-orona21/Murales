import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject, of } from 'rxjs';
import { tap, catchError, switchMap } from 'rxjs/operators';

interface RegisterData {
  nombre: string;
  email: string;
  contrasena: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:3000/api';
  private tokenKey = 'auth_token';
  private authSubject = new BehaviorSubject<boolean>(false);
  public isAuthenticated$ = this.authSubject.asObservable();

  
  constructor(private http: HttpClient) {
    // Verificar el token al iniciar el servicio
    this.checkToken();
  }

  private checkToken(): void {
    const token = this.getToken();
    if (token) {
      // En lugar de hacer una petición HTTP, verificamos si el token existe
      // y tiene un formato válido (esto es una verificación básica)
      try {
        // Verificar que el token tenga el formato correcto (JWT)
        const parts = token.split('.');
        if (parts.length === 3) {
          this.authSubject.next(true);
        } else {
          this.logout();
        }
      } catch (error) {
        console.error('Error al verificar token:', error);
        this.logout();
      }
    } else {
      this.authSubject.next(false);
    }
  }

  login(email: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/login`, { 
      email, 
      contrasena: password
    }).pipe(
      tap((response: any) => {
        if (response?.token) {
          localStorage.setItem(this.tokenKey, response.token);
          this.authSubject.next(true);
        }
      }),
      catchError(this.handleError)
    );
  }

  register(userData: RegisterData): Observable<any> {
    const registerData = {
      nombre: userData.nombre,
      email: userData.email,
      contrasena: userData.contrasena
    };
    
    return this.http.post(`${this.apiUrl}/auth/registro`, registerData)
      .pipe(
        tap((response: any) => {
          if (response?.token) {
            localStorage.setItem(this.tokenKey, response.token);
            this.authSubject.next(true);
          }
        }),
        catchError(this.handleError)
      );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    this.authSubject.next(false);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isLoggedIn(): boolean {
    return this.authSubject.value;
  }

  private handleError(error: HttpErrorResponse) {
    console.error('Error completo:', error);
    
    let errorMessage = 'Ha ocurrido un error';
    
    if (error.error instanceof ErrorEvent) {
      errorMessage = error.error.message || 'Error en la conexión';
    } else {
      if (typeof error.error === 'string') {
        errorMessage = error.error;
      } else if (error.error?.mensaje) {
        errorMessage = error.error.mensaje;
      } else if (error.error?.errores && error.error.errores.length > 0) {
        errorMessage = error.error.errores.map((e: any) => e.msg).join(', ');
      } else if (error.message) {
        errorMessage = error.message;
      } else if (error.status === 0) {
        errorMessage = 'No se pudo conectar con el servidor';
      } else if (error.status === 404) {
        errorMessage = 'Ruta no encontrada';
      } else if (error.status === 401) {
        errorMessage = 'Credenciales inválidas';
      }
    }

    return throwError(() => errorMessage);
  }
} 