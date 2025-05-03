import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { map } from 'rxjs/operators';

export interface Mural {
  id_mural: number;
  titulo: string;
  descripcion: string;
  privacidad: string;
  fecha_creacion: string;
  codigo_acceso?: string;
  rol_usuario?: string;
}

export interface CreateMuralData {
  titulo: string;
  descripcion: string;
  privacidad: string;
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

@Injectable({
  providedIn: 'root'
})
export class MuralService {
  private apiUrl = `${environment.apiUrl}/murales`;
  private uploadUrl = `${environment.apiUrl}/uploads`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    console.log('Auth token presente:', !!token);
    return new HttpHeaders().set('x-auth-token', token || '');
  }

  getMuralesByUsuario(): Observable<Mural[]> {
    const headers = this.getHeaders();
    return this.http.get<Mural[]>(`${this.apiUrl}/usuario`, {
      headers: headers
    });
  }

  getMuralById(id: number): Observable<Mural> {
    const headers = this.getHeaders();
    return this.http.get<Mural>(`${this.apiUrl}/${id}`, {
      headers: headers
    });
  }

  createMural(muralData: CreateMuralData): Observable<any> {
    const headers = this.getHeaders();
    return this.http.post(`${this.apiUrl}`, muralData, {
      headers: headers
    });
  }

  updateMural(id: number, muralData: CreateMuralData): Observable<any> {
    const headers = this.getHeaders();
    return this.http.put(`${this.apiUrl}/${id}`, muralData, { headers });
  }

  deleteMural(id: number): Observable<any> {
    const headers = this.getHeaders();
    return this.http.delete(`${this.apiUrl}/${id}`, { headers });
  }
  
  joinMuralWithCode(code: string): Observable<JoinMuralResponse> {
    const headers = this.getHeaders();
    console.log('Código de acceso:', code);
    // Asegurarnos de que la URL sea correcta
    return this.http.post<JoinMuralResponse>(`${environment.apiUrl}/murales/join`, { codigo_acceso: code }, { headers });
  }
  
  abandonarMural(id: number): Observable<any> {
    const headers = this.getHeaders();
    return this.http.delete(`${this.apiUrl}/${id}/abandonar`, { headers });
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
} 