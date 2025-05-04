import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject, of } from 'rxjs';
import { tap, catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

interface RegisterData {
  nombre: string;
  email: string;
  contrasena: string;
  recaptchaToken: string;
}

interface Session {
  id_sesion: string;
  dispositivo: string;
  fecha_creacion: string;
  ultima_actividad?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private tokenKey = 'auth_token';
  private sessionIdKey = 'session_id';
  private authSubject = new BehaviorSubject<boolean>(false);
  private sessionsSubject = new BehaviorSubject<Session[]>([]);
  
  public isAuthenticated$ = this.authSubject.asObservable();
  public sessions$ = this.sessionsSubject.asObservable();
  
  constructor(private http: HttpClient) {
    this.checkToken();
  }

  private checkToken(): void {
    const token = this.getToken();
    console.log('=== AuthService - Verificación de Token ===');
    console.log('Token presente:', !!token);
    
    if (token) {
      try {
        const parts = token.split('.');
        console.log('Partes del token:', parts.length);
        
        if (parts.length === 3) {
          // Decodificar el token para verificar su validez
          const payload = JSON.parse(atob(parts[1]));
          const expirationDate = new Date(payload.exp * 1000);
          
          console.log('Fecha de expiración:', expirationDate);
          console.log('Fecha actual:', new Date());
          
          if (expirationDate > new Date()) {
            console.log('Token válido y no expirado');
          this.authSubject.next(true);
            // No cargar sesiones aquí para evitar la dependencia circular
          } else {
            console.log('Token expirado');
            this.logout();
          }
        } else {
          console.log('Token inválido - formato incorrecto');
          this.logout();
        }
      } catch (error) {
        console.error('Error al verificar token:', error);
        this.logout();
      }
    } else {
      console.log('No hay token');
      this.authSubject.next(false);
    }
  }

  private getHeaders(): HttpHeaders {
    const token = this.getToken();
    if (!token) {
      console.log('AuthService - getHeaders - No hay token disponible');
      return new HttpHeaders();
    }
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  login(email: string, password: string): Observable<any> {
    console.log('AuthService - login - Iniciando login');
    const dispositivo = this.getDeviceInfo();
    return this.http.post(`${this.apiUrl}/auth/login`, { 
      email, 
      contrasena: password,
      dispositivo
    }).pipe(
      tap((response: any) => {
        console.log('AuthService - login - Respuesta recibida:', !!response?.token);
        if (response?.token) {
          localStorage.setItem(this.tokenKey, response.token);
          localStorage.setItem(this.sessionIdKey, response.idSesion);
          this.authSubject.next(true);
          this.sessionsSubject.next(response.sesionesActivas);
          console.log('AuthService - login - Login exitoso');
        }
      }),
      catchError(this.handleError)
    );
  }

  register(userData: RegisterData): Observable<any> {
    const dispositivo = this.getDeviceInfo();
    const registerData = {
      nombre: userData.nombre,
      email: userData.email,
      contrasena: userData.contrasena,
      recaptchaToken: userData.recaptchaToken,
      dispositivo
    };
    
    return this.http.post(`${this.apiUrl}/auth/registro`, registerData)
      .pipe(
        tap((response: any) => {
          if (response?.token) {
            localStorage.setItem(this.tokenKey, response.token);
            localStorage.setItem(this.sessionIdKey, response.idSesion);
            this.authSubject.next(true);
            this.sessionsSubject.next(response.sesionesActivas);
          }
        }),
        catchError(this.handleError)
      );
  }

  // Método para solicitar restablecimiento de contraseña
  requestPasswordReset(email: string): Observable<any> {
    console.log('AuthService - requestPasswordReset - Solicitando recuperación para:', email);
    return this.http.post(`${this.apiUrl}/auth/recuperar-password`, { email })
      .pipe(
        tap(response => {
          console.log('AuthService - requestPasswordReset - Solicitud enviada');
        }),
        catchError(this.handleError)
      );
  }

  // Método para verificar un token de restablecimiento
  verifyResetToken(token: string): Observable<any> {
    console.log('AuthService - verifyResetToken - Verificando token');
    return this.http.get(`${this.apiUrl}/auth/verificar-token/${token}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Método para restablecer la contraseña
  resetPassword(token: string, newPassword: string): Observable<any> {
    console.log('AuthService - resetPassword - Restableciendo contraseña');
    return this.http.post(`${this.apiUrl}/auth/restablecer-password/${token}`, { 
      contrasena: newPassword 
    }).pipe(
      catchError(this.handleError)
    );
  }

  logout() {
    // Limpiar el token y el ID de sesión
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.sessionIdKey);
    
    // Limpiar los subjects
    this.authSubject.next(false);
    this.sessionsSubject.next([]);
    
    // Limpiar cualquier otro dato de sesión que pudiera existir
    sessionStorage.clear();
    
    // Redirigir al login
    window.location.href = '/login';
  }

  getToken(): string | null {
    const token = localStorage.getItem(this.tokenKey);
    console.log('AuthService - getToken - Token recuperado:', !!token);
    return token;
  }

  getSessionId(): string | null {
    return localStorage.getItem(this.sessionIdKey);
  }

  isLoggedIn(): boolean {
    const isLoggedIn = this.authSubject.value;
    console.log('AuthService - isLoggedIn - Estado actual:', isLoggedIn);
    return isLoggedIn;
  }

  getCurrentUser(): Observable<any> {
    return this.http.get(`${this.apiUrl}/auth/usuario`, { headers: this.getHeaders() });
  }

  loadActiveSessions(): Observable<any> {
    console.log('AuthService - loadActiveSessions - Iniciando carga de sesiones');
    const token = this.getToken();
    if (!token) {
      console.log('AuthService - loadActiveSessions - No hay token, redirigiendo a logout');
      this.logout();
      return throwError(() => 'No hay token disponible');
    }

    return this.http.get<{sesiones: Session[]}>(`${this.apiUrl}/auth/sessions`, {
      headers: new HttpHeaders().set('Authorization', `Bearer ${token}`)
    }).pipe(
      tap((data) => {
        console.log('AuthService - loadActiveSessions - Sesiones cargadas:', data.sesiones.length);
        this.sessionsSubject.next(data.sesiones);
      }),
      catchError((error) => {
        console.error('AuthService - loadActiveSessions - Error al cargar sesiones:', error);
        if (error.status === 401) {
          this.logout();
        }
        return throwError(() => error);
      })
    );
  }

  closeSession(sessionId: string): Observable<any> {
    const token = this.getToken();
    if (!token) {
      console.log('AuthService - closeSession - No hay token, redirigiendo a logout');
      this.logout();
      return throwError(() => 'No hay token disponible');
    }

    // Si es la sesión actual, solo limpiar el estado local
    if (sessionId === this.getSessionId()) {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.sessionIdKey);
      this.authSubject.next(false);
      this.sessionsSubject.next([]);
      return of({ success: true });
    }

    // Si no es la sesión actual, cerrarla en el servidor
    return this.http.post(`${this.apiUrl}/auth/logout/${sessionId}`, {}, { 
      headers: new HttpHeaders().set('Authorization', `Bearer ${token}`)
    }).pipe(
      tap(() => {
        const currentSessions = this.sessionsSubject.value;
        this.sessionsSubject.next(currentSessions.filter(s => s.id_sesion !== sessionId));
      }),
      catchError((error) => {
        console.error('AuthService - closeSession - Error al cerrar sesión:', error);
        if (error.status === 401) {
          this.logout();
        }
        return throwError(() => error);
      })
    );
  }

  private getDeviceInfo(): string {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;
    const vendor = navigator.vendor;
    return `${platform} - ${vendor} - ${userAgent}`;
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