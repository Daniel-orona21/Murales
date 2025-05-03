import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';


export interface Comentario {
  id_comentario: number;
  id_publicacion: number;
  id_usuario: number;
  contenido: string;
  fecha_creacion: string;
  nombre_usuario: string;
  avatar_url?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ComentarioService {
  private apiUrl = `${environment.apiUrl}/comentarios`;

  constructor(private http: HttpClient) { }

  getComentariosPublicacion(idPublicacion: number): Observable<Comentario[]> {
    return this.http.get<Comentario[]>(`${this.apiUrl}/publicacion/${idPublicacion}`);
  }

  agregarComentario(idPublicacion: number, contenido: string): Observable<Comentario> {
    return this.http.post<Comentario>(this.apiUrl, {
      id_publicacion: idPublicacion,
      contenido: contenido
    });
  }

  eliminarComentario(idComentario: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${idComentario}`);
  }
} 