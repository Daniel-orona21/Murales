import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface Mural {
  id_mural: number;
  titulo: string;
  descripcion: string;
  privacidad: string;
  fecha_creacion: string;
  codigo_acceso?: string;
}

export interface CreateMuralData {
  titulo: string;
  descripcion: string;
  privacidad: string;
}

@Injectable({
  providedIn: 'root'
})
export class MuralService {
  private apiUrl = `${environment.apiUrl}/murales`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'x-auth-token': token || ''
    });
  }

  getMuralesByUsuario(): Observable<Mural[]> {
    const headers = this.getHeaders();
    return this.http.get<Mural[]>(`${this.apiUrl}/usuario`, {
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
} 