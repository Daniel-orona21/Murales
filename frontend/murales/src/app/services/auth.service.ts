import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject, of } from 'rxjs';
import { tap, catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Auth, GoogleAuthProvider, signInWithPopup } from '@angular/fire/auth';

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

interface GoogleAuthResponse {
  token: string;
  idSesion: string;
  sesionesActivas: Session[];
}

interface GithubAuthResponse {
  token: string;
  idSesion: string;
  sesionesActivas: Session[];
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
  
  constructor(
    private http: HttpClient,
    private auth: Auth
  ) {
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
          sessionStorage.setItem(this.tokenKey, response.token);
          sessionStorage.setItem(this.sessionIdKey, response.idSesion);
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
            sessionStorage.setItem(this.tokenKey, response.token);
            sessionStorage.setItem(this.sessionIdKey, response.idSesion);
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
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.sessionIdKey);
    
    // Limpiar los subjects
    this.authSubject.next(false);
    this.sessionsSubject.next([]);
    
    // Limpiar cualquier otro dato de sesión que pudiera existir
    sessionStorage.clear();
    
    // Redirigir al login
    window.location.href = '/login';
  }

  getToken(): string | null {
    return sessionStorage.getItem(this.tokenKey);
  }

  getSessionId(): string | null {
    return sessionStorage.getItem(this.sessionIdKey);
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
      sessionStorage.removeItem(this.tokenKey);
      sessionStorage.removeItem(this.sessionIdKey);
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
    const userAgent = navigator.userAgent.toLowerCase();
    let device = '';
    let browser = '';

    // Detectar dispositivo
    if (/iphone|ipod/.test(userAgent)) {
      device = 'iPhone';
    } else if (/ipad/.test(userAgent)) {
      device = 'iPad';
    } else if (/android/.test(userAgent)) {
      device = 'Android';
    } else if (/macintosh|mac os x/.test(userAgent)) {
      device = 'Mac';
    } else if (/windows/.test(userAgent)) {
      device = 'Windows';
    } else if (/linux/.test(userAgent)) {
      device = 'Linux';
    } else {
      device = 'Otro';
    }

    // Detectar navegador de manera más precisa
    if (/crios/.test(userAgent)) {
      browser = 'Chrome';
    } else if (/firefox/.test(userAgent)) {
      browser = 'Firefox';
    } else if (/safari/.test(userAgent) && !/chrome/.test(userAgent)) {
      browser = 'Safari';
    } else if (/edg/.test(userAgent)) {
      browser = 'Edge';
    } else if (/opera|opr/.test(userAgent)) {
      browser = 'Opera';
    } else if (/chrome/.test(userAgent)) {
      browser = 'Chrome';
    } else {
      browser = 'Navegador';
    }

    // Casos especiales para iOS
    if (/iphone|ipad|ipod/.test(userAgent)) {
      if (/crios/.test(userAgent)) {
        browser = 'Chrome';
      } else if (/fxios/.test(userAgent)) {
        browser = 'Firefox';
      } else if (/version/.test(userAgent)) {
        browser = 'Safari';
      }
    }

    return `${device} - ${browser}`;
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

  async signInWithGoogle() {
    try {
      console.log('Iniciando autenticación con Google...');
      const provider = new GoogleAuthProvider();
      console.log('Provider creado:', provider);
      
      // Forzar selección de cuenta
      provider.setCustomParameters({
        prompt: 'select_account'
      });

      console.log('Intentando iniciar popup de autenticación...');
      const result = await signInWithPopup(this.auth, provider);
      console.log('Autenticación con Google exitosa:', result.user);
      const user = result.user;
      
      console.log('Enviando datos al backend...');
      // Aquí enviamos los datos del usuario de Google a nuestro backend
      const response = await this.http.post<GoogleAuthResponse>(`${this.apiUrl}/auth/google`, {
        email: user.email,
        nombre: user.displayName,
        uid: user.uid,
        photoURL: user.photoURL,
        dispositivo: this.getDeviceInfo()
      }).toPromise();

      if (!response) {
        throw new Error('No se recibió respuesta del servidor');
      }

      console.log('Respuesta del backend:', response);
      sessionStorage.setItem(this.tokenKey, response.token);
      sessionStorage.setItem(this.sessionIdKey, response.idSesion);
      this.authSubject.next(true);
      this.sessionsSubject.next(response.sesionesActivas);
      console.log('Token guardado:', response.token);
      console.log('Sesión guardada:', response.idSesion);

      return response;
    } catch (error: any) {
      console.error('Error detallado en autenticación con Google:', {
        code: error.code,
        message: error.message,
        fullError: error
      });
      
      let errorMessage = 'Error al autenticar con Google';
      
      if (error.code) {
        switch (error.code) {
          case 'auth/configuration-not-found':
            errorMessage = 'Error de configuración de Firebase. Por favor, verifica la configuración del proyecto.';
            break;
          case 'auth/popup-blocked':
            errorMessage = 'El popup fue bloqueado por el navegador. Por favor, permite ventanas emergentes para este sitio.';
            break;
          case 'auth/popup-closed-by-user':
            errorMessage = 'El proceso de inicio de sesión fue cancelado.';
            break;
          case 'auth/cancelled-popup-request':
            errorMessage = 'La solicitud de inicio de sesión fue cancelada.';
            break;
          default:
            errorMessage = `Error de autenticación: ${error.message}`;
        }
      }
      
      throw errorMessage;
    }
  }

  async signInWithGithub() {
    try {
      console.log('Iniciando autenticación con GitHub...');
      
      // Guardar la URL actual para redirigir después de la autenticación
      const currentUrl = window.location.href;
      sessionStorage.setItem('auth_redirect', currentUrl);
      
      // Construir la URL de autorización de GitHub
      const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${environment.github.clientId}&redirect_uri=${encodeURIComponent(environment.github.redirectUri)}&scope=user:email`;
      
      // Redirigir a GitHub para autenticación
      window.location.href = githubAuthUrl;
    } catch (error) {
      console.error('Error al iniciar autenticación con GitHub:', error);
      throw 'Error al iniciar autenticación con GitHub';
    }
  }

  // Método para manejar el callback de GitHub
  async handleGithubCallback(code: string): Promise<GithubAuthResponse> {
    try {
      console.log('Procesando callback de GitHub...');
      
      // Enviar el código al backend para obtener el token
      const response = await this.http.post<GithubAuthResponse>(`${this.apiUrl}/auth/github/callback`, {
        code,
        dispositivo: this.getDeviceInfo()
      }).toPromise();

      if (!response) {
        throw new Error('No se recibió respuesta del servidor');
      }

      console.log('Respuesta del backend:', response);
      sessionStorage.setItem(this.tokenKey, response.token);
      sessionStorage.setItem(this.sessionIdKey, response.idSesion);
      this.authSubject.next(true);
      this.sessionsSubject.next(response.sesionesActivas);

      return response;
    } catch (error) {
      console.error('Error en callback de GitHub:', error);
      throw 'Error al procesar la autenticación con GitHub';
    }
  }
} 