import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

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
  private authSubject = new BehaviorSubject<boolean>(this.isLoggedIn());
  public isAuthenticated$ = this.authSubject.asObservable();

  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<any> {
    console.log('Enviando petición de login:', { email, contrasena: password });
    return this.http.post(`${this.apiUrl}/auth/login`, { 
      email, 
      contrasena: password
    }).pipe(
      tap((response: any) => {
        console.log('Respuesta del servidor:', response);
        if (response?.token) {
          localStorage.setItem(this.tokenKey, response.token);
          this.authSubject.next(true);
        }
      }),
      catchError(this.handleError)
    );
  }

  register(userData: RegisterData): Observable<any> {
    console.log('Enviando petición de registro:', userData);
    // Asegurarnos de que los campos coincidan con lo que espera el backend
    const registerData = {
      nombre: userData.nombre,
      email: userData.email,
      contrasena: userData.contrasena
    };
    
    return this.http.post(`${this.apiUrl}/auth/registro`, registerData)
      .pipe(
        tap((response: any) => {
          console.log('Respuesta del servidor:', response);
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
    return !!this.getToken();
  }

  private handleError(error: HttpErrorResponse) {
    console.error('Error completo:', error);
    
    let errorMessage = 'Ha ocurrido un error';
    
    if (error.error instanceof ErrorEvent) {
      // Error del lado del cliente
      errorMessage = error.error.message || 'Error en la conexión';
    } else {
      // Error del lado del servidor
      if (typeof error.error === 'string') {
        errorMessage = error.error;
      } else if (error.error?.mensaje) {
        errorMessage = error.error.mensaje;
      } else if (error.error?.errores && error.error.errores.length > 0) {
        // Manejar errores de validación del backend
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