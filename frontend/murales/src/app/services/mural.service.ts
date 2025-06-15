import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { map, tap } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';

export interface Mural {
  id_mural: any;
  titulo: string;
  descripcion: string;
  id_creador: number;
  privacidad: 'publico' | 'privado' | 'codigo';
  codigo_acceso: string;
  tema: number;
  color_personalizado?: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
  estado: number;
  rol_usuario?: string;
  permite_comentarios?: boolean;
  permite_likes?: boolean;
  creador_nombre?: string;
}

export interface CreateMuralData {
  titulo: string;
  descripcion: string;
  privacidad: string;
  permite_comentarios?: boolean;
  permite_likes?: boolean;
}

export interface JoinMuralResponse {
  mensaje: string;
  id_mural: number;
}

export interface Publicacion {
  id_publicacion: number;
  id_mural: number;
  id_usuario: number;
  titulo: string;
  descripcion: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
  posicion_x: number;
  posicion_y: number;
  estado: number;
  nombre_usuario?: string;
  avatar_url?: string;
  contenido?: Contenido[];
}

export interface Contenido {
  id_contenido: number;
  id_publicacion: number;
  tipo_contenido: 'imagen' | 'video' | 'enlace' | 'archivo' | 'texto';
  url_contenido?: string;
  texto?: string;
  nombre_archivo?: string;
  tamano_archivo?: number;
  fecha_subida: string;
}

export interface CreatePublicacionData {
  titulo: string;
  descripcion: string;
  posicion_x?: number;
  posicion_y?: number;
}

export interface CreateContenidoData {
  tipo_contenido: 'imagen' | 'video' | 'enlace' | 'archivo' | 'texto';
  url_contenido?: string;
  texto?: string;
  nombre_archivo?: string;
  tamano_archivo?: number;
}

export interface FileUploadResponse {
  id_contenido: number;
  id_publicacion: number;
  tipo_contenido: string;
  url_contenido: string;
  nombre_archivo: string;
  tamano_archivo: number;
  mensaje: string;
}

export interface MuralUser {
  id_usuario: number;
  nombre: string;
  email: string;
  avatar_url?: string;
  rol: string;
  fecha_asignacion: string;
}

export interface UpdateThemeData {
  tema: number;
  color_personalizado?: string;
}

interface ThemeUpdate {
  id_mural: number;
  tema: number;
  color_personalizado?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MuralService {
  private apiUrl = `${environment.apiUrl}/murales`;
  private uploadUrl = `${environment.apiUrl}/uploads`;
  private selectedMuralId = new BehaviorSubject<string | null>(null);
  selectedMural$ = this.selectedMuralId.asObservable();
  private socket: Socket | null = null;
  private themeUpdateSubject = new Subject<ThemeUpdate>();
  themeUpdate$ = this.themeUpdateSubject.asObservable();
  private muralesUpdateSubject = new Subject<void>();
  muralesUpdate$ = this.muralesUpdateSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    // Intentar recuperar el mural seleccionado del sessionStorage al iniciar
    const savedMuralId = sessionStorage.getItem('selectedMuralId');
    const token = this.authService.getToken();
    
    // Solo cargar el mural guardado si hay un token válido (sesión activa)
    if (savedMuralId && token) {
      this.selectedMuralId.next(savedMuralId);
    }

    // Inicializar socket y escuchar eventos de tema
    this.initializeSocket();

    // Re-initialize socket when auth state changes
    this.authService.isAuthenticated$.subscribe((isAuthenticated: boolean) => {
      if (isAuthenticated) {
        this.initializeSocket();
      } else {
        this.disconnectSocket();
      }
    });
  }

  private initializeSocket() {
    // Desconectar socket existente si hay alguno
    this.disconnectSocket();
    
    const token = this.authService.getToken();
    if (!token) return;
    
    // Conectar al servidor de socket con opciones mejoradas
    this.socket = io(environment.socketUrl, {
      transports: ['websocket'],
      auth: {
        token
      },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true
    });
    
    // Manejar eventos de conexión
    this.socket.on('connect', () => {
      console.log('Socket connected, authenticating...');
      this.socket?.emit('authenticate', token);
    });
    
    // Manejar respuesta de autenticación
    this.socket.on('authenticated', (response) => {
      console.log('Socket authentication response:', response);
      if (response.success) {
        console.log('Socket authenticated successfully');
        this.setupSocketListeners();
      } else {
        console.error('Socket authentication failed:', response.error);
        // Intentar reconectar en caso de fallo
        setTimeout(() => this.initializeSocket(), 5000);
      }
    });
    
    // Manejar desconexión
    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      // Solo intentar reconectar si no fue una desconexión intencional
      if (reason !== 'io client disconnect') {
        setTimeout(() => this.initializeSocket(), 5000);
      }
    });
    
    // Manejar errores de conexión
    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      // Intentar reconectar en caso de error
      setTimeout(() => this.initializeSocket(), 5000);
    });

    // Manejar reconexión
    this.socket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
      // Re-autenticar después de reconectar
      this.socket?.emit('authenticate', token);
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('Socket reconnection error:', error);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('Socket reconnection failed after all attempts');
    });
  }

  private setupSocketListeners() {
    if (!this.socket) return;

    // Remover listeners anteriores para evitar duplicados
    this.socket.removeAllListeners('mural_theme_update');
    this.socket.removeAllListeners('user_expelled');

    // Escuchar eventos de actualización de tema
    this.socket.on('mural_theme_update', (update: ThemeUpdate) => {
      console.log('Theme update received:', update);
      // Asegurarse de que los tipos de datos sean correctos
      const normalizedUpdate: ThemeUpdate = {
        id_mural: parseInt(update.id_mural.toString()),
        tema: parseInt(update.tema.toString()),
        color_personalizado: update.color_personalizado
      };
      this.themeUpdateSubject.next(normalizedUpdate);
    });

    // Escuchar eventos de expulsión
    this.socket.on('user_expelled', (data: { id_mural: any, mensaje: string }) => {
      console.log('User expelled event received:', data);
      // Si el usuario es expulsado del mural actual, redirigir al home
      const currentMuralId = this.getSelectedMuralId();
      if (currentMuralId === data.id_mural.toString()) {
        this.setSelectedMural(null);
        // Emitir evento para que los componentes puedan reaccionar
        this.themeUpdateSubject.next({ id_mural: data.id_mural, tema: -1 });
      }
      // Emitir evento para actualizar la lista de murales
      this.muralesUpdateSubject.next();
    });
  }

  private disconnectSocket() {
    if (this.socket) {
      // Remover todos los listeners antes de desconectar
      this.socket.removeAllListeners();
      // Desconectar con opción de no reconectar
      this.socket.disconnect();
      this.socket = null;
    }
  }

  setSelectedMural(muralId: any | null) {
    if (muralId) {
      sessionStorage.setItem('selectedMuralId', muralId.toString());
    } else {
      sessionStorage.removeItem('selectedMuralId');
    }
    this.selectedMuralId.next(muralId ? muralId.toString() : null);
  }

  getSelectedMuralId(): string | null {
    return this.selectedMuralId.getValue();
  }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    console.log('Auth token presente:', !!token);
    return new HttpHeaders().set('Authorization', `Bearer ${token || ''}`);
  }

  getMuralesByUsuario(): Observable<Mural[]> {
    return this.http.get<Mural[]>(`${this.apiUrl}/mis-murales`, { headers: this.getHeaders() });
  }

  getPublicMurales(): Observable<Mural[]> {
    return this.http.get<Mural[]>(`${this.apiUrl}/publicos`, { headers: this.getHeaders() });
  }

  getMuralById(id: string): Observable<Mural> {
    return this.http.get<Mural>(`${this.apiUrl}/${id}`, { headers: this.getHeaders() });
  }

  createMural(muralData: CreateMuralData): Observable<any> {
    return this.http.post<any>(this.apiUrl, muralData, { headers: this.getHeaders() });
  }

  updateMural(id: number, muralData: CreateMuralData): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, muralData, { headers: this.getHeaders() });
  }

  deleteMural(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`, { headers: this.getHeaders() });
  }
  
  joinMuralWithCode(code: string): Observable<JoinMuralResponse> {
    return this.http.post<JoinMuralResponse>(`${this.apiUrl}/unirse`, { codigo: code }, { headers: this.getHeaders() });
  }

  joinPublicMural(idMural: any): Observable<{message: string}> {
    return this.http.post<{message: string}>(`${this.apiUrl}/${idMural}/unirse-publico`, {}, { headers: this.getHeaders() });
  }

  abandonarMural(id: number): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${id}/abandonar`, {}, { headers: this.getHeaders() });
  }
  
  transferirPropiedad(id_mural: number, nuevoPropietarioId: number): Observable<any> {
    const headers = this.getHeaders();
    return this.http.post(`${this.apiUrl}/${id_mural}/transferir`, { id_nuevo_propietario: nuevoPropietarioId }, { headers });
  }
  
  // Métodos para Publicaciones
  
  getPublicacionesByMural(idMural: number): Observable<Publicacion[]> {
    const headers = this.getHeaders();
    return this.http.get<Publicacion[]>(`${this.apiUrl}/${idMural}/publicaciones`, { headers });
  }
  
  getPublicacionById(idPublicacion: number): Observable<Publicacion> {
    const headers = this.getHeaders();
    return this.http.get<Publicacion>(`${this.apiUrl}/publicaciones/${idPublicacion}`, { headers });
  }
  
  createPublicacion(idMural: number, publicacionData: CreatePublicacionData): Observable<Publicacion> {
    const headers = this.getHeaders();
    return this.http.post<Publicacion>(`${this.apiUrl}/${idMural}/publicaciones`, publicacionData, { headers });
  }
  
  updatePublicacion(publicacionId: number, data: { titulo: string; descripcion: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/publicaciones/${publicacionId}`, data);
  }
  
  // Métodos para Contenido
  
  addContenido(idPublicacion: number, contenidoData: CreateContenidoData): Observable<Contenido> {
    const headers = this.getHeaders();
    return this.http.post<Contenido>(`${this.apiUrl}/publicaciones/${idPublicacion}/contenido`, contenidoData, { headers });
  }
  
  updateContenido(publicacionId: number, data: { tipo_contenido: string; url_contenido?: string; texto?: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/publicaciones/${publicacionId}/contenido`, data);
  }
  
  // Método para subir archivos
  uploadFile(idPublicacion: number, file: File): Observable<FileUploadResponse> {
    const headers = this.getHeaders();
    const formData = new FormData();
    formData.append('archivo', file);
    
    return this.http.post<FileUploadResponse>(
      `${this.uploadUrl}/publicaciones/${idPublicacion}`, 
      formData, 
      { headers }
    );
  }

  // Like methods
  getBulkLikesData(publicacionIds: number[]): Observable<{counts: {[key: number]: number}, userLikes: {[key: number]: boolean}}> {
    const headers = this.getHeaders();
    return this.http.post<{counts: {[key: number]: number}, userLikes: {[key: number]: boolean}}>(
      `${environment.apiUrl}/likes/bulk`,
      { publicacionIds },
      { headers }
    );
  }

  toggleLike(publicacionId: number): Observable<any> {
    const headers = this.getHeaders();
    return this.http.post(`${environment.apiUrl}/likes/toggle/${publicacionId}`, {}, { headers });
  }

  getLikesCount(publicacionId: number): Observable<{count: number}> {
    const headers = this.getHeaders();
    return this.http.get<{count: number}>(`${environment.apiUrl}/likes/count/${publicacionId}`, { headers });
  }

  checkUserLike(publicacionId: number): Observable<{liked: boolean}> {
    const headers = this.getHeaders();
    return this.http.get<{liked: boolean}>(`${environment.apiUrl}/likes/check/${publicacionId}`, { headers });
  }

  deletePublicacion(publicacionId: number): Observable<any> {
    const headers = this.getHeaders();
    return this.http.delete(`${this.apiUrl}/publicaciones/${publicacionId}`, { headers });
  }

  getCurrentUserId(): Observable<number> {
    const headers = this.getHeaders();
    return this.http.get<{id_usuario: number}>(`${environment.apiUrl}/auth/current-user`, { headers }).pipe(
      map(response => response.id_usuario)
    );
  }

  getMuralUsers(muralId: number): Observable<MuralUser[]> {
    const headers = this.getHeaders();
    return this.http.get<MuralUser[]>(`${this.apiUrl}/${muralId}/usuarios`, { headers });
  }

  getUsuariosByMural(muralId: number): Observable<MuralUser[]> {
    return this.getMuralUsers(muralId);
  }

  updateUserRole(muralId: number, userId: number, newRole: string): Observable<any> {
    const headers = this.getHeaders();
    return this.http.put(`${this.apiUrl}/${muralId}/usuarios/${userId}/rol`, { rol: newRole }, { headers });
  }

  // Método para actualizar el tema del mural
  updateMuralTheme(muralId: number, themeData: UpdateThemeData): Observable<any> {
    const headers = this.getHeaders();
    return this.http.put(`${this.apiUrl}/${muralId}/tema`, themeData, { headers }).pipe(
      map(response => {
        // Emitir el evento localmente también para asegurar la actualización inmediata
        this.themeUpdateSubject.next({
          id_mural: muralId,
          tema: themeData.tema,
          color_personalizado: themeData.color_personalizado
        });
        return response;
      })
    );
  }

  // Método para expulsar a un usuario del mural
  expulsarUsuario(muralId: number, userId: number): Observable<any> {
    const headers = this.getHeaders();
    return this.http.delete(`${this.apiUrl}/${muralId}/usuarios/${userId}/expulsar`, { headers }).pipe(
      tap(() => {
        // Emitir evento para actualizar la lista de murales
        this.muralesUpdateSubject.next();
      })
    );
  }
} 